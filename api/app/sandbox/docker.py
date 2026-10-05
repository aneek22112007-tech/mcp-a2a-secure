"""Run one tool in a locked-down container. Never falls back to in-process."""

from __future__ import annotations

import asyncio
import json
import logging
import math
import re
import time
from pathlib import Path
from typing import Any

from app.config import settings
from app.sandbox.context import ExecutionContext
from app.sandbox.errors import (
    SandboxOutputError,
    SandboxTimeoutError,
    SandboxToolError,
    SandboxUnavailableError,
)
from app.sandbox.executor import (
    ExecutorStats,
    _limits,
    current_deadline,
    current_run_id,
)
from app.sandbox.policy import TOOL_POLICIES
from app.sandbox.types import (
    ERROR_DOCKER_UNAVAILABLE,
    ERROR_IMAGE_MISSING,
    ERROR_KILLED,
    ERROR_PROTOCOL_ERROR,
    ERROR_TOOL_INTERNAL,
    MODE_DOCKER,
    SandboxHealth,
)

logger = logging.getLogger(__name__)

_HEALTH_TTL_S = 30.0
_PROBE_TIMEOUT_S = 2.0
_KILL_TIMEOUT_S = 5.0
_STDERR_CAP = 8 * 1024
_STDIN_CAP = 256 * 1024
_VERSION_RE = re.compile(r"[A-Za-z0-9_.-]{1,40}")
_INVALID_NAME_RE = re.compile(r"^invalid note name: [^\r\n]{1,300}$")
_DAEMON_MARKERS = (
    b"cannot connect to the docker daemon",
    b"is the docker daemon running",
    b"failed to connect to the docker api",
    b"error during connect",
)
_IMAGE_MARKERS = (
    b"no such image",
    b"unable to find image",
)


class _Probe:
    def __init__(
        self,
        *,
        available: bool,
        reason: str | None,
        image_present: bool,
        version: str | None,
        checked_at: float,
    ) -> None:
        self.available = available
        self.reason = reason
        self.image_present = image_present
        self.version = version
        self.checked_at = checked_at


class DockerExecutor:
    mode = MODE_DOCKER

    def __init__(self) -> None:
        self.stats = ExecutorStats()
        self._probe: _Probe | None = None

    def snapshot(self) -> dict[str, Any]:
        return self.stats.snapshot(MODE_DOCKER)

    async def health(self) -> SandboxHealth:
        now = time.monotonic()
        probe = self._probe
        if probe is None or now - probe.checked_at >= _HEALTH_TTL_S:
            probe = await self._probe_docker()
            self._probe = probe
        return SandboxHealth(
            mode=MODE_DOCKER,
            available=probe.available,
            reason=probe.reason,
            image=settings.sandbox_image,
            image_present=probe.image_present,
            docker_server_version=probe.version,
            active_runs=self.stats.active,
            max_concurrent=settings.sandbox_max_concurrent,
            limits=_limits(),
        )

    async def _probe_docker(self) -> _Probe:
        now = time.monotonic()
        code, stdout = await _capture(
            [
                settings.sandbox_docker_bin,
                "version",
                "--format",
                "{{.Server.Version}}",
            ],
            _PROBE_TIMEOUT_S,
        )
        version = _version_token(stdout)
        if code != 0 or version is None:
            return _Probe(
                available=False,
                reason=ERROR_DOCKER_UNAVAILABLE,
                image_present=False,
                version=None,
                checked_at=now,
            )
        image_code, _image_out = await _capture(
            [
                settings.sandbox_docker_bin,
                "image",
                "inspect",
                settings.sandbox_image,
            ],
            _PROBE_TIMEOUT_S,
        )
        if image_code != 0:
            return _Probe(
                available=False,
                reason=ERROR_IMAGE_MISSING,
                image_present=False,
                version=version,
                checked_at=now,
            )
        return _Probe(
            available=True,
            reason=None,
            image_present=True,
            version=version,
            checked_at=now,
        )

    async def execute(
        self,
        tool_name: str,
        args: dict[str, Any],
        context: ExecutionContext,
    ) -> Any:
        del context
        policy = TOOL_POLICIES.get(tool_name)
        if policy is None:
            raise SandboxToolError(ERROR_TOOL_INTERNAL)
        remaining = current_deadline() - time.monotonic()
        if remaining <= 0:
            raise SandboxTimeoutError()
        run_id = current_run_id()
        payload = json.dumps(
            {"tool": tool_name, "args": args},
            ensure_ascii=False,
            separators=(",", ":"),
        ).encode("utf-8")
        if len(payload) > _STDIN_CAP:
            raise SandboxToolError(ERROR_PROTOCOL_ERROR)
        argv = _run_argv(run_id, policy.notes_mount, remaining)
        try:
            proc = await asyncio.create_subprocess_exec(
                *argv,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
        except OSError:
            raise SandboxUnavailableError(error_type=ERROR_DOCKER_UNAVAILABLE) from None
        assert proc.stdin is not None
        assert proc.stdout is not None
        assert proc.stderr is not None
        try:
            proc.stdin.write(payload)
            await proc.stdin.drain()
        except (BrokenPipeError, ConnectionResetError):
            pass
        else:
            proc.stdin.close()
            try:
                await proc.stdin.wait_closed()
            except (BrokenPipeError, ConnectionResetError):
                pass

        cap = settings.sandbox_max_output_bytes + 1
        stdout_task = asyncio.create_task(_read_capped(proc.stdout, cap))
        stderr_task = asyncio.create_task(_read_bounded(proc.stderr, _STDERR_CAP))
        wait_task = asyncio.create_task(proc.wait())

        async def _fail_closed() -> None:
            await _stop(proc, run_id, stdout_task, stderr_task, wait_task)

        budget = current_deadline() - time.monotonic()
        if budget <= 0:
            await _fail_closed()
            raise SandboxTimeoutError(exit_code=124)
        try:
            done, _pending = await asyncio.wait(
                {wait_task, stdout_task},
                timeout=budget,
                return_when=asyncio.FIRST_COMPLETED,
            )
        except asyncio.CancelledError:
            await _fail_closed()
            raise
        if not done:
            await _fail_closed()
            raise SandboxTimeoutError(exit_code=124)

        try:
            if stdout_task in done:
                stdout, too_big = stdout_task.result()
            else:
                stdout, too_big = await _wait_bounded(stdout_task)
            if too_big:
                await _fail_closed()
                raise SandboxOutputError(output_bytes=len(stdout))
            if wait_task in done:
                code = wait_task.result()
            else:
                code = await _wait_bounded(wait_task)
        except TimeoutError:
            await _fail_closed()
            raise SandboxTimeoutError(exit_code=124) from None
        except asyncio.CancelledError:
            await _fail_closed()
            raise

        stderr = await _stderr_bytes(stderr_task)
        if stderr:
            logger.warning(
                "sandbox stderr_bytes=%s run_id=%s",
                len(stderr),
                run_id,
            )
        return _interpret(code, stdout, stderr)


def _run_argv(run_id: str, notes_mount: str, timeout_s: float) -> list[str]:
    deadline_s = max(1, math.ceil(timeout_s))
    return [
        settings.sandbox_docker_bin,
        "run",
        "--rm",
        "-i",
        "--pull",
        "never",
        "--name",
        f"mcpg-run-{run_id}",
        "--label",
        "mcp_guard.sandbox=1",
        "--label",
        f"mcp_guard.run_id={run_id}",
        "--network",
        settings.sandbox_network,
        "--read-only",
        "--tmpfs",
        "/tmp:rw,noexec,nosuid,nodev,size=16m",
        "--cap-drop",
        "ALL",
        "--security-opt",
        "no-new-privileges",
        "--pids-limit",
        str(settings.sandbox_pids_limit),
        "--memory",
        settings.sandbox_memory,
        "--memory-swap",
        settings.sandbox_memory,
        "--cpus",
        _cpu_arg(settings.sandbox_cpus),
        "--ulimit",
        "nofile=64:64",
        "--ulimit",
        f"fsize={settings.sandbox_max_file_bytes}",
        "--user",
        settings.sandbox_run_as,
        "--workdir",
        "/opt/runner",
        "--log-driver",
        "none",
        "--env",
        "MCPG_NOTES_DIR=/notes",
        "--env",
        f"MCPG_DEADLINE_S={deadline_s}",
        "--mount",
        _mount_spec(notes_mount),
        settings.sandbox_image,
    ]


def _bind_source_is_unsafe(path: str) -> bool:
    return any(char in path for char in (",", "=", "\n", "\r"))


def _mount_spec(notes_mount: str) -> str:
    from app.mcp_server import ensure_notes_dir

    ensure_notes_dir()
    source = settings.sandbox_notes_source
    if source is not None and source.startswith("volume:"):
        volume = source.split(":", 1)[1]
        # Volume names stay on volume:[A-Za-z0-9_.-]+. Anything else can
        # inject mount options, so it never reaches the Docker CLI.
        if re.fullmatch(r"[A-Za-z0-9_.-]+", volume) is None:
            raise SandboxUnavailableError()
        spec = f"type=volume,source={volume},target=/notes"
    else:
        if source is None:
            path = ensure_notes_dir()
        else:
            path = Path(source)
        resolved = path.resolve()
        if _bind_source_is_unsafe(str(path)) or _bind_source_is_unsafe(str(resolved)):
            raise SandboxUnavailableError()
        if source is not None:
            path.mkdir(parents=True, exist_ok=True)
        spec = f"type=bind,source={path},target=/notes"
    if notes_mount != "rw":
        spec += ",readonly"
    return spec


def _cpu_arg(value: float) -> str:
    text = f"{value:.6f}".rstrip("0").rstrip(".")
    return text or "0"


def _version_token(stdout: bytes) -> str | None:
    if not stdout:
        return None
    line = stdout.decode("utf-8", "replace").strip().splitlines()[0].strip()
    if _VERSION_RE.fullmatch(line):
        return line
    return None


def _daemon_down(stderr: bytes) -> bool:
    lowered = stderr.lower()
    return any(marker in lowered for marker in _DAEMON_MARKERS)


def _image_missing(stderr: bytes) -> bool:
    lowered = stderr.lower()
    return any(marker in lowered for marker in _IMAGE_MARKERS)


def _safe_invalid_message(message: object) -> str:
    if message == "Invalid tool arguments.":
        return "Invalid tool arguments."
    if isinstance(message, str) and _INVALID_NAME_RE.fullmatch(message):
        return message
    return "Invalid tool arguments."


def _interpret(code: int | None, stdout: bytes, stderr: bytes) -> Any:
    if code == 124:
        raise SandboxTimeoutError(exit_code=124)
    if code == 137:
        raise SandboxToolError(ERROR_KILLED, exit_code=137)
    if code == 125:
        kind = (
            ERROR_IMAGE_MISSING if _image_missing(stderr) else ERROR_DOCKER_UNAVAILABLE
        )
        raise SandboxUnavailableError(error_type=kind, exit_code=125)
    if code in (126, 127) or _daemon_down(stderr):
        raise SandboxUnavailableError(
            error_type=ERROR_DOCKER_UNAVAILABLE,
            exit_code=code,
        )
    if code != 0:
        raise SandboxToolError(ERROR_PROTOCOL_ERROR, exit_code=code)
    return _parse_stdout(stdout)


def _parse_stdout(raw: bytes) -> Any:
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        raise SandboxToolError(ERROR_PROTOCOL_ERROR) from None
    stripped = text.strip("\r\n")
    if not stripped or "\n" in stripped:
        raise SandboxToolError(ERROR_PROTOCOL_ERROR)
    try:
        payload = json.loads(stripped)
    except json.JSONDecodeError:
        raise SandboxToolError(ERROR_PROTOCOL_ERROR) from None
    if not isinstance(payload, dict):
        raise SandboxToolError(ERROR_PROTOCOL_ERROR)
    if payload.get("ok") is True:
        if "result" not in payload:
            raise SandboxToolError(ERROR_PROTOCOL_ERROR)
        return payload["result"]
    if payload.get("ok") is not False:
        raise SandboxToolError(ERROR_PROTOCOL_ERROR)
    error = payload.get("error")
    if not isinstance(error, dict):
        raise SandboxToolError(ERROR_PROTOCOL_ERROR)
    kind = error.get("type")
    if kind == "invalid_argument":
        raise ValueError(_safe_invalid_message(error.get("message")))
    if kind == "not_found":
        raise FileNotFoundError("Note not found.")
    if kind == "internal":
        raise SandboxToolError(ERROR_TOOL_INTERNAL)
    raise SandboxToolError(ERROR_PROTOCOL_ERROR)


def _seconds_left() -> float:
    return current_deadline() - time.monotonic()


async def _wait_bounded(task: asyncio.Task[Any]) -> Any:
    timeout = _seconds_left()
    if timeout <= 0:
        raise TimeoutError
    return await asyncio.wait_for(task, timeout=timeout)


async def _stderr_bytes(task: asyncio.Task[bytes]) -> bytes:
    """Drain stderr after the process has finished. A slow drain is empty."""

    try:
        return await asyncio.wait_for(task, timeout=1.0)
    except TimeoutError:
        task.cancel()
        return b""


async def _read_capped(stream: asyncio.StreamReader, limit: int) -> tuple[bytes, bool]:
    buf = bytearray()
    while len(buf) <= limit:
        chunk = await stream.read(65536)
        if not chunk:
            return bytes(buf), False
        buf += chunk
        if len(buf) > limit:
            return bytes(buf), True
    return bytes(buf), True


async def _read_bounded(stream: asyncio.StreamReader, limit: int) -> bytes:
    buf = bytearray()
    while True:
        chunk = await stream.read(8192)
        if not chunk:
            break
        if len(buf) < limit:
            buf += chunk[: limit - len(buf)]
    return bytes(buf)


async def _capture(argv: list[str], timeout: float) -> tuple[int | None, bytes]:
    try:
        proc = await asyncio.create_subprocess_exec(
            *argv,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
        )
    except OSError:
        return None, b""
    try:
        stdout, _stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
    except TimeoutError:
        proc.kill()
        try:
            await proc.wait()
        except ProcessLookupError:
            pass
        return None, b""
    return proc.returncode, stdout or b""


async def _docker_cli(argv: list[str], timeout: float) -> int | None:
    try:
        proc = await asyncio.create_subprocess_exec(
            *argv,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
    except OSError:
        return None
    try:
        return await asyncio.wait_for(proc.wait(), timeout=timeout)
    except TimeoutError:
        proc.kill()
        try:
            await proc.wait()
        except ProcessLookupError:
            pass
        return None


async def _kill_container(run_id: str) -> None:
    name = f"mcpg-run-{run_id}"
    binary = settings.sandbox_docker_bin
    code = await _docker_cli([binary, "kill", name], _KILL_TIMEOUT_S)
    if code != 0:
        await _docker_cli([binary, "rm", "-f", name], _KILL_TIMEOUT_S)


async def _stop(
    proc: asyncio.subprocess.Process,
    run_id: str,
    *tasks: asyncio.Task[Any],
) -> None:
    await _kill_container(run_id)
    if proc.returncode is None:
        try:
            proc.kill()
        except ProcessLookupError:
            pass
    for task in tasks:
        if not task.done():
            task.cancel()
    for task in tasks:
        try:
            await task
        except asyncio.CancelledError:
            logger.debug("sandbox task cancelled")
        except Exception as exc:  # noqa: BLE001
            logger.debug("sandbox task ended type=%s", type(exc).__name__)
    if proc.returncode is None:
        try:
            await asyncio.wait_for(proc.wait(), timeout=2)
        except TimeoutError:
            pass
