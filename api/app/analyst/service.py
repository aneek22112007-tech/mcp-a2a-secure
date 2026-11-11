"""Ask the local model to explain one incident, then check the reply.

A cached report is returned without a model call. A second caller is not
queued: the gate is taken without waiting.
"""

from __future__ import annotations

import asyncio
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime

from pydantic import ValidationError

from app.analyst.errors import (
    AnalystBusyError,
    AnalystOutputError,
    AnalystUnavailableError,
)
from app.analyst.output import ReportBody, parse_report
from app.analyst.prompt import build_facts, fence_messages
from app.analyst.types import Incident
from app.audit.events import AuditRecord
from app.audit.redaction import safe_reason
from app.audit.sink import record_event
from app.auth.principal import Principal
from app.config import settings
from app.database import async_session_maker
from app.llm.backend import LLMBackend, LLMDisabledError, LLMUnavailableError
from app.models.analyst_reports import AnalystReport
from app.repos.analyst_reports import add_report, latest_by_incident

PURPOSE = "analyst.explain"


@dataclass(frozen=True, slots=True)
class ExplainResult:
    """One explanation the console can show. ``report`` already passed the checks."""

    incident_id: str
    report: ReportBody
    provider: str
    model: str
    fell_back: bool
    cached: bool
    withheld_fields: int
    created_at: datetime
    latency_ms: int
    refs: dict[str, str]


class _Gate:
    """In-flight counter. ``try_enter`` returns immediately when the limit is full."""

    def __init__(self) -> None:
        self._mutex = asyncio.Lock()
        self._inflight = 0

    async def try_enter(self) -> bool:
        async with self._mutex:
            if self._inflight >= settings.analyst_max_concurrency:
                return False
            self._inflight += 1
            return True

    async def leave(self) -> None:
        async with self._mutex:
            if self._inflight > 0:
                self._inflight -= 1

    def busy(self) -> bool:
        return self._inflight >= settings.analyst_max_concurrency


_gate: _Gate | None = None


def _get_gate() -> _Gate:
    global _gate
    if _gate is None:
        _gate = _Gate()
    return _gate


def analyst_busy() -> bool:
    """True when this process is already at ``analyst_max_concurrency``."""

    if _gate is None:
        return False
    return _gate.busy()


def _reason(
    incident_id: str,
    *,
    kind: str | None = None,
    withheld: int | None = None,
    provider: str | None = None,
    error: str | None = None,
) -> str:
    parts = [f"incident={incident_id}"]
    if error:
        parts.append(f"error={error}")
    else:
        if kind:
            parts.append(f"kind={kind}")
        if withheld is not None:
            parts.append(f"withheld={withheld}")
        if provider:
            parts.append(f"provider={provider}")
    return " ".join(parts)


async def record_explain_attempt(
    principal: Principal | None,
    *,
    request_id: str | None,
    client_ip: str | None,
    status: str,
    incident_id: str,
    kind: str | None = None,
    withheld: int | None = None,
    provider: str | None = None,
    error: str | None = None,
) -> None:
    """Best-effort ``analyst.explain`` row. Grouping skips ``analyst.*`` actions."""

    await record_event(
        AuditRecord(
            action="analyst.explain",
            decision="allowed",
            status=status,
            reason=safe_reason(
                _reason(
                    incident_id,
                    kind=kind,
                    withheld=withheld,
                    provider=provider,
                    error=error,
                )
            ),
            request_id=request_id,
            client_ip=client_ip,
            **AuditRecord.actor_fields(principal),
        ),
        required=False,
    )


def _refs_for(incident: Incident) -> dict[str, str]:
    return {event.ref: event.event_id for event in incident.events}


def _result_from_row(
    incident: Incident,
    row: AnalystReport,
    body: ReportBody,
    *,
    cached: bool,
) -> ExplainResult:
    return ExplainResult(
        incident_id=incident.id,
        report=body,
        provider=row.provider,
        model=row.model,
        fell_back=row.fell_back,
        cached=cached,
        withheld_fields=row.withheld_fields,
        created_at=row.created_at,
        latency_ms=row.latency_ms,
        refs=_refs_for(incident),
    )


async def explain_incident(
    incident: Incident,
    *,
    related: Sequence[Incident],
    principal: Principal,
    request_id: str | None,
    client_ip: str | None,
    refresh: bool,
) -> ExplainResult:
    """Explain ``incident``. Raises AnalystError subclasses. Does not queue."""

    if not refresh:
        async with async_session_maker() as session:
            stored = await latest_by_incident(session, [incident.id])
        row = stored.get(incident.id)
        if row is not None and row.events_fingerprint == incident.events_fingerprint:
            try:
                body = ReportBody.model_validate_json(row.body)
            except ValidationError:
                body = None
            if body is not None:
                await record_explain_attempt(
                    principal,
                    request_id=request_id,
                    client_ip=client_ip,
                    status="cached",
                    incident_id=incident.id,
                    kind=incident.kind,
                    withheld=row.withheld_fields,
                    provider=row.provider,
                )
                return _result_from_row(incident, row, body, cached=True)

    gate = _get_gate()
    if not await gate.try_enter():
        await record_explain_attempt(
            principal,
            request_id=request_id,
            client_ip=client_ip,
            status="busy",
            incident_id=incident.id,
            error="busy",
        )
        raise AnalystBusyError()

    try:
        return await _explain_with_model(
            incident,
            related=related,
            principal=principal,
            request_id=request_id,
            client_ip=client_ip,
        )
    finally:
        await gate.leave()


async def _explain_with_model(
    incident: Incident,
    *,
    related: Sequence[Incident],
    principal: Principal,
    request_id: str | None,
    client_ip: str | None,
) -> ExplainResult:
    facts, refs, withheld = await asyncio.to_thread(build_facts, incident, related)
    messages = fence_messages(facts)
    try:
        invocation = await LLMBackend().invoke(
            messages,
            purpose=PURPOSE,
            key_prefix=principal.key_prefix,
            request_id=request_id,
        )
    except LLMDisabledError:
        await record_explain_attempt(
            principal,
            request_id=request_id,
            client_ip=client_ip,
            status="unavailable",
            incident_id=incident.id,
            error="disabled",
        )
        raise AnalystUnavailableError("disabled") from None
    except LLMUnavailableError:
        await record_explain_attempt(
            principal,
            request_id=request_id,
            client_ip=client_ip,
            status="unavailable",
            incident_id=incident.id,
            error="unreachable",
        )
        raise AnalystUnavailableError("unreachable") from None

    try:
        body = await asyncio.to_thread(parse_report, invocation.text, refs=refs)
    except AnalystOutputError as exc:
        code = "rejected"
        if isinstance(exc.details, dict) and isinstance(exc.details.get("reason"), str):
            code = exc.details["reason"]
        await record_explain_attempt(
            principal,
            request_id=request_id,
            client_ip=client_ip,
            status="rejected",
            incident_id=incident.id,
            error=code,
        )
        raise

    row = AnalystReport(
        incident_id=incident.id,
        kind=incident.kind,
        severity=incident.severity,
        events_fingerprint=incident.events_fingerprint,
        event_count=incident.event_count,
        body=body.model_dump_json(),
        withheld_fields=withheld,
        provider=invocation.provider,
        model=invocation.model,
        fell_back=invocation.fell_back,
        latency_ms=invocation.latency_ms,
        request_id=request_id,
        key_prefix=principal.key_prefix,
    )
    async with async_session_maker() as session:
        row = await add_report(session, row)
    await record_explain_attempt(
        principal,
        request_id=request_id,
        client_ip=client_ip,
        status="ok",
        incident_id=incident.id,
        kind=incident.kind,
        withheld=withheld,
        provider=invocation.provider,
    )
    return _result_from_row(incident, row, body, cached=False)
