"""Severity is decided here. The model is not asked."""

from __future__ import annotations

from app.analyst.types import (
    KIND_A2A,
    KIND_AUTH,
    KIND_INJECTION,
    KIND_PIN,
    KIND_RATE_LIMIT,
    KIND_SCANNER,
    KIND_SCOPE,
    IncidentEvent,
)
from app.audit.events import (
    ACTION_TOOL_PIN_DENY,
    ACTION_TOOL_PIN_DRIFT,
    ACTION_TOOL_PIN_UNAPPROVED,
)

# A blocked injection, a pin that drifted, or a critical scanner hit.
_HIGH = "high"
# Warn-mode injection, a pin denial, or a smaller burst of denials.
_MEDIUM = "medium"
# Everything that does not meet a higher bar.
_LOW = "low"

_SCOPE_HIGH = 10
_SCOPE_MEDIUM = 3
_AUTH_HIGH = 20
_AUTH_MEDIUM = 5
_RATE_LIMIT_MEDIUM = 3


def incident_severity(
    kind: str,
    events: list[IncidentEvent],
    finding_severities: list[str],
) -> str:
    """Return high, medium, or low for one incident of a single kind."""

    count = len(events)
    if kind == KIND_INJECTION:
        # high: a blocked row. medium: warn or cleaned.
        if any(event.status == "denied" for event in events):
            return _HIGH
        return _MEDIUM
    if kind == KIND_PIN:
        # high: drift or an upstream contract change. medium: deny or unapproved.
        if any(
            event.action == ACTION_TOOL_PIN_DRIFT
            or event.reason == "upstream_contract_changed"
            for event in events
        ):
            return _HIGH
        if any(
            event.action in {ACTION_TOOL_PIN_DENY, ACTION_TOOL_PIN_UNAPPROVED}
            for event in events
        ):
            return _MEDIUM
        return _LOW
    if kind == KIND_SCANNER:
        # high: high or critical. medium: medium. low: the rest.
        severities = {item.strip().lower() for item in finding_severities if item}
        if severities & {"high", "critical"}:
            return _HIGH
        if "medium" in severities:
            return _MEDIUM
        return _LOW
    if kind == KIND_SCOPE:
        if count >= _SCOPE_HIGH:
            return _HIGH
        if count >= _SCOPE_MEDIUM:
            return _MEDIUM
        return _LOW
    if kind == KIND_AUTH:
        if count >= _AUTH_HIGH:
            return _HIGH
        if count >= _AUTH_MEDIUM:
            return _MEDIUM
        return _LOW
    if kind == KIND_A2A:
        return _MEDIUM
    if kind == KIND_RATE_LIMIT:
        if count >= _RATE_LIMIT_MEDIUM:
            return _MEDIUM
        return _LOW
    return _LOW
