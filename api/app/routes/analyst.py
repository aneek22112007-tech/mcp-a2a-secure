"""Incident list, detail, explain, and status."""

from __future__ import annotations

import re
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator

from app import database
from app.analyst.errors import AnalystUnavailableError
from app.analyst.incidents import group_incidents
from app.analyst.output import ReportBody
from app.analyst.service import (
    analyst_busy,
    explain_incident,
    record_explain_attempt,
)
from app.analyst.types import Incident, IncidentEvent
from app.audit.events import ACTION_AUTH_DENY, STATUS_DENIED, AuditRecord
from app.audit.redaction import current_client_ip, current_request_id
from app.audit.sink import record_event
from app.auth.bearer import insufficient_scope_challenge
from app.auth.dependencies import authorize_route
from app.auth.principal import Principal
from app.auth.scopes import AUDIT_READ
from app.config import settings
from app.llm.health import check_health
from app.models.analyst_reports import AnalystReport
from app.models.audit_events import AuditEvent
from app.rate_limit import analyst_rate_limit
from app.repos.analyst_reports import latest_by_incident

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


class TimelineOut(BaseModel):
    text: str
    refs: list[str]


class ReportOut(BaseModel):
    summary: str
    timeline: list[TimelineOut]
    likely_cause: str
    impact: str
    next_steps: list[str]
    confidence: str


class FullReportOut(ReportOut):
    provider: str
    model: str
    fell_back: bool
    withheld_fields: int
    created_at: datetime
    latency_ms: int


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
    report: FullReportOut | None = None


class ExplainRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    incident_id: str | None = Field(default=None, pattern=r"^inc_[0-9a-f]{16}$")
    event_id: str | None = Field(default=None, max_length=36)
    refresh: bool = False

    @model_validator(mode="after")
    def exactly_one_id(self) -> ExplainRequest:
        if bool(self.incident_id) == bool(self.event_id):
            raise ValueError("Provide exactly one of incident_id or event_id.")
        return self


class ExplainOut(BaseModel):
    incident_id: str
    report: ReportOut
    provider: str
    model: str
    fell_back: bool
    cached: bool
    withheld_fields: int
    created_at: datetime
    latency_ms: int
    refs: dict[str, str]


class AnalystStatusOut(BaseModel):
    enabled: bool
    ollama_reachable: bool
    ollama_model: str
    ollama_model_present: bool
    groq_configured: bool
    rate_limit_per_minute: float
    max_concurrency: int
    busy: bool


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


def _latest(incident: Incident, row: AnalystReport | None) -> LatestReportOut | None:
    if row is None:
        return None
    return LatestReportOut(
        created_at=row.created_at,
        provider=row.provider,
        stale=row.events_fingerprint != incident.events_fingerprint,
    )


def _full_report(row: AnalystReport | None) -> FullReportOut | None:
    if row is None:
        return None
    try:
        body = ReportBody.model_validate_json(row.body)
    except ValidationError:
        return None
    return FullReportOut(
        summary=body.summary,
        timeline=[
            TimelineOut(text=item.text, refs=list(item.refs)) for item in body.timeline
        ],
        likely_cause=body.likely_cause,
        impact=body.impact,
        next_steps=list(body.next_steps),
        confidence=body.confidence,
        provider=row.provider,
        model=row.model,
        fell_back=row.fell_back,
        withheld_fields=row.withheld_fields,
        created_at=row.created_at,
        latency_ms=row.latency_ms,
    )


def _summary(incident: Incident, row: AnalystReport | None) -> IncidentSummaryOut:
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
        latest_report=_latest(incident, row),
    )


def _report_out(body: ReportBody) -> ReportOut:
    return ReportOut(
        summary=body.summary,
        timeline=[
            TimelineOut(text=item.text, refs=list(item.refs)) for item in body.timeline
        ],
        likely_cause=body.likely_cause,
        impact=body.impact,
        next_steps=list(body.next_steps),
        confidence=body.confidence,
    )


async def _load(
    now: datetime | None = None,
) -> tuple[list[Incident], datetime, dict[str, AnalystReport]]:
    moment = now or datetime.now(UTC)
    async with database.async_session_maker() as session:
        incidents = await group_incidents(session, now=moment)
        reports = await latest_by_incident(session, [item.id for item in incidents])
    return incidents, moment, reports


def _find(incidents: list[Incident], incident_id: str) -> Incident:
    if _INCIDENT_ID.fullmatch(incident_id) is None:
        raise HTTPException(status_code=404, detail="Incident not found.")
    for incident in incidents:
        if incident.id == incident_id:
            return incident
    raise HTTPException(status_code=404, detail="Incident not found.")


def _principal(request: Request) -> Principal | None:
    principal = getattr(request.state, "principal", None)
    if isinstance(principal, Principal):
        return principal
    return None


async def _require_audit_read(request: Request) -> Principal:
    principal = _principal(request)
    if principal is not None and principal.has_scope(AUDIT_READ):
        return principal
    await record_event(
        AuditRecord(
            action=ACTION_AUTH_DENY,
            decision="denied",
            status=STATUS_DENIED,
            reason=f"insufficient_scope:{AUDIT_READ}",
            status_code=403,
            error_code="FORBIDDEN",
            request_id=current_request_id(request.scope),
            client_ip=current_client_ip(request.scope),
            **AuditRecord.actor_fields(principal),
        ),
        required=False,
    )
    raise HTTPException(
        status_code=403,
        detail=f"Missing required scope: {AUDIT_READ}.",
        headers={"WWW-Authenticate": insufficient_scope_challenge(AUDIT_READ)},
    )


@router.get("/incidents", response_model=IncidentListOut)
async def list_incidents(
    kind: str | None = Query(default=None, max_length=32),
    severity: str | None = Query(default=None, max_length=16),
    limit: int = Query(default=50, ge=1, le=100),
) -> IncidentListOut:
    incidents, moment, reports = await _load()
    if kind:
        incidents = [item for item in incidents if item.kind == kind]
    if severity:
        incidents = [item for item in incidents if item.severity == severity]
    return IncidentListOut(
        items=[_summary(item, reports.get(item.id)) for item in incidents[:limit]],
        window_hours=settings.analyst_window_hours,
        generated_at=moment,
    )


@router.get("/incidents/{incident_id}", response_model=IncidentDetailOut)
async def get_incident(incident_id: str) -> IncidentDetailOut:
    incidents, _moment, reports = await _load()
    incident = _find(incidents, incident_id)
    truncated = len(incident.events) > _DETAIL_EVENT_CAP
    shown = incident.events[-_DETAIL_EVENT_CAP:] if truncated else incident.events
    row = reports.get(incident.id)
    summary = _summary(incident, row)
    return IncidentDetailOut(
        **summary.model_dump(),
        events=[_event_out(event) for event in shown],
        truncated=truncated,
        report=_full_report(row),
    )


@router.get("/status", response_model=AnalystStatusOut)
async def analyst_status() -> AnalystStatusOut:
    health = await check_health()
    return AnalystStatusOut(
        enabled=health.enabled,
        ollama_reachable=health.ollama_reachable,
        ollama_model=health.ollama_model,
        ollama_model_present=health.ollama_model_present,
        groq_configured=health.groq_configured,
        rate_limit_per_minute=settings.analyst_rate_limit_per_minute,
        max_concurrency=settings.analyst_max_concurrency,
        busy=analyst_busy(),
    )


async def _incident_for_event(incidents: list[Incident], event_id: str) -> Incident:
    for incident in incidents:
        for event in incident.events:
            if event.event_id == event_id:
                return incident
    async with database.async_session_maker() as session:
        row = await session.get(AuditEvent, event_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Event not found.")
    raise HTTPException(
        status_code=422,
        detail="This event is not part of an incident.",
    )


@router.post("/explain", response_model=ExplainOut)
async def explain(body: ExplainRequest, request: Request) -> ExplainOut:
    """Explain one incident. The shared bucket already ran. Analyst token is last."""

    principal = await _require_audit_read(request)
    request_id = current_request_id(request.scope)
    client_ip = current_client_ip(request.scope)
    if not settings.llm_enabled:
        label = body.incident_id or body.event_id or "unknown"
        await record_explain_attempt(
            principal,
            request_id=request_id,
            client_ip=client_ip,
            status="unavailable",
            incident_id=label,
            error="disabled",
        )
        raise AnalystUnavailableError("disabled")
    await analyst_rate_limit(request)

    incidents, _moment, _reports = await _load()
    if body.incident_id:
        incident = _find(incidents, body.incident_id)
    else:
        incident = await _incident_for_event(incidents, body.event_id or "")
    related_ids = set(incident.related_ids)
    related = [item for item in incidents if item.id in related_ids]
    result = await explain_incident(
        incident,
        related=related,
        principal=principal,
        request_id=request_id,
        client_ip=client_ip,
        refresh=body.refresh,
    )
    return ExplainOut(
        incident_id=result.incident_id,
        report=_report_out(result.report),
        provider=result.provider,
        model=result.model,
        fell_back=result.fell_back,
        cached=result.cached,
        withheld_fields=result.withheld_fields,
        created_at=result.created_at,
        latency_ms=result.latency_ms,
        refs=result.refs,
    )
