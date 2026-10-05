import argparse
import asyncio
import logging
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path


def _prepare_import_path() -> None:
    api_dir = Path(__file__).resolve().parent.parent
    if str(api_dir) not in sys.path:
        sys.path.insert(0, str(api_dir))


_prepare_import_path()

from app.audit.events import AuditRecord
from app.audit.sink import record_event
from app.config import settings
from app.database import async_session_maker, engine
from app.models.audit_events import AUDIT_DECISION_ALLOWED
from app.repos.audit import count_events, delete_events_before
from app.repos.sandbox_runs import (
    count_runs as count_sandbox_runs,
)
from app.repos.sandbox_runs import (
    delete_runs_before as delete_sandbox_runs_before,
)

logger = logging.getLogger(__name__)


async def async_main(dry_run: bool) -> int:
    retention_days = settings.audit_retention_days
    cutoff = datetime.now(UTC) - timedelta(days=retention_days)

    sandbox_retention_days = settings.sandbox_run_retention_days
    sandbox_cutoff = datetime.now(UTC) - timedelta(days=sandbox_retention_days)

    exit_code = 0
    try:
        async with async_session_maker() as session:
            # Audit runs
            try:
                eligible_count = await count_events(session, end=cutoff)

                if eligible_count == 0:
                    print(
                        f"No audit records older than {retention_days} days (cutoff: {cutoff.isoformat()})."
                    )
                elif dry_run:
                    print(
                        f"[DRY-RUN] {eligible_count} audit records are older than {retention_days} days and eligible for deletion."
                    )
                else:
                    print(
                        f"Deleting up to {eligible_count} audit records older than {retention_days} days..."
                    )

                    deleted = await delete_events_before(session, cutoff=cutoff)
                    await session.commit()

                    await record_event(
                        AuditRecord(
                            action="audit.retention",
                            decision=AUDIT_DECISION_ALLOWED,
                            status="ok",
                            reason=f"deleted={deleted}",
                        ),
                        required=False,
                    )

                    print(f"Successfully deleted {deleted} audit records.")
            except Exception:
                await session.rollback()
                print(
                    "An error occurred while cleaning up audit records. Check logs for details."
                )
                logger.exception("Audit cleanup failed.")
                exit_code = 1

            # Sandbox runs
            try:
                sandbox_eligible_count = await count_sandbox_runs(
                    session, end=sandbox_cutoff
                )

                if sandbox_eligible_count == 0:
                    print(
                        f"No sandbox records older than {sandbox_retention_days} days (cutoff: {sandbox_cutoff.isoformat()})."
                    )
                elif dry_run:
                    print(
                        f"[DRY-RUN] {sandbox_eligible_count} sandbox records are older than {sandbox_retention_days} days and eligible for deletion."
                    )
                else:
                    print(
                        f"Deleting up to {sandbox_eligible_count} sandbox records older than {sandbox_retention_days} days..."
                    )

                    sandbox_deleted = await delete_sandbox_runs_before(
                        session, cutoff=sandbox_cutoff
                    )
                    await session.commit()

                    await record_event(
                        AuditRecord(
                            action="sandbox.retention",
                            decision=AUDIT_DECISION_ALLOWED,
                            status="ok",
                            reason=f"deleted={sandbox_deleted}",
                        ),
                        required=False,
                    )

                    print(f"Successfully deleted {sandbox_deleted} sandbox records.")
            except Exception:
                print(
                    "An error occurred while cleaning up sandbox records. Check logs for details."
                )
                logger.exception("Sandbox cleanup failed.")
                exit_code = 1

        return exit_code
    finally:
        await engine.dispose()


def main():
    parser = argparse.ArgumentParser(
        description="Clean up old audit and sandbox records based on retention policy."
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
