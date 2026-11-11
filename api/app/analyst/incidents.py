"""Group real audit rows and open scanner findings into incidents.

The same rows always produce the same incidents. No model is involved.
"""

from __future__ import annotations

import hashlib
from collections import defaultdict
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.a2a.manager import ACTION_A2A_DENIED, ACTION_A2A_FAILED
from app.analyst.severity import incident_severity
from app.analyst.types import (
    KIND_A2A,
    KIND_AUTH,
    KIND_INJECTION,
    KIND_OTHER,
    KIND_PIN,
    KIND_RATE_LIMIT,
    KIND_SCANNER,
    KIND_SCOPE,
    Incident,
    IncidentEvent,
)
from app.audit.events import (
    ACTION_AUTH_DENY,
    ACTION_GUARD_CHECK,
    ACTION_TOOL_OUTPUT_INJECTION,
    ACTION_TOOL_PIN_DENY,
    ACTION_TOOL_PIN_DRIFT,
    ACTION_TOOL_PIN_UNAPPROVED,
    ACTION_TOOL_SCAN_FINDING,
)
from app.config import settings
from app.models.audit_events import AuditEvent
from app.models.tool_scan_findings import ToolScanFinding
from app.repos.audit import list_security_events
from app.repos.common import as_utc

_PIN_ACTIONS = frozenset(
    {
        ACTION_TOOL_PIN_DRIFT,
        ACTION_TOOL_PIN_DENY,
        ACTION_TOOL_PIN_UNAPPROVED,
    }
)
_A2A_ACTIONS = frozenset({ACTION_A2A_DENIED, ACTION_A2A_FAILED})
_TOOL_KINDS = frozenset({KIND_INJECTION, KIND_PIN, KIND_SCANNER})
_SKIP_INFO = frozenset({"none", "info"})


@dataclass(frozen=True, slots=True)
class _Row:
    created_at: datetime
    event_id: str
    action: str
    decision: str
    status: str
    status_code: int | None
    error_code: str | None
    reason: str | None
    tool_name: str | None
    key_prefix: str | None
    evidence: str | None
    kind: str
    group_key: str
    bucket: str
    finding_severity: str | None


def _kind(action: str, reason: str | None) -> str:
    if action == ACTION_TOOL_OUTPUT_INJECTION:
        return KIND_INJECTION
    if action in _PIN_ACTIONS:
        return KIND_PIN
    if action == ACTION_TOOL_SCAN_FINDING:
        return KIND_SCANNER
    if action == "rate_limit.deny":
        return KIND_RATE_LIMIT
    if action == ACTION_AUTH_DENY:
        text = reason or ""
        if text.startswith("insufficient_scope:") or text == "unmapped_tool":
            return KIND_SCOPE
        return KIND_AUTH
    if action in _A2A_ACTIONS:
        return KIND_A2A
    return KIND_OTHER


def _block_severities() -> set[str]:
    return {
        part.strip().lower()
        for part in settings.scanner_block_severities.split(",")
        if part.strip()
    }


def _tool_or_unknown(tool_name: str | None) -> str:
    if tool_name and tool_name.strip():
        return tool_name
    return "unknown"


def _keys_for(
    kind: str, tool_name: str | None, key_prefix: str | None, client_ip: str | None
) -> tuple[str, str]:
    """Return the public group key and the private bucket key.

    Anonymous rows are split by client IP inside the bucket only. The IP is
    not part of the group key, the incident id, or any returned field.
    """

    if kind in _TOOL_KINDS:
        key = _tool_or_unknown(tool_name)
        return key, key
    if key_prefix:
        return key_prefix, key_prefix
    return "anonymous", f"ip:{client_ip or ''}"


def _from_audit(event: AuditEvent) -> _Row | None:
    action = event.action or ""
    if action == ACTION_GUARD_CHECK or action.startswith("analyst."):
        return None
    if action == ACTION_TOOL_SCAN_FINDING:
        return None
    kind = _kind(action, event.reason)
    group_key, bucket = _keys_for(
        kind, event.tool_name, event.key_prefix, event.client_ip
    )
    return _Row(
        created_at=as_utc(event.created_at),
        event_id=event.id,
        action=action,
        decision=event.decision,
        status=event.status,
        status_code=event.status_code,
        error_code=event.error_code,
        reason=event.reason,
        tool_name=event.tool_name,
        key_prefix=event.key_prefix,
        evidence=None,
        kind=kind,
        group_key=group_key,
        bucket=bucket,
        finding_severity=None,
    )


def _from_finding(row: ToolScanFinding, blocked: set[str]) -> _Row | None:
    severity = (row.severity or "").strip().lower()
    if severity in _SKIP_INFO:
        return None
    tool = row.tool_name
    group_key = _tool_or_unknown(tool)
    decision = "denied" if severity in blocked else "allowed"
    return _Row(
        created_at=as_utc(row.created_at),
        event_id=f"finding:{row.id}",
        action=ACTION_TOOL_SCAN_FINDING,
        decision=decision,
        status="finding",
        status_code=None,
        error_code=None,
        reason=f"{row.rule_id} {row.severity}: {row.message}",
        tool_name=tool,
        key_prefix=None,
        evidence=row.evidence,
        kind=KIND_SCANNER,
        group_key=group_key,
        bucket=group_key,
        finding_severity=severity,
    )


def _unique(values: list[str | None]) -> list[str]:
    seen: list[str] = []
    for value in values:
        if value and value not in seen:
            seen.append(value)
    return seen


def _incident_id(kind: str, group_key: str, first_event_id: str) -> str:
    raw = f"{kind}|{group_key}|{first_event_id}"
    digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]
    return f"inc_{digest}"


def _fingerprint(event_ids: list[str]) -> str:
    raw = "\n".join(sorted(event_ids))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _build(rows: list[_Row]) -> Incident:
    events: list[IncidentEvent] = []
    counts: dict[str, int] = {}
    severities: list[str] = []
    for index, row in enumerate(rows, start=1):
        events.append(
            IncidentEvent(
                ref=f"E{index}",
                event_id=row.event_id,
                created_at=row.created_at,
                action=row.action,
                decision=row.decision,
                status=row.status,
                status_code=row.status_code,
                error_code=row.error_code,
                reason=row.reason,
                tool_name=row.tool_name,
                key_prefix=row.key_prefix,
                evidence=row.evidence,
            )
        )
        counts[row.action] = counts.get(row.action, 0) + 1
        if row.finding_severity:
            severities.append(row.finding_severity)
    kind = rows[0].kind
    group_key = rows[0].group_key
    return Incident(
        id=_incident_id(kind, group_key, events[0].event_id),
        kind=kind,
        severity=incident_severity(kind, events, severities),
        group_key=group_key,
        key_prefixes=_unique([event.key_prefix for event in events]),
        tool_names=_unique([event.tool_name for event in events]),
        first_seen=events[0].created_at,
        last_seen=events[-1].created_at,
        event_count=len(events),
        counts_by_action=counts,
        events=events,
        events_fingerprint=_fingerprint([event.event_id for event in events]),
        related_ids=[],
    )


def _split(rows: list[_Row], gap: timedelta) -> list[list[_Row]]:
    clusters: list[list[_Row]] = [[rows[0]]]
    for row in rows[1:]:
        if row.created_at - clusters[-1][-1].created_at > gap:
            clusters.append([row])
        else:
            clusters[-1].append(row)
    return clusters


def _near(left: Incident, right: Incident, gap: timedelta) -> bool:
    return (
        left.first_seen <= right.last_seen + gap
        and right.first_seen <= left.last_seen + gap
    )


def _share(left: Incident, right: Incident) -> bool:
    if set(left.key_prefixes) & set(right.key_prefixes):
        return True
    return bool(set(left.tool_names) & set(right.tool_names))


def _relate(incidents: list[Incident], gap: timedelta) -> list[Incident]:
    related: dict[str, list[str]] = {incident.id: [] for incident in incidents}
    for index, left in enumerate(incidents):
        for right in incidents[index + 1 :]:
            if _share(left, right) and _near(left, right, gap):
                related[left.id].append(right.id)
                related[right.id].append(left.id)
    finished: list[Incident] = []
    for incident in incidents:
        ids = sorted(related[incident.id])
        finished.append(
            Incident(
                id=incident.id,
                kind=incident.kind,
                severity=incident.severity,
                group_key=incident.group_key,
                key_prefixes=incident.key_prefixes,
                tool_names=incident.tool_names,
                first_seen=incident.first_seen,
                last_seen=incident.last_seen,
                event_count=incident.event_count,
                counts_by_action=incident.counts_by_action,
                events=incident.events,
                events_fingerprint=incident.events_fingerprint,
                related_ids=ids,
            )
        )
    return finished


async def _open_findings(
    session: AsyncSession, start: datetime
) -> list[ToolScanFinding]:
    statement = (
        select(ToolScanFinding)
        .where(ToolScanFinding.resolved_at.is_(None))
        .where(ToolScanFinding.created_at >= start)
        .order_by(ToolScanFinding.created_at.asc(), ToolScanFinding.id.asc())
    )
    result = await session.execute(statement)
    return list(result.scalars().all())


async def group_incidents(
    session: AsyncSession,
    *,
    now: datetime | None = None,
) -> list[Incident]:
    """Build incidents from the current window. Newest ``last_seen`` first."""

    moment = as_utc(now or datetime.now(UTC))
    start = moment - timedelta(hours=settings.analyst_window_hours)
    gap = timedelta(minutes=settings.analyst_incident_gap_minutes)
    blocked = _block_severities()

    audit_rows = await list_security_events(
        session, start=start, limit=settings.analyst_max_rows
    )
    rows: list[_Row] = []
    for event in reversed(audit_rows):
        built = _from_audit(event)
        if built is not None:
            rows.append(built)
    for finding in await _open_findings(session, start):
        built = _from_finding(finding, blocked)
        if built is not None:
            rows.append(built)

    rows.sort(key=lambda row: (row.created_at, row.event_id))
    buckets: dict[tuple[str, str], list[_Row]] = defaultdict(list)
    for row in rows:
        buckets[(row.kind, row.bucket)].append(row)

    incidents: list[Incident] = []
    for grouped in buckets.values():
        for cluster in _split(grouped, gap):
            incidents.append(_build(cluster))
    incidents = _relate(incidents, gap)
    incidents.sort(key=lambda incident: (incident.last_seen, incident.id), reverse=True)
    return incidents
