"""Persistence for validated analyst reports."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import async_session_maker
from app.models.analyst_reports import AnalystReport


async def latest_by_incident(
    session: AsyncSession,
    incident_ids: list[str],
) -> dict[str, AnalystReport]:
    """Newest stored report for each incident id."""

    if not incident_ids:
        return {}
    statement = (
        select(AnalystReport)
        .where(AnalystReport.incident_id.in_(incident_ids))
        .order_by(AnalystReport.created_at.desc(), AnalystReport.id.desc())
    )
    result = await session.execute(statement)
    found: dict[str, AnalystReport] = {}
    for row in result.scalars():
        if row.incident_id not in found:
            found[row.incident_id] = row
    return found


async def add_report(session: AsyncSession, report: AnalystReport) -> AnalystReport:
    session.add(report)
    await session.commit()
    await session.refresh(report)
    return report


async def delete_reports_before(session: AsyncSession, cutoff: datetime) -> int:
    if cutoff.tzinfo is None:
        cutoff = cutoff.replace(tzinfo=UTC)
    statement = delete(AnalystReport).where(AnalystReport.created_at < cutoff)
    result = await session.execute(statement)
    return int(result.rowcount or 0)


async def cleanup_old_analyst_reports(retention_days: int) -> int:
    """Delete reports older than ``retention_days``."""

    cutoff = datetime.now(UTC) - timedelta(days=retention_days)
    async with async_session_maker() as session, session.begin():
        return await delete_reports_before(session, cutoff)
