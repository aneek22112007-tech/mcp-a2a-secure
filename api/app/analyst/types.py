"""Incident shapes. Facts come from rows, not from a model."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

KIND_INJECTION = "injection"  # tool.output.injection
KIND_PIN = "pin"  # tool.pin.drift, tool.pin.deny, tool.pin.unapproved
KIND_SCANNER = "scanner"  # open rows in tool_scan_findings
KIND_RATE_LIMIT = "rate_limit"  # rate_limit.deny
KIND_SCOPE = "scope"  # auth.deny with insufficient_scope:* or unmapped_tool
KIND_AUTH = "auth"  # any other auth.deny
KIND_A2A = "a2a"  # a2a.denied, a2a.failed
KIND_OTHER = "other"  # any other decision=denied row

KINDS = frozenset(
    {
        KIND_INJECTION,
        KIND_PIN,
        KIND_SCANNER,
        KIND_RATE_LIMIT,
        KIND_SCOPE,
        KIND_AUTH,
        KIND_A2A,
        KIND_OTHER,
    }
)
SEVERITIES = frozenset({"high", "medium", "low"})


@dataclass(frozen=True, slots=True)
class IncidentEvent:
    """One security row inside an incident.

    ``ref`` is assigned in time order. ``evidence`` is scanner text kept for
    the prompt sanitizer. API responses leave it out.
    """

    ref: str
    event_id: str
    created_at: datetime
    action: str
    decision: str
    status: str
    status_code: int | None
    error_code: str | None
    reason: str | None
    tool_name: str | None
    key_prefix: str | None
    evidence: str | None = None


@dataclass(frozen=True, slots=True)
class Incident:
    """One grouped story. The same rows always produce the same id."""

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
    events: list[IncidentEvent]
    events_fingerprint: str
    related_ids: list[str]
