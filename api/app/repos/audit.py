"""Async persistence helpers for audit events."""

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_events import (
    AUDIT_DECISION_ALLOWED,
    AUDIT_DECISION_DENIED,
    AuditEvent,
)
from app.repos.common import as_utc, normalize_page, require_text

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
) -> list[AuditEvent]:
    limit, offset = normalize_page(limit, offset)
    start_at = _bound(start, field="start")
    end_at = _bound(end, field="end")
    if start_at is not None and end_at is not None and start_at > end_at:
        raise ValueError("start must be earlier than or equal to end")

    statement = select(AuditEvent)
    if client_id is not None:
        statement = statement.where(AuditEvent.client_id == client_id)
    if tool_name is not None:
        statement = statement.where(AuditEvent.tool_name == tool_name)
    if decision is not None:
        statement = statement.where(AuditEvent.decision == _decision(decision))
    if start_at is not None:
        statement = statement.where(AuditEvent.created_at >= start_at)
    if end_at is not None:
        statement = statement.where(AuditEvent.created_at <= end_at)
    statement = (
        statement.order_by(AuditEvent.created_at.asc(), AuditEvent.id.asc())
        .limit(limit)
        .offset(offset)
    )
    result = await session.execute(statement)
    return list(result.scalars().all())


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
