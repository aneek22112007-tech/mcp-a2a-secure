"""Run the notes tools in a worker thread. Same budget as Docker, no isolation."""

from __future__ import annotations

import asyncio
import time
from pathlib import Path
from typing import Any

import anyio

from app.config import settings
from app.sandbox.context import ExecutionContext
from app.sandbox.errors import SandboxTimeoutError, SandboxToolError
from app.sandbox.executor import ExecutorStats, _limits, current_deadline
from app.sandbox.types import (
    ERROR_TOOL_INTERNAL,
    MODE_INPROCESS,
    SandboxHealth,
)
from app.tools.notes import list_notes, read_note, write_note


def notes_directory() -> Path:
    """Notes directory at call time.

    Tests replace ``app.mcp_server.NOTES_DIR`` after import, so this cannot
    cache the path.
    """

    from app.mcp_server import NOTES_DIR

    return NOTES_DIR


def _invoke(tool_name: str, args: dict[str, Any], notes_dir: Path) -> Any:
    if tool_name == "list_notes":
        if args:
            raise ValueError("Invalid tool arguments.")
        return list_notes(notes_dir)
    if tool_name == "read_note":
        if set(args) != {"name"}:
            raise ValueError("Invalid tool arguments.")
        return read_note(notes_dir, args["name"])
    if tool_name == "write_note":
        if set(args) != {"name", "content"} or not isinstance(args.get("content"), str):
            raise ValueError("Invalid tool arguments.")
        from app.mcp_server import ensure_notes_dir

        ensure_notes_dir()
        return write_note(notes_directory(), args["name"], args["content"])
    raise SandboxToolError(ERROR_TOOL_INTERNAL)


class InProcessExecutor:
    mode = MODE_INPROCESS

    def __init__(self) -> None:
        self.stats = ExecutorStats()

    async def execute(
        self,
        tool_name: str,
        args: dict[str, Any],
        context: ExecutionContext,
    ) -> Any:
        del context
        remaining = current_deadline() - time.monotonic()
        if remaining <= 0:
            raise SandboxTimeoutError()

        def _run() -> Any:
            return _invoke(tool_name, args, notes_directory())

        try:
            return await asyncio.wait_for(
                anyio.to_thread.run_sync(_run, abandon_on_cancel=True),
                timeout=remaining,
            )
        except TimeoutError:
            raise SandboxTimeoutError() from None

    async def health(self) -> SandboxHealth:
        return SandboxHealth(
            mode=MODE_INPROCESS,
            available=True,
            reason=None,
            image=settings.sandbox_image,
            image_present=False,
            docker_server_version=None,
            active_runs=self.stats.active,
            max_concurrent=settings.sandbox_max_concurrent,
            limits=_limits(),
        )

    def snapshot(self) -> dict[str, Any]:
        return self.stats.snapshot(MODE_INPROCESS)
