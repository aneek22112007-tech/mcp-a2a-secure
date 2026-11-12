"""Run upstream MCP tools in locked-down containers.

Containers are isolated with read-only root filesystems, dropped capabilities,
no networking, memory/PID limits, and custom or volume mounts as specified
by each UpstreamSpec.
"""

from __future__ import annotations

import asyncio
import re
import time
import uuid
from typing import Any

from app.audit.events import (
    ACTION_TOOL_PIN_DRIFT,
    STATUS_DENIED,
    AuditRecord,
)
from app.audit.redaction import safe_tool_name
from app.audit.sink import record_event
from app.config import settings
from app.models.audit_events import AUDIT_DECISION_DENIED
from app.sandbox.context import ExecutionContext
from app.sandbox.errors import (
    SandboxOutputError,
    SandboxTimeoutError,
    SandboxToolError,
    SandboxUnavailableError,
    SandboxUpstreamError,
)
from app.sandbox.executor import current_deadline, current_run_id, shared_stats
from app.sandbox.types import (
    ERROR_DOCKER_UNAVAILABLE,
    ERROR_IMAGE_MISSING,
    ERROR_PROTOCOL_ERROR,
    MODE_DOCKER,
)
from app.upstream.filesystem import (
    CONTRACT_CHANGED,
    UPSTREAM_ERROR_PREFIX,
    contract_fingerprint,
)
from app.upstream.registry import get_spec, upstream_tool
from app.upstream.spec import UpstreamSpec
from app.upstream.stdio import StdioMcp

_STDERR_CAP = 8 * 1024
_DAEMON_MARKERS = (
    b"cannot connect to the docker daemon",
    b"is the docker daemon running",
    b"failed to connect to the docker api",
    b"error during connect",
)
_IMAGE_MARKERS = (
    b"no such image",
    b"unable to find image",
    b"pull access denied",
)
_executors: dict[str, UpstreamExecutor] = {}


class UpstreamExecutor:
    """Docker executor for containerized upstream tools."""

    mode = MODE_DOCKER

    def __init__(self, spec: UpstreamSpec | None = None) -> None:
        self.spec = spec
        self.stats = shared_stats()

    async def execute(
        self,
        tool_name: str,
        args: dict[str, Any],
        context: ExecutionContext,
    ) -> str:
        registered = upstream_tool(tool_name)
        if registered is None:
            raise SandboxToolError(ERROR_PROTOCOL_ERROR)
        spec = self.spec or get_spec(registered.spec_id)
        if spec is None:
            raise SandboxToolError(ERROR_PROTOCOL_ERROR)
        spec.check_args(args)
        session = UpstreamSession(
            spec,
            run_id=current_run_id(),
            read_only=registered.read_only,
            deadline=current_deadline(),
        )
        try:
            listed = await session.list_tools()
            live = _find_tool(listed, registered.upstream_name)
            if live is None:
                await _audit_contract(tool_name, context)
                raise SandboxUpstreamError(CONTRACT_CHANGED)
            description = live.get("description")
            schema = live.get("inputSchema")
            if not isinstance(description, str) or not isinstance(schema, dict):
                await _audit_contract(tool_name, context)
                raise SandboxUpstreamError(CONTRACT_CHANGED)
            live_fingerprint = contract_fingerprint(tool_name, description, schema)
            if live_fingerprint != registered.fingerprint:
                await _audit_contract(tool_name, context)
                raise SandboxUpstreamError(CONTRACT_CHANGED)
            result = await session.call_tool(registered.upstream_name, args)
        finally:
            await session.close()
        if result.get("isError") is True:
            text = _content_text(result.get("content"))
            raise SandboxUpstreamError(f"{UPSTREAM_ERROR_PREFIX}{text}")
        return _content_text(result.get("content"))


class UpstreamSession:
    """One container. ``list_tools`` starts it. Further calls reuse it."""

    def __init__(
        self,
        spec: UpstreamSpec | None = None,
        *,
        run_id: str | None = None,
        read_only: bool = True,
        deadline: float | None = None,
    ) -> None:
        if spec is None:
            from app.upstream.filesystem import FILESYSTEM

            spec = FILESYSTEM
        self._spec = spec
        self._run_id = run_id
        self._read_only = read_only
        self._deadline = deadline
        self._proc: asyncio.subprocess.Process | None = None
        self._name: str | None = None
        self._client: StdioMcp | None = None
        self._stderr = bytearray()
        self._stderr_task: asyncio.Task[None] | None = None

    async def list_tools(self) -> list[dict[str, Any]]:
        await self._start()
        assert self._client is not None
        result = await self._request(
            "initialize",
            {
                "protocolVersion": "2025-11-25",
                "capabilities": {},
                "clientInfo": {"name": "mcp-guard", "version": "0.1.0"},
            },
        )
        if not isinstance(result, dict):
            raise SandboxToolError(ERROR_PROTOCOL_ERROR)
        await self._client.notify("notifications/initialized")
        tools: list[dict[str, Any]] = []
        cursor: str | None = None
        while True:
            params: dict[str, Any] = {} if cursor is None else {"cursor": cursor}
            listed = await self._request("tools/list", params)
            page = listed.get("tools") if isinstance(listed, dict) else None
            if not isinstance(page, list):
                raise SandboxToolError(ERROR_PROTOCOL_ERROR)
            tools.extend(item for item in page if isinstance(item, dict))
            next_cursor = listed.get("nextCursor") if isinstance(listed, dict) else None
            if not isinstance(next_cursor, str) or not next_cursor:
                return tools
            cursor = next_cursor

    async def close(self) -> None:
        await self._stop()

    async def call_tool(self, name: str, arguments: dict[str, Any]) -> dict[str, Any]:
        result = await self._request(
            "tools/call",
            {"name": name, "arguments": arguments},
        )
        if not isinstance(result, dict):
            raise SandboxToolError(ERROR_PROTOCOL_ERROR)
        return result

    async def _request(self, method: str, params: dict[str, Any]) -> Any:
        assert self._client is not None
        try:
            return await asyncio.wait_for(
                self._client.request(method, params),
                timeout=_remaining(self._deadline, self._spec.timeout_s()),
            )
        except TimeoutError:
            await self._stop()
            raise SandboxTimeoutError(exit_code=124) from None
        except SandboxToolError:
            code = None
            if self._proc is not None and self._proc.returncode is None:
                try:
                    await asyncio.wait_for(self._proc.wait(), timeout=1)
                except TimeoutError:
                    pass
            if self._proc is not None:
                code = self._proc.returncode
            stderr = bytes(self._stderr)
            await self._stop()
            if code not in (None, 0):
                _raise_startup(code, stderr)
            raise

    async def _start(self) -> None:
        name_id = self._run_id or uuid.uuid4().hex
        self._name = f"{self._spec.container_name_prefix}{name_id}"
        argv = _argv(self._spec, self._name, read_only=self._read_only)
        try:
            self._proc = await asyncio.create_subprocess_exec(
                *argv,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                # One JSON-RPC message per line. The server repeats file text in
                # content and structuredContent, so allow twice the output cap.
                limit=2 * settings.sandbox_max_output_bytes + 65536,
            )
        except OSError:
            raise SandboxUnavailableError(error_type=ERROR_DOCKER_UNAVAILABLE) from None
        assert self._proc.stdin is not None
        assert self._proc.stdout is not None
        assert self._proc.stderr is not None
        self._stderr_task = asyncio.create_task(_drain(self._proc.stderr, self._stderr))
        self._client = StdioMcp(self._proc.stdin, self._proc.stdout)

    async def _stop(self) -> None:
        proc = self._proc
        name = self._name
        self._proc = None
        if proc is not None and proc.returncode is None:
            proc.kill()
            try:
                await asyncio.wait_for(proc.wait(), timeout=2)
            except TimeoutError:
                pass
        if self._stderr_task is not None:
            self._stderr_task.cancel()
            self._stderr_task = None
        if name is not None:
            await _remove_container(name)


async def discover_tools(spec: UpstreamSpec) -> list[dict[str, Any]]:
    """Start one container for the spec, list its tools, and remove the container."""
    session = UpstreamSession(spec, read_only=True)
    try:
        return await session.list_tools()
    finally:
        await session.close()


async def discover_filesystem_tools() -> list[dict[str, Any]]:
    """Start one filesystem container, list its tools, and remove the container."""
    from app.upstream.filesystem import FILESYSTEM

    return await discover_tools(FILESYSTEM)


def get_upstream_executor(spec: UpstreamSpec) -> UpstreamExecutor:
    executor = _executors.get(spec.id)
    if executor is None:
        executor = UpstreamExecutor(spec)
        _executors[spec.id] = executor
    return executor


def get_filesystem_executor() -> UpstreamExecutor:
    from app.upstream.filesystem import FILESYSTEM

    return get_upstream_executor(FILESYSTEM)


# Compatibility aliases
FilesystemExecutor = UpstreamExecutor
FilesystemSession = UpstreamSession


def _argv(
    spec_or_name: UpstreamSpec | str,
    name: str | None = None,
    *,
    read_only: bool = True,
) -> list[str]:
    if isinstance(spec_or_name, str):
        from app.upstream.filesystem import FILESYSTEM

        actual_spec = FILESYSTEM
        container_name = spec_or_name
    else:
        actual_spec = spec_or_name
        container_name = (
            name or f"{actual_spec.container_name_prefix}{uuid.uuid4().hex}"
        )

    cmd = [
        settings.sandbox_docker_bin,
        "run",
        "--rm",
        "-i",
        "--pull",
        "never",
        "--name",
        container_name,
        "--label",
        "mcp_guard.sandbox=1",
        "--label",
        f"mcp_guard.run_id={container_name}",
        "--network",
        "none",
        "--read-only",
        "--tmpfs",
        "/tmp:rw,noexec,nosuid,nodev,size=64m",
        "--cap-drop",
        "ALL",
        "--security-opt",
        "no-new-privileges",
        "--pids-limit",
        str(actual_spec.pids_limit),
        "--memory",
        actual_spec.memory,
        "--memory-swap",
        actual_spec.memory,
        "--cpus",
        _cpu(settings.sandbox_cpus),
        "--ulimit",
        "nofile=256:256",
        "--user",
        settings.sandbox_run_as,
        "--workdir",
        "/tmp",
        "--log-driver",
        "none",
        "--env",
        "HOME=/tmp",
    ]
    mount = actual_spec.mount(read_only)
    if mount is not None:
        cmd.extend(["--mount", mount])
    cmd.append(actual_spec.image())
    cmd.extend(actual_spec.command)
    return cmd


def _cpu(value: float) -> str:
    text = f"{value:.6f}".rstrip("0").rstrip(".")
    return text or "0"


def _unsafe(path: str) -> bool:
    return any(char in path for char in (",", "=", "\n", "\r"))


def _remaining(deadline: float | None, default_timeout_s: float | None = None) -> float:
    if deadline is None:
        return (
            default_timeout_s
            if default_timeout_s is not None
            else settings.upstream_fs_timeout_s
        )
    return max(0.05, deadline - time.monotonic())


async def _drain(stream: asyncio.StreamReader, kept: bytearray) -> None:
    while len(kept) < _STDERR_CAP:
        chunk = await stream.read(1024)
        if not chunk:
            return
        room = _STDERR_CAP - len(kept)
        kept.extend(chunk[:room])
    while await stream.read(4096):
        pass


async def _remove_container(name: str) -> None:
    """Remove the container, retrying while ``docker run`` is still creating it.

    Killing the CLI during create can leave a container in ``Created``. ``--rm``
    does not run in that case, so this keeps asking until the name is gone.
    """
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,127}", name):
        return
    for _ in range(10):
        try:
            proc = await asyncio.create_subprocess_exec(
                settings.sandbox_docker_bin,
                "rm",
                "-f",
                name,
                stdout=asyncio.subprocess.DEVNULL,
                stderr=asyncio.subprocess.DEVNULL,
            )
        except OSError:
            return
        try:
            await asyncio.wait_for(proc.wait(), timeout=5)
        except TimeoutError:
            proc.kill()
            return
        if not await _container_exists(name):
            return
        await asyncio.sleep(0.2)


async def _container_exists(name: str) -> bool:
    try:
        proc = await asyncio.create_subprocess_exec(
            settings.sandbox_docker_bin,
            "inspect",
            name,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
    except OSError:
        return False
    try:
        code = await asyncio.wait_for(proc.wait(), timeout=5)
    except TimeoutError:
        proc.kill()
        return True
    return code == 0


def _find_tool(tools: list[dict[str, Any]], name: str) -> dict[str, Any] | None:
    for tool in tools:
        if tool.get("name") == name:
            return tool
    return None


def _content_text(content: object) -> str:
    if not isinstance(content, list):
        raise SandboxToolError(ERROR_PROTOCOL_ERROR)
    parts: list[str] = []
    for block in content:
        if not isinstance(block, dict):
            continue
        if block.get("type") == "text" and isinstance(block.get("text"), str):
            parts.append(block["text"])
        elif block.get("type") in {"image", "audio"}:
            mime = block.get("mimeType")
            data = block.get("data")
            size = len(data) if isinstance(data, str) else 0
            parts.append(f"[{block['type']} mime={mime} bytes={size}]")
        elif block.get("type") == "resource":
            resource = block.get("resource")
            if isinstance(resource, dict) and isinstance(resource.get("text"), str):
                parts.append(resource["text"])
            else:
                parts.append("[resource]")
    text = "\n".join(parts)
    if len(text.encode("utf-8")) > settings.sandbox_max_output_bytes:
        raise SandboxOutputError(output_bytes=len(text.encode("utf-8")))
    return text


async def _audit_contract(tool_name: str, context: ExecutionContext) -> None:
    await record_event(
        AuditRecord(
            action=ACTION_TOOL_PIN_DRIFT,
            decision=AUDIT_DECISION_DENIED,
            status=STATUS_DENIED,
            tool_name=safe_tool_name(tool_name),
            reason="upstream_contract_changed",
            client_id=context.client_id,
            api_key_id=context.api_key_id,
            key_prefix=context.key_prefix,
            request_id=context.request_id,
        ),
        required=False,
    )


def _raise_startup(code: int | None, stderr: bytes) -> None:
    lowered = stderr.lower()
    if any(marker in lowered for marker in _IMAGE_MARKERS):
        raise SandboxUnavailableError(error_type=ERROR_IMAGE_MISSING, exit_code=code)
    if code in (125, 126, 127) or any(marker in lowered for marker in _DAEMON_MARKERS):
        raise SandboxUnavailableError(
            error_type=ERROR_DOCKER_UNAVAILABLE, exit_code=code
        )
    raise SandboxUpstreamError(
        "Upstream process failed during startup.", exit_code=code
    )


__all__ = [
    "FilesystemExecutor",
    "FilesystemSession",
    "UpstreamExecutor",
    "UpstreamSession",
    "discover_filesystem_tools",
    "discover_tools",
    "get_filesystem_executor",
    "get_upstream_executor",
]
