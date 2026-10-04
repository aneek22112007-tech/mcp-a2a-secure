"""GET /api/audit and the live audit SSE stream."""

from __future__ import annotations

from collections.abc import AsyncIterator
from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.sse import EventSourceResponse, ServerSentEvent
from pydantic import BaseModel

from app import database
from app.audit.events import AuditEventOut
from app.audit.stream import AuditSubscription, StreamFullError, audit_broadcaster
from app.auth.dependencies import authorize_route
from app.repos.audit import list_events

router = APIRouter(
    prefix="/api/audit",
    tags=["audit"],
    dependencies=[Depends(authorize_route)],
)

_INVALID_QUERY = "Invalid audit query."


class AuditPage(BaseModel):
    items: list[AuditEventOut]
    limit: int
    offset: int
    next_offset: int | None


@router.get("", response_model=AuditPage)
async def list_audit_events(
    client_id: Annotated[str | None, Query(max_length=36)] = None,
    api_key_id: Annotated[str | None, Query(max_length=36)] = None,
    key_prefix: Annotated[str | None, Query(max_length=20)] = None,
    tool_name: Annotated[str | None, Query(max_length=100)] = None,
    action: Annotated[str | None, Query(max_length=100)] = None,
    decision: Literal["allowed", "denied"] | None = None,
    start: datetime | None = None,
    end: datetime | None = None,
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
) -> AuditPage:
    async with database.async_session_maker() as session:
        try:
            rows = await list_events(
                session,
                client_id=client_id,
                api_key_id=api_key_id,
                key_prefix=key_prefix,
                tool_name=tool_name,
                action=action,
                decision=decision,
                start=start,
                end=end,
                limit=limit + 1,
                offset=offset,
                newest_first=True,
            )
        except (ValueError, TypeError):
            raise HTTPException(status_code=400, detail=_INVALID_QUERY) from None
        has_more = len(rows) > limit
        items = [AuditEventOut.model_validate(row) for row in rows[:limit]]

    return AuditPage(
        items=items,
        limit=limit,
        offset=offset,
        next_offset=(offset + limit) if has_more else None,
    )


async def _audit_subscription(
    decision: Literal["allowed", "denied"] | None = None,
    action: Annotated[str | None, Query(max_length=100)] = None,
    tool_name: Annotated[str | None, Query(max_length=100)] = None,
    client_id: Annotated[str | None, Query(max_length=36)] = None,
) -> AsyncIterator[AuditSubscription]:
    """Subscribe before the SSE response starts, and drop it when the client leaves."""

    filters = {
        "decision": decision,
        "action": action,
        "tool_name": tool_name,
        "client_id": client_id,
    }
    try:
        subscription = audit_broadcaster.subscribe(filters)
    except StreamFullError:
        raise HTTPException(
            status_code=503,
            detail="Too many audit stream subscribers.",
        ) from None
    try:
        yield subscription
    finally:
        audit_broadcaster.unsubscribe(subscription)


@router.get("/stream", response_class=EventSourceResponse)
async def stream_audit_events(
    subscription: Annotated[AuditSubscription, Depends(_audit_subscription)],
) -> AsyncIterator[ServerSentEvent]:
    """Stream new audit rows. The key is accepted only via Authorization."""

    while True:
        event = await subscription.queue.get()
        yield ServerSentEvent(id=event.id, event="audit", data=event)
