"""Incident list and detail. These routes do not call a model."""

from __future__ import annotations

import re
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app import database
from app.analyst.incidents import group_incidents
from app.analyst.types import Incident, IncidentEvent
from app.auth.dependencies import authorize_route
from app.config import settings

router = APIRouter(
    prefix="/api/analyst",
    tags=["analyst"],
    dependencies=[Depends(authorize_route)],
)

_INCIDENT_ID = re.compile(r"^inc_[0-9a-f]{16}$")
_DETAIL_EVENT_CAP = 200


class LatestReportOut(BaseModel):
    created_at: datetime
    provider: str
    stale: bool


class IncidentEventOut(BaseModel):
    ref: str
    event_id: str
    created_at: datetime
    action: str
    decision: str
    status: str
    status_code: int | None = None
    error_code: str | None = None
    reason: str | None = None
    tool_name: str | None = None
    key_prefix: str | None = None


class IncidentSummaryOut(BaseModel):
    id: str
    kind: str
    severity: str
    group_key: str
    key_prefixes: list[str]
    tool_names: list[str]
    first_seen: datetime
    last_seen: datetime
    event_count: int
    counts_by_action: dict[str, int]
    events_fingerprint: str
    related_ids: list[str]
    latest_report: LatestReportOut | None = None


class IncidentListOut(BaseModel):
    items: list[IncidentSummaryOut]
    window_hours: int
    generated_at: datetime


class IncidentDetailOut(IncidentSummaryOut):
    events: list[IncidentEventOut]
    truncated: bool


def _event_out(event: IncidentEvent) -> IncidentEventOut:
    return IncidentEventOut(
        ref=event.ref,
        event_id=event.event_id,
        created_at=event.created_at,
        action=event.action,
        decision=event.decision,
        status=event.status,
        status_code=event.status_code,
        error_code=event.error_code,
        reason=event.reason,
        tool_name=event.tool_name,
        key_prefix=event.key_prefix,
    )


def _summary(incident: Incident) -> IncidentSummaryOut:
    return IncidentSummaryOut(
        id=incident.id,
        kind=incident.kind,
        severity=incident.severity,
        group_key=incident.group_key,
        key_prefixes=list(incident.key_prefixes),
        tool_names=list(incident.tool_names),
        first_seen=incident.first_seen,
        last_seen=incident.last_seen,
        event_count=incident.event_count,
        counts_by_action=dict(incident.counts_by_action),
        events_fingerprint=incident.events_fingerprint,
        related_ids=list(incident.related_ids),
        latest_report=None,
    )


async def _load(now: datetime | None = None) -> tuple[list[Incident], datetime]:
    moment = now or datetime.now(UTC)
    async with database.async_session_maker() as session:
        incidents = await group_incidents(session, now=moment)
    return incidents, moment


def _find(incidents: list[Incident], incident_id: str) -> Incident:
    if _INCIDENT_ID.fullmatch(incident_id) is None:
        raise HTTPException(status_code=404, detail="Incident not found.")
    for incident in incidents:
        if incident.id == incident_id:
            return incident
    raise HTTPException(status_code=404, detail="Incident not found.")


@router.get("/incidents", response_model=IncidentListOut)
async def list_incidents(
    kind: str | None = Query(default=None, max_length=32),
    severity: str | None = Query(default=None, max_length=16),
    limit: int = Query(default=50, ge=1, le=100),
) -> IncidentListOut:
    incidents, moment = await _load()
    if kind:
        incidents = [item for item in incidents if item.kind == kind]
    if severity:
        incidents = [item for item in incidents if item.severity == severity]
    return IncidentListOut(
        items=[_summary(item) for item in incidents[:limit]],
        window_hours=settings.analyst_window_hours,
        generated_at=moment,
    )


@router.get("/incidents/{incident_id}", response_model=IncidentDetailOut)
async def get_incident(incident_id: str) -> IncidentDetailOut:
    incidents, _moment = await _load()
    incident = _find(incidents, incident_id)
    truncated = len(incident.events) > _DETAIL_EVENT_CAP
    shown = incident.events[-_DETAIL_EVENT_CAP:] if truncated else incident.events
    summary = _summary(incident)
    return IncidentDetailOut(
        **summary.model_dump(),
        events=[_event_out(event) for event in shown],
        truncated=truncated,
    )
