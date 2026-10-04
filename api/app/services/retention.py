import asyncio
import logging
from datetime import UTC, datetime, timedelta

from app.audit.events import AuditRecord
from app.audit.sink import record_event
from app.config import settings
from app.database import async_session_maker
from app.models.audit_events import AUDIT_DECISION_ALLOWED
from app.repos.audit import delete_events_before

logger = logging.getLogger(__name__)


async def run_retention_cleanup() -> None:
    retention_days = settings.audit_retention_days
    cutoff = datetime.now(UTC) - timedelta(days=retention_days)

    try:
        async with async_session_maker() as session, session.begin():
            deleted = await delete_events_before(session, cutoff=cutoff)
            if deleted > 0:
                logger.info(
                    f"Deleted {deleted} audit records older than {retention_days} days."
                )

                await record_event(
                    AuditRecord(
                        action="audit.retention",
                        decision=AUDIT_DECISION_ALLOWED,
                        status="ok",
                        reason=f"deleted={deleted}",
                    ),
                    required=False,
                )
    except Exception:
        logger.exception("Failed to run retention cleanup")


async def retention_scheduler_task() -> None:
    """Periodically runs the retention cleanup."""
    if not settings.enable_retention_scheduler:
        return

    logger.info("Retention scheduler started.")
    while True:
        try:
            await run_retention_cleanup()
        except asyncio.CancelledError:
            break
        except Exception:
            logger.exception("Unexpected error in retention scheduler")

        # Run once a day
        try:
            await asyncio.sleep(86400)
        except asyncio.CancelledError:
            break

    logger.info("Retention scheduler stopped.")
