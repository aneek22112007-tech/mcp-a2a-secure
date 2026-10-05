"""Sandbox run recording service."""

import logging
from collections import OrderedDict
from datetime import timedelta

from app import database
from app.config import settings
from app.models.base import utc_now
from app.repos.sandbox_runs import (
    finish_run,
    insert_finished_run,
    mark_stale_runs,
    start_run,
)
from app.sandbox.recorder import SandboxRunRecorder
from app.sandbox.types import SandboxRunFinish, SandboxRunStart

logger = logging.getLogger(__name__)


class DbRunRecorder(SandboxRunRecorder):
    def __init__(self) -> None:
        self._starts: OrderedDict[str, SandboxRunStart] = OrderedDict()
        self._max_starts = 1000
        self.failures = 0

    async def record_start(self, run: SandboxRunStart) -> None:
        try:
            self._starts[run.run_id] = run
            if len(self._starts) > self._max_starts:
                self._starts.popitem(last=False)

            async with database.async_session_maker() as session, session.begin():
                await start_run(session, run)
        except Exception as e:  # noqa: BLE001
            self.failures += 1
            logger.error("sandbox record_start failed type=%s", type(e).__name__)

    async def record_finish(self, run_id: str, finish: SandboxRunFinish) -> None:
        try:
            start = self._starts.pop(run_id, None)
            async with database.async_session_maker() as session, session.begin():
                updated = await finish_run(session, run_id, finish)
                if not updated:
                    await insert_finished_run(session, run_id, finish, start)
        except Exception as e:  # noqa: BLE001
            self.failures += 1
            logger.error("sandbox record_finish failed type=%s", type(e).__name__)


async def sweep_stale_runs() -> None:
    older_than = utc_now() - timedelta(seconds=settings.sandbox_timeout_s + 60)
    async with database.async_session_maker() as session, session.begin():
        await mark_stale_runs(session, older_than)
