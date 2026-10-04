import argparse
import asyncio
import logging
import sys
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select

logger = logging.getLogger(__name__)

from app.config import settings
from app.database import async_session_maker, engine
from app.models.audit_events import AuditEvent
from app.repos.audit import delete_events_before


async def async_main(dry_run: bool) -> int:
    retention_days = settings.audit_retention_days
    cutoff = datetime.now(UTC) - timedelta(days=retention_days)

    try:
        async with async_session_maker() as session:
            # First calculate how many records will be deleted
            count_stmt = (
                select(func.count())
                .select_from(AuditEvent)
                .where(AuditEvent.created_at < cutoff)
            )
            count_res = await session.execute(count_stmt)
            eligible_count = int(count_res.scalar_one())

            if eligible_count == 0:
                print(
                    f"No audit records older than {retention_days} days (cutoff: {cutoff.isoformat()})."
                )
                return 0

            if dry_run:
                print(
                    f"[DRY-RUN] {eligible_count} audit records are older than {retention_days} days and eligible for deletion."
                )
                return 0

            # Actually delete
            print(
                f"Deleting up to {eligible_count} audit records older than {retention_days} days..."
            )
            async with session.begin():
                deleted = await delete_events_before(session, cutoff=cutoff)

            print(f"Successfully deleted {deleted} audit records.")
            return 0
    except Exception:
        print(
            "An error occurred while cleaning up audit records. Check logs for details."
        )
        logger.exception("Audit cleanup failed.")
        return 1
    finally:
        await engine.dispose()


def main():
    parser = argparse.ArgumentParser(
        description="Clean up old audit records based on retention policy."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview how many records would be deleted without actually deleting them.",
    )
    args = parser.parse_args()

    exit_code = asyncio.run(async_main(args.dry_run))
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
