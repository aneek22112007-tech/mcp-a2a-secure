"""Best-effort sandbox run recorder.

Recording is bounded to 1 second per call. Exceptions are logged and
swallowed by the executor. ``record_finish`` runs shielded from cancellation.
``run_id`` is a uuid4 made by the executor, not by the recorder.
"""

from __future__ import annotations

import logging
from typing import Protocol

from app.audit.redaction import safe_tool_name
from app.sandbox.types import SandboxRunFinish, SandboxRunStart

logger = logging.getLogger(__name__)


class SandboxRunRecorder(Protocol):
    """Persist the start and finish of one sandbox run.

    Recording is best-effort and bounded to 1 second per call. Exceptions are
    logged and swallowed. ``record_finish`` runs shielded from cancellation.
    ``run_id`` is a uuid4 made by the executor.
    """

    async def record_start(self, run: SandboxRunStart) -> None: ...

    async def record_finish(self, run_id: str, finish: SandboxRunFinish) -> None: ...


class NullRunRecorder:
    """Default recorder. Writes a debug line and does not touch the database."""

    async def record_start(self, run: SandboxRunStart) -> None:
        logger.debug(
            "sandbox record_start run_id=%s tool=%s",
            run.run_id,
            safe_tool_name(run.tool_name),
        )

    async def record_finish(self, run_id: str, finish: SandboxRunFinish) -> None:
        logger.debug(
            "sandbox record_finish run_id=%s status=%s",
            run_id,
            finish.status,
        )


_recorder: SandboxRunRecorder = NullRunRecorder()


def get_run_recorder() -> SandboxRunRecorder:
    return _recorder


def set_run_recorder(recorder: SandboxRunRecorder) -> None:
    global _recorder
    _recorder = recorder
