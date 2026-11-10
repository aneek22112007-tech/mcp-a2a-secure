"""Run one filesystem tool in its own locked-down container.

The container image is the official server. The host directory is mounted at
``/projects``. Read tools get a read-only mount. The container is removed
when the call finishes, including when it times out.
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
)
from app.sandbox.executor import ExecutorStats, current_deadline, current_run_id
from app.sandbox.types import (
    ERROR_DOCKER_UNAVAILABLE,
    ERROR_IMAGE_MISSING,
    ERROR_PROTOCOL_ERROR,
    MODE_DOCKER,
)
from app.upstream.filesystem import (
    CONTRACT_CHANGED,
    MOUNT,
    UPSTREAM_ERROR_PREFIX,
    check_paths,
    contract_fingerprint,
    ensure_shared_dir,
    filesystem_tool,
)
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
_executor: FilesystemExecutor | None = None


class FilesystemExecutor:
    """Docker executor used only for ``fs_`` tools."""

    mode = MODE_DOCKER

    def __init__(self) -> None:
        self.stats = ExecutorStats()

    async def execute(
        self,
        tool_name: str,
        args: dict[str, Any],
        context: ExecutionContext,
    ) -> str:
        registered = filesystem_tool(tool_name)
        if registered is None:
            raise SandboxToolError(ERROR_PROTOCOL_ERROR)
        check_paths(args)
        session = FilesystemSession(
            run_id=current_run_id(),
            read_only=registered.read_only,
            deadline=current_deadline(),
        )
        try:
            listed = await session.list_tools()
            live = _find_tool(listed, registered.upstream_name)
            if live is None:
                await _audit_contract(tool_name, context)
                raise ValueError(CONTRACT_CHANGED)
            description = live.get("description")
            schema = live.get("inputSchema")
            if not isinstance(description, str) or not isinstance(schema, dict):
                await _audit_contract(tool_name, context)
                raise ValueError(CONTRACT_CHANGED)  # noqa: TRY004
            live_fingerprint = contract_fingerprint(tool_name, description, schema)
            if live_fingerprint != registered.fingerprint:
                await _audit_contract(tool_name, context)
                raise ValueError(CONTRACT_CHANGED)
            result = await session.call_tool(registered.upstream_name, args)
        finally:
            await session.close()
        if result.get("isError") is True:
            text = _content_text(result.get("content"))
            raise ValueError(f"{UPSTREAM_ERROR_PREFIX}{text}")
        return _content_text(result.get("content"))


class FilesystemSession:
    """One container. ``list_tools`` starts it. Further calls reuse it."""

    def __init__(
        self,
        *,
        run_id: str | None = None,
        read_only: bool = True,
        deadline: float | None = None,
    ) -> None:
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
                timeout=_remaining(self._deadline),
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
        self._name = f"mcpg-fs-{name_id}"
        argv = _argv(self._name, read_only=self._read_only)
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


async def discover_filesystem_tools() -> list[dict[str, Any]]:
    """Start one container, list its tools, and remove the container."""

    session = FilesystemSession(read_only=True)
    try:
        return await session.list_tools()
    finally:
        await session.close()


def get_filesystem_executor() -> FilesystemExecutor:
    global _executor
    if _executor is None:
        _executor = FilesystemExecutor()
    return _executor


def _argv(name: str, *, read_only: bool) -> list[str]:
    source = ensure_shared_dir().resolve()
    if _unsafe(str(source)):
        raise SandboxUnavailableError()
    mount = f"type=bind,source={source},target={MOUNT}"
    if read_only:
        mount += ",readonly"
    return [
        settings.sandbox_docker_bin,
        "run",
        "--rm",
        "-i",
        "--pull",
        "never",
        "--name",
        name,
        "--label",
        "mcp_guard.sandbox=1",
        "--label",
        f"mcp_guard.run_id={name}",
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
        "128",
        "--memory",
        "256m",
        "--memory-swap",
        "256m",
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
        "--mount",
        mount,
        settings.upstream_fs_image,
        "--confine-roots",
        MOUNT,
    ]


def _cpu(value: float) -> str:
    text = f"{value:.6f}".rstrip("0").rstrip(".")
    return text or "0"


def _unsafe(path: str) -> bool:
    return any(char in path for char in (",", "=", "\n", "\r"))


def _remaining(deadline: float | None) -> float:
    if deadline is None:
        return settings.upstream_fs_timeout_s
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
    raise SandboxToolError(ERROR_PROTOCOL_ERROR)
