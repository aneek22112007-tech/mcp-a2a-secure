"""Persist audit records and notify in-process listeners.

POLICY
------
- REQUIRED (fail-closed): ``tool.call`` and ``mcp.tools_call``.
- Mutating REST calls and MCP tools/call are audit-first. They write a
  required ``tool.call`` row before forwarding to the tool. Then a best-effort
  ``tool.result`` row is written.
- Read tools (REST) are audited after execution: a required ``tool.call`` row
  is written before the result is returned.
- Allowlist rejections, argument rejections, and tool errors are recorded
  best-effort, then the original HTTP error is re-raised.
- BEST-EFFORT (fail-open, logged + ``on_write_failure``): ``auth.allow`` and
  ``auth.deny``. A denial must keep its real 401/403 response; never turn it
  into a 500.
"""

from __future__ import annotations

import logging
from typing import Protocol

from app import database
from app.audit.events import AuditEventOut, AuditRecord
from app.audit.redaction import safe_reason, safe_tool_name
from app.audit.stream import audit_broadcaster
from app.repos.audit import add_event

logger = logging.getLogger(__name__)


class AuditUnavailableError(Exception):
    """A required audit row could not be stored."""


class AuditSink(Protocol):
    async def write(self, record: AuditRecord) -> AuditEventOut: ...


class AuditListener(Protocol):
    """Synchronous hook for later metrics. Must not raise into the request."""

    def on_event(self, event: AuditEventOut) -> None: ...

    def on_write_failure(self, action: str, error_type: str) -> None: ...


class DbAuditSink:
    """Write one row in a session that is not the request session.

    The row commits here, so a later rollback of the request does not drop it.
    """

    async def write(self, record: AuditRecord) -> AuditEventOut:
        async with database.async_session_maker() as session:
            row = await add_event(
                session,
                decision=record.decision,
                action=record.action,
                status=record.status,
                client_id=record.client_id,
                api_key_id=record.api_key_id,
                key_prefix=record.key_prefix,
                tool_name=safe_tool_name(record.tool_name),
                reason=safe_reason(record.reason),
                status_code=record.status_code,
                duration_ms=record.duration_ms,
                request_id=record.request_id,
                client_ip=record.client_ip,
                args_hash=record.args_hash,
                error_code=record.error_code,
            )
            await session.commit()
            return AuditEventOut.model_validate(row)


_sink: AuditSink = DbAuditSink()
_listeners: list[AuditListener] = []


def get_audit_sink() -> AuditSink:
    return _sink


def set_audit_sink(sink: AuditSink) -> None:
    global _sink
    _sink = sink


def add_audit_listener(listener: AuditListener) -> None:
    if listener not in _listeners:
        _listeners.append(listener)


def remove_audit_listener(listener: AuditListener) -> None:
    try:
        _listeners.remove(listener)
    except ValueError:
        return


def _notify_event(event: AuditEventOut) -> None:
    # Copy so a listener can remove itself during the callback.
    for listener in _listeners[:]:
        try:
            listener.on_event(event)
        except Exception as exc:  # noqa: BLE001
            logger.error("[audit] listener failed type=%s", type(exc).__name__)


def _notify_failure(action: str, error_type: str) -> None:
    for listener in _listeners[:]:
        try:
            listener.on_write_failure(action, error_type)
        except Exception as exc:  # noqa: BLE001
            logger.error("[audit] listener failed type=%s", type(exc).__name__)


async def record_event(record: AuditRecord, *, required: bool) -> AuditEventOut | None:
    """Persist ``record``, then publish it.

    A failed required write raises ``AuditUnavailableError`` with no cause
    chain. A failed best-effort write is logged and returns None.
    """

    try:
        event = await get_audit_sink().write(record)
    except Exception as exc:  # noqa: BLE001
        error_type = type(exc).__name__
        logger.error(
            "[audit] write failed action=%s type=%s request_id=%s",
            record.action,
            error_type,
            record.request_id,
        )
        _notify_failure(record.action, error_type)
        if required:
            raise AuditUnavailableError from None
        return None

    try:
        audit_broadcaster.publish(event)
    except Exception as exc:  # noqa: BLE001
        logger.error("[audit] publish failed type=%s", type(exc).__name__)
    _notify_event(event)
    return event
