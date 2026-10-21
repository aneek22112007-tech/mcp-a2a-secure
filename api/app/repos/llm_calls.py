"""Async persistence and query helpers for LLM calls."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import case, delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import async_session_maker
from app.models.llm_calls import LLMCall


async def list_llm_calls(
    session: AsyncSession,
    *,
    provider: str | None = None,
    status: str | None = None,
    key_prefix: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[LLMCall], int]:
    """Return paginated LLM calls ordered newest-first, plus total count."""

    limit = max(1, min(limit, 200))
    offset = max(0, offset)

    filters = []
    if provider:
        filters.append(LLMCall.provider == provider)
    if status:
        filters.append(LLMCall.status == status)
    if key_prefix:
        filters.append(LLMCall.key_prefix == key_prefix)

    count_stmt = select(func.count()).select_from(LLMCall)
    if filters:
        count_stmt = count_stmt.where(*filters)
    total_res = await session.execute(count_stmt)
    total = total_res.scalar_one() or 0

    query = (
        select(LLMCall)
        .order_by(LLMCall.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    if filters:
        query = query.where(*filters)

    items_res = await session.execute(query)
    items = list(items_res.scalars().all())
    return items, total


async def get_llm_metrics(
    session: AsyncSession,
    *,
    provider: str | None = None,
    status: str | None = None,
    key_prefix: str | None = None,
) -> dict:
    """Compute aggregate metrics for LLM calls."""

    filters = []
    if provider:
        filters.append(LLMCall.provider == provider)
    if status:
        filters.append(LLMCall.status == status)
    if key_prefix:
        filters.append(LLMCall.key_prefix == key_prefix)

    fallback_cond = (LLMCall.is_fallback.is_(True)) | (LLMCall.status == "fallback")

    stmt = select(
        func.count().label("call_count"),
        func.avg(LLMCall.latency_ms).label("avg_latency"),
        func.count(case((fallback_cond, 1))).label("fallback_count"),
    ).select_from(LLMCall)

    if filters:
        stmt = stmt.where(*filters)

    res = await session.execute(stmt)
    row = res.one()

    call_count = row.call_count or 0
    avg_latency = round(float(row.avg_latency), 2) if (row.avg_latency is not None and call_count > 0) else 0.0
    fallback_count = row.fallback_count or 0
    fallback_rate = round(fallback_count / call_count, 4) if call_count > 0 else 0.0

    return {
        "call_count": call_count,
        "average_latency": avg_latency,
        "avg_latency_ms": avg_latency,
        "fallback_rate": fallback_rate,
        "fallback_count": fallback_count,
    }


async def delete_llm_calls_before(session: AsyncSession, cutoff: datetime) -> int:
    """Delete LLM calls created before the cutoff datetime."""

    if cutoff.tzinfo is None:
        cutoff = cutoff.replace(tzinfo=UTC)

    stmt = delete(LLMCall).where(LLMCall.created_at < cutoff)
    result = await session.execute(stmt)
    return int(result.rowcount or 0)


async def cleanup_old_llm_calls(
    db: AsyncSession | None = None,
    retention_days: int = 30,
) -> int:
    """Delete LLM calls older than retention_days (default: 30 days)."""

    cutoff = datetime.now(UTC) - timedelta(days=retention_days)
    if db is not None:
        return await delete_llm_calls_before(db, cutoff)

    async with async_session_maker() as session, session.begin():
        return await delete_llm_calls_before(session, cutoff)
