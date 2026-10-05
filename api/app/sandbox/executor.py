"""Shared sandbox execution: policy, concurrency, recording, and output cap."""

from __future__ import annotations

import asyncio
import json
import logging
import time
import uuid
from contextvars import ContextVar
from datetime import UTC, datetime
from typing import Any, Protocol

from app.audit.redaction import args_fingerprint
from app.config import settings
from app.sandbox.context import ExecutionContext, resolve_execution_context
from app.sandbox.errors import (
    SandboxBusyError,
    SandboxError,
    SandboxOutputError,
    SandboxTimeoutError,
    SandboxToolError,
    SandboxUnavailableError,
)
from app.sandbox.policy import TOOL_POLICIES
from app.sandbox.recorder import get_run_recorder
from app.sandbox.types import (
    ERROR_BUSY,
    ERROR_CANCELLED,
    ERROR_OUTPUT_TOO_LARGE,
    ERROR_PROTOCOL_ERROR,
    ERROR_TIMEOUT,
    ERROR_TOOL_INTERNAL,
    ERROR_TOOL_INVALID_ARGUMENT,
    ERROR_TOOL_NOT_FOUND,
    MODE_DOCKER,
    MODE_INPROCESS,
    RUN_STATUS_ABANDONED,
    RUN_STATUS_CANCELLED,
    RUN_STATUS_FAILED,
    RUN_STATUS_REJECTED,
    RUN_STATUS_SUCCEEDED,
    RUN_STATUS_TIMEOUT,
    RUN_STATUS_UNAVAILABLE,
    SandboxHealth,
    SandboxRunFinish,
    SandboxRunStart,
)

logger = logging.getLogger(__name__)

_RECORD_TIMEOUT_S = 1.0
_run_id_var: ContextVar[str | None] = ContextVar(
    "mcp_guard_sandbox_run_id", default=None
)
_deadline_var: ContextVar[float | None] = ContextVar(
    "mcp_guard_sandbox_deadline",
    default=None,
)
_executors: dict[str, ToolExecutor] = {}
_override: ToolExecutor | None = None
_warned_inprocess = False


class ToolExecutor(Protocol):
    """One sandbox backend. ``snapshot`` never calls Docker."""

    async def execute(
        self,
        tool_name: str,
        args: dict[str, Any],
        context: ExecutionContext,
    ) -> Any: ...

    async def health(self) -> SandboxHealth: ...

    def snapshot(self) -> dict[str, Any]: ...


class ExecutorStats:
    """In-memory counters for one executor instance."""

    def __init__(self) -> None:
        limit = settings.sandbox_max_concurrent
        self.active = 0
        self.busy = 0
        self.timeout = 0
        self.unavailable = 0
        self._limit = limit
        self._semaphore = asyncio.Semaphore(limit)

    def semaphore(self) -> asyncio.Semaphore:
        limit = settings.sandbox_max_concurrent
        if limit != self._limit:
            self._limit = limit
            self._semaphore = asyncio.Semaphore(limit)
        return self._semaphore

    def snapshot(self, mode: str) -> dict[str, Any]:
        return {
            "mode": mode,
            "active": self.active,
            "max_concurrent": settings.sandbox_max_concurrent,
            "busy": self.busy,
            "timeout": self.timeout,
            "unavailable": self.unavailable,
        }


def current_run_id() -> str:
    run_id = _run_id_var.get()
    if not run_id:
        raise RuntimeError("sandbox run id is not bound")
    return run_id


def current_deadline() -> float:
    deadline = _deadline_var.get()
    if deadline is None:
        return time.monotonic() + settings.sandbox_timeout_s
    return deadline


def _warn_inprocess_once() -> None:
    global _warned_inprocess
    if _warned_inprocess:
        return
    _warned_inprocess = True
    logger.warning("SANDBOX_MODE=inprocess executes tools in-process with no isolation")


def get_executor() -> ToolExecutor:
    """Return the executor for the current ``settings.sandbox_mode``.

    The mode is read on every call. One executor is cached per mode.
    """

    if _override is not None:
        return _override
    mode = settings.sandbox_mode
    cached = _executors.get(mode)
    if cached is None:
        if mode == MODE_INPROCESS:
            from app.sandbox.inprocess import InProcessExecutor

            cached = InProcessExecutor()
        elif mode == MODE_DOCKER:
            from app.sandbox.docker import DockerExecutor

            cached = DockerExecutor()
        else:
            raise RuntimeError("unsupported sandbox mode")
        _executors[mode] = cached
    if mode == MODE_INPROCESS:
        _warn_inprocess_once()
    return cached


def set_executor(executor: ToolExecutor | None) -> None:
    global _override
    _override = executor


def clear_executor_cache() -> None:
    """Drop cached executors and any test override."""

    global _override
    _executors.clear()
    _override = None


def _limits() -> dict[str, Any]:
    return {
        "timeout_s": settings.sandbox_timeout_s,
        "memory": settings.sandbox_memory,
        "cpus": settings.sandbox_cpus,
        "pids_limit": settings.sandbox_pids_limit,
        "max_file_bytes": settings.sandbox_max_file_bytes,
        "max_output_bytes": settings.sandbox_max_output_bytes,
        "network": settings.sandbox_network,
    }


async def _record_start(run: SandboxRunStart) -> None:
    try:
        await asyncio.wait_for(
            get_run_recorder().record_start(run),
            timeout=_RECORD_TIMEOUT_S,
        )
    except Exception as exc:  # noqa: BLE001
        logger.error("sandbox record_start failed type=%s", type(exc).__name__)


async def _record_finish(run_id: str, finish: SandboxRunFinish) -> None:
    async def _call() -> None:
        try:
            await asyncio.wait_for(
                get_run_recorder().record_finish(run_id, finish),
                timeout=_RECORD_TIMEOUT_S,
            )
        except Exception as exc:  # noqa: BLE001
            logger.error("sandbox record_finish failed type=%s", type(exc).__name__)

    await asyncio.shield(_call())


def _output_size(result: Any) -> int:
    encoded = json.dumps({"ok": True, "result": result}, ensure_ascii=False).encode(
        "utf-8"
    )
    return len(encoded)


async def run_tool(
    tool_name: str,
    args: dict[str, Any],
    *,
    mcp_context: object | None = None,
) -> Any:
    """Run one tool through the active executor.

    The semaphore wait uses the time left in ``sandbox_timeout_s``. A slot
    that does not open in that budget is rejected as busy. Docker never
    falls back to in-process.
    """

    if not isinstance(args, dict):
        args = {}
    executor = get_executor()
    context = resolve_execution_context(mcp_context)
    stats = getattr(executor, "stats", None)
    mode = getattr(executor, "mode", settings.sandbox_mode)
    run_id = str(uuid.uuid4())
    started = time.monotonic()
    deadline = started + settings.sandbox_timeout_s
    image = settings.sandbox_image if mode == MODE_DOCKER else None
    start = SandboxRunStart(
        run_id=run_id,
        tool_name=tool_name,
        mode=mode,
        image=image,
        transport=context.transport,
        args_hash=args_fingerprint(args),
        request_id=context.request_id,
        client_id=context.client_id,
        api_key_id=context.api_key_id,
        key_prefix=context.key_prefix,
        audit_event_id=context.audit_event_id,
        started_at=datetime.now(UTC),
    )
    recorded = False

    async def finish(
        status: str,
        *,
        exit_code: int | None = None,
        output_bytes: int = 0,
        error_type: str | None = None,
    ) -> None:
        nonlocal recorded
        if recorded:
            return
        recorded = True
        await _record_finish(
            run_id,
            SandboxRunFinish(
                status=status,
                exit_code=exit_code,
                duration_ms=int((time.monotonic() - started) * 1000),
                output_bytes=output_bytes,
                error_type=error_type,
                finished_at=datetime.now(UTC),
            ),
        )

    if tool_name not in TOOL_POLICIES:
        await _record_start(start)
        await finish(RUN_STATUS_REJECTED, error_type=ERROR_TOOL_NOT_FOUND)
        raise SandboxToolError(ERROR_TOOL_NOT_FOUND)

    remaining = deadline - time.monotonic()
    sem = stats.semaphore() if isinstance(stats, ExecutorStats) else None
    acquired = False
    if sem is None:
        await _record_start(start)
        id_token = _run_id_var.set(run_id)
        deadline_token = _deadline_var.set(deadline)
        try:
            try:
                return await _execute_bound(
                    executor,
                    tool_name,
                    args,
                    context,
                    run_id,
                    deadline,
                    finish,
                    stats,
                )
            finally:
                if not recorded:
                    await finish(RUN_STATUS_ABANDONED, error_type=ERROR_TOOL_INTERNAL)
        finally:
            _run_id_var.reset(id_token)
            _deadline_var.reset(deadline_token)

    if remaining <= 0:
        stats.busy += 1
        await _record_start(start)
        await finish(RUN_STATUS_REJECTED, error_type=ERROR_BUSY)
        raise SandboxBusyError()

    try:
        await asyncio.wait_for(sem.acquire(), timeout=remaining)
        acquired = True
    except TimeoutError:
        stats.busy += 1
        await _record_start(start)
        await finish(RUN_STATUS_REJECTED, error_type=ERROR_BUSY)
        raise SandboxBusyError() from None

    stats.active += 1
    await _record_start(start)
    id_token = _run_id_var.set(run_id)
    deadline_token = _deadline_var.set(deadline)
    try:
        try:
            result = await _execute_bound(
                executor,
                tool_name,
                args,
                context,
                run_id,
                deadline,
                finish,
                stats,
            )
        finally:
            if not recorded:
                await finish(RUN_STATUS_ABANDONED, error_type=ERROR_TOOL_INTERNAL)
        return result
    finally:
        _run_id_var.reset(id_token)
        _deadline_var.reset(deadline_token)
        stats.active -= 1
        if acquired:
            sem.release()


async def _execute_bound(
    executor: ToolExecutor,
    tool_name: str,
    args: dict[str, Any],
    context: ExecutionContext,
    run_id: str,
    deadline: float,
    finish: Any,
    stats: ExecutorStats | None,
) -> Any:
    del run_id, deadline
    try:
        result = await executor.execute(tool_name, args, context)
    except asyncio.CancelledError:
        if isinstance(stats, ExecutorStats):
            pass
        await finish(RUN_STATUS_CANCELLED, error_type=ERROR_CANCELLED)
        raise
    except SandboxTimeoutError as exc:
        if isinstance(stats, ExecutorStats):
            stats.timeout += 1
        await finish(
            RUN_STATUS_TIMEOUT,
            exit_code=exc.exit_code,
            error_type=ERROR_TIMEOUT,
            output_bytes=exc.output_bytes or 0,
        )
        raise
    except SandboxUnavailableError as exc:
        if isinstance(stats, ExecutorStats):
            stats.unavailable += 1
        await finish(
            RUN_STATUS_UNAVAILABLE,
            exit_code=exc.exit_code,
            error_type=exc.error_type,
            output_bytes=exc.output_bytes or 0,
        )
        raise
    except SandboxBusyError:
        if isinstance(stats, ExecutorStats):
            stats.busy += 1
        await finish(RUN_STATUS_REJECTED, error_type=ERROR_BUSY)
        raise
    except SandboxOutputError as exc:
        await finish(
            RUN_STATUS_FAILED,
            exit_code=exc.exit_code,
            output_bytes=exc.output_bytes or 0,
            error_type=ERROR_OUTPUT_TOO_LARGE,
        )
        raise
    except SandboxToolError as exc:
        await finish(
            RUN_STATUS_FAILED,
            exit_code=exc.exit_code,
            output_bytes=exc.output_bytes or 0,
            error_type=exc.error_type,
        )
        raise
    except FileNotFoundError:
        await finish(RUN_STATUS_FAILED, error_type=ERROR_TOOL_NOT_FOUND)
        raise
    except ValueError:
        await finish(RUN_STATUS_FAILED, error_type=ERROR_TOOL_INVALID_ARGUMENT)
        raise
    except SandboxError as exc:
        await finish(
            RUN_STATUS_FAILED,
            exit_code=exc.exit_code,
            output_bytes=exc.output_bytes or 0,
            error_type=exc.error_type,
        )
        raise
    except Exception as exc:  # noqa: BLE001
        logger.error("sandbox execution failed type=%s", type(exc).__name__)
        await finish(RUN_STATUS_FAILED, error_type=ERROR_TOOL_INTERNAL)
        raise SandboxToolError(ERROR_TOOL_INTERNAL) from None

    try:
        output_bytes = _output_size(result)
    except (TypeError, ValueError):
        await finish(RUN_STATUS_FAILED, error_type=ERROR_PROTOCOL_ERROR)
        raise SandboxToolError(ERROR_PROTOCOL_ERROR) from None
    if output_bytes > settings.sandbox_max_output_bytes:
        await finish(
            RUN_STATUS_FAILED,
            output_bytes=output_bytes,
            error_type=ERROR_OUTPUT_TOO_LARGE,
        )
        raise SandboxOutputError(output_bytes=output_bytes)
    await finish(RUN_STATUS_SUCCEEDED, exit_code=0, output_bytes=output_bytes)
    return result
