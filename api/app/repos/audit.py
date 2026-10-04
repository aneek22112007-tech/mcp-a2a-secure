"""Async persistence helpers for audit events."""

from datetime import datetime

from sqlalchemy import case, delete, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_events import (
    AUDIT_DECISION_ALLOWED,
    AUDIT_DECISION_DENIED,
    AuditEvent,
)
from app.repos.common import MAX_PAGE_LIMIT, as_utc, normalize_page, require_text

_DECISIONS = frozenset({AUDIT_DECISION_ALLOWED, AUDIT_DECISION_DENIED})


async def add_event(
    session: AsyncSession,
    *,
    decision: str,
    action: str,
    status: str,
    client_id: str | None = None,
    api_key_id: str | None = None,
    key_prefix: str | None = None,
    tool_name: str | None = None,
    reason: str | None = None,
    status_code: int | None = None,
    duration_ms: float | None = None,
    request_id: str | None = None,
    args_hash: str | None = None,
    error_code: str | None = None,
    created_at: datetime | None = None,
) -> AuditEvent:
    event = AuditEvent(
        decision=_decision(decision),
        action=require_text(action, field="action", max_length=100),
        status=require_text(status, field="status", max_length=50),
        client_id=client_id,
        api_key_id=api_key_id,
        key_prefix=_optional_text(key_prefix, field="key_prefix", max_length=20),
        tool_name=_optional_text(tool_name, field="tool_name", max_length=100),
        reason=_optional_text(reason, field="reason", max_length=4000),
        status_code=_status_code(status_code),
        duration_ms=_duration(duration_ms),
        request_id=_optional_text(request_id, field="request_id", max_length=64),
        args_hash=_optional_text(args_hash, field="args_hash", max_length=255),
        error_code=_optional_text(error_code, field="error_code", max_length=100),
    )
    if created_at is not None:
        if not isinstance(created_at, datetime):
            raise TypeError("created_at must be a datetime")
        event.created_at = as_utc(created_at)
    session.add(event)
    await session.flush()
    return event


async def list_events(
    session: AsyncSession,
    *,
    client_id: str | None = None,
    tool_name: str | None = None,
    decision: str | None = None,
    start: datetime | None = None,
    end: datetime | None = None,
    limit: int = 50,
    offset: int = 0,
    action: str | None = None,
    api_key_id: str | None = None,
    key_prefix: str | None = None,
    newest_first: bool = False,
) -> list[AuditEvent]:
    # The audit API asks for one extra row to detect the next page. Allow
    # that single lookahead without raising the public page cap of 100.
    if (
        not isinstance(limit, bool)
        and isinstance(limit, int)
        and limit == MAX_PAGE_LIMIT + 1
    ):
        _, offset = normalize_page(1, offset)
    else:
        limit, offset = normalize_page(limit, offset)
    statement = _filtered(
        select(AuditEvent),
        client_id=client_id,
        tool_name=tool_name,
        decision=decision,
        start=start,
        end=end,
        action=action,
        api_key_id=api_key_id,
        key_prefix=key_prefix,
    )
    if newest_first:
        statement = statement.order_by(
            AuditEvent.created_at.desc(), AuditEvent.id.desc()
        )
    else:
        statement = statement.order_by(AuditEvent.created_at.asc(), AuditEvent.id.asc())
    statement = statement.limit(limit).offset(offset)
    result = await session.execute(statement)
    return list(result.scalars().all())


async def count_events(
    session: AsyncSession,
    *,
    start: datetime | None = None,
    end: datetime | None = None,
    decision: str | None = None,
    action: str | None = None,
    client_id: str | None = None,
) -> int:
    statement = _filtered(
        select(func.count()).select_from(AuditEvent),
        client_id=client_id,
        decision=decision,
        start=start,
        end=end,
        action=action,
    )
    result = await session.execute(statement)
    return int(result.scalar_one())


async def get_metrics_summary(session: AsyncSession) -> dict:
    totals_stmt = select(
        func.count().label("total"),
        func.count(case((AuditEvent.status == "ok", 1))).label("successful"),
        func.count(case((AuditEvent.status == "denied", 1))).label("denied"),
        func.count(case((AuditEvent.status == "error", 1))).label("error"),
        func.count(case((AuditEvent.reason == "rate_limit_exceeded", 1))).label(
            "rate_limit_rejections"
        ),
    ).select_from(AuditEvent)

    totals_res = await session.execute(totals_stmt)
    totals_row = totals_res.one()
    totals = {
        "total": totals_row.total or 0,
        "successful": totals_row.successful or 0,
        "denied": totals_row.denied or 0,
        "error": totals_row.error or 0,
        "rate_limit_rejections": totals_row.rate_limit_rejections or 0,
    }

    slowest_stmt = (
        select(
            AuditEvent.tool_name,
            func.count().label("request_count"),
            func.avg(AuditEvent.duration_ms).label("avg_duration_ms"),
            func.max(AuditEvent.duration_ms).label("max_duration_ms"),
        )
        .where(AuditEvent.tool_name.is_not(None))
        .where(AuditEvent.duration_ms.is_not(None))
        .group_by(AuditEvent.tool_name)
        .order_by(func.avg(AuditEvent.duration_ms).desc())
        .limit(10)
    )
    slowest_res = await session.execute(slowest_stmt)
    slowest_tools = [
        {
            "tool_name": row.tool_name,
            "request_count": row.request_count,
            "avg_duration_ms": round(row.avg_duration_ms, 2)
            if row.avg_duration_ms
            else 0.0,
            "max_duration_ms": round(row.max_duration_ms, 2)
            if row.max_duration_ms
            else 0.0,
        }
        for row in slowest_res.all()
    ]

    busiest_stmt = (
        select(
            AuditEvent.key_prefix,
            func.count().label("request_count"),
        )
        .where(AuditEvent.key_prefix.is_not(None))
        .group_by(AuditEvent.key_prefix)
        .order_by(func.count().desc())
        .limit(10)
    )
    busiest_res = await session.execute(busiest_stmt)
    busiest_keys = [
        {
            "key_prefix": row.key_prefix,
            "request_count": row.request_count,
        }
        for row in busiest_res.all()
    ]

    denials_stmt = (
        select(
            AuditEvent.reason,
            func.count().label("count"),
        )
        .where(AuditEvent.decision == "denied")
        .group_by(AuditEvent.reason)
        .order_by(func.count().desc())
        .limit(20)
    )
    denials_res = await session.execute(denials_stmt)
    denials = [
        {"reason": row.reason or "unknown", "count": row.count}
        for row in denials_res.all()
    ]

    errors_stmt = (
        select(
            AuditEvent.error_code,
            func.count().label("count"),
        )
        .where(AuditEvent.status == "error")
        .group_by(AuditEvent.error_code)
        .order_by(func.count().desc())
        .limit(20)
    )
    errors_res = await session.execute(errors_stmt)
    errors = [
        {"error_code": row.error_code or "unknown", "count": row.count}
        for row in errors_res.all()
    ]

    return {
        "totals": totals,
        "slowest_tools": slowest_tools,
        "busiest_keys": busiest_keys,
        "denials": denials,
        "errors": errors,
    }


async def delete_events_before(
    session: AsyncSession,
    *,
    cutoff: datetime,
    batch_size: int = 1000,
) -> int:
    """Delete audit rows with ``created_at`` earlier than ``cutoff``.

    This is the only sanctioned delete path (retention). A future Postgres
    trigger will reject UPDATE/DELETE on audit_events except this flagged
    DELETE and the FK ON DELETE SET NULL of api_key_id.

    On Postgres the statement runs with ``mcp_guard.audit_retention`` set
    locally so that trigger can recognize this path. The caller commits.
    There is no update helper: rows are append-only.
    """

    if not isinstance(cutoff, datetime):
        raise TypeError("cutoff must be a datetime")
    if (
        isinstance(batch_size, bool)
        or not isinstance(batch_size, int)
        or batch_size < 1
    ):
        raise ValueError("batch_size must be a positive integer")
    cutoff_at = as_utc(cutoff)

    bind = session.bind
    if bind is not None and bind.dialect.name == "postgresql":
        await session.execute(text("SET LOCAL mcp_guard.audit_retention = 'on'"))

    deleted = 0
    while True:
        id_query = (
            select(AuditEvent.id)
            .where(AuditEvent.created_at < cutoff_at)
            .order_by(AuditEvent.id.asc())
            .limit(batch_size)
        )
        id_result = await session.execute(id_query)
        ids = list(id_result.scalars().all())
        if not ids:
            return deleted
        await session.execute(delete(AuditEvent).where(AuditEvent.id.in_(ids)))
        deleted += len(ids)
        if len(ids) < batch_size:
            return deleted


def _decision(decision: str) -> str:
    if not isinstance(decision, str) or decision not in _DECISIONS:
        raise ValueError("decision must be 'allowed' or 'denied'")
    return decision


def _optional_text(value: str | None, *, field: str, max_length: int) -> str | None:
    if value is None:
        return None
    return require_text(value, field=field, max_length=max_length)


def _status_code(value: int | None) -> int | None:
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, int) or not 100 <= value <= 599:
        raise ValueError("status_code must be an HTTP status integer")
    return value


def _duration(value: float | None) -> float | None:
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)) or value < 0:
        raise ValueError("duration_ms must be a non-negative number")
    return float(value)


def _bound(value: datetime | None, *, field: str) -> datetime | None:
    if value is None:
        return None
    if not isinstance(value, datetime):
        raise TypeError(f"{field} must be a datetime")
    return as_utc(value)


def _filtered(
    statement,
    *,
    client_id: str | None = None,
    tool_name: str | None = None,
    decision: str | None = None,
    start: datetime | None = None,
    end: datetime | None = None,
    action: str | None = None,
    api_key_id: str | None = None,
    key_prefix: str | None = None,
):
    start_at = _bound(start, field="start")
    end_at = _bound(end, field="end")
    if start_at is not None and end_at is not None and start_at > end_at:
        raise ValueError("start must be earlier than or equal to end")

    action_text = _optional_text(action, field="action", max_length=100)
    key_id = _optional_text(api_key_id, field="api_key_id", max_length=36)
    prefix = _optional_text(key_prefix, field="key_prefix", max_length=20)

    if client_id is not None:
        statement = statement.where(AuditEvent.client_id == client_id)
    if tool_name is not None:
        statement = statement.where(AuditEvent.tool_name == tool_name)
    if decision is not None:
        statement = statement.where(AuditEvent.decision == _decision(decision))
    if action_text is not None:
        statement = statement.where(AuditEvent.action == action_text)
    if key_id is not None:
        statement = statement.where(AuditEvent.api_key_id == key_id)
    if prefix is not None:
        statement = statement.where(AuditEvent.key_prefix == prefix)
    if start_at is not None:
        statement = statement.where(AuditEvent.created_at >= start_at)
    if end_at is not None:
        statement = statement.where(AuditEvent.created_at <= end_at)
    return statement
