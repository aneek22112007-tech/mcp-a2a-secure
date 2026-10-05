"""Decide whether a live tool schema matches its pin.

The in-memory cache holds pin rows only. The live fingerprint is computed
on every check. ``implementation_digest`` is stored for operators and is
never read by ``evaluate_tool``.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass

from app import database
from app.audit.events import (
    ACTION_TOOL_PIN_DENY,
    ACTION_TOOL_PIN_DRIFT,
    ACTION_TOOL_PIN_UNAPPROVED,
)
from app.config import settings
from app.models.tool_pins import ToolPin
from app.pins.gate import get_scan_gate
from app.pins.types import (
    MODE_ENFORCE,
    PIN_REASON_DRIFT,
    PIN_REASON_MISSING,
    PIN_REASON_REVOKED,
    PIN_REASON_SCAN_BLOCKED,
    PIN_STATUS_APPROVED,
    PIN_STATUS_REVOKED,
)
from app.repos.tool_pins import (
    approve_pin,
    get_pin,
    list_pins,
    revoke_pin,
    upsert_pending,
)
from app.tools.catalog import (
    fingerprint_tool,
    get_tool_definition,
    implementation_digest,
    list_tool_definitions,
)

logger = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class PinDecision:
    """Result of comparing one tool with its pin and the scan gate."""

    allowed: bool
    reason: str | None
    live_fingerprint: str | None
    pinned_fingerprint: str | None
    status: str | None


@dataclass(frozen=True, slots=True)
class _CachedPin:
    tool_name: str
    fingerprint: str
    status: str


_cache_rows: dict[str, _CachedPin] | None = None
_cache_deadline: float = 0.0
_cache_generation: int = 0


def clear_pin_cache() -> None:
    """Drop cached pin rows. The next check reads the database."""

    global _cache_rows, _cache_deadline, _cache_generation
    _cache_rows = None
    _cache_deadline = 0.0
    _cache_generation += 1


def pin_audit_action(reason: str) -> str:
    """Map a denial reason to the audit action that records it."""

    if reason == PIN_REASON_DRIFT:
        return ACTION_TOOL_PIN_DRIFT
    if reason in {PIN_REASON_REVOKED, PIN_REASON_SCAN_BLOCKED}:
        return ACTION_TOOL_PIN_DENY
    return ACTION_TOOL_PIN_UNAPPROVED


async def evaluate_tool(tool_name: str) -> PinDecision:
    """Compare the live schema with the stored pin.

    A revoked pin stays revoked even when the fingerprint still matches.
    Drift is reported when a pin exists and the live schema differs.
    Pending pins are not approvals. The scan gate runs only after the pin
    would otherwise allow the call. A lookup failure is treated as missing
    so enforce mode fails closed.
    """

    definition = get_tool_definition(tool_name)
    live = fingerprint_tool(definition) if definition is not None else None
    try:
        pin = await _cached_pin(tool_name)
    except Exception:
        logger.exception("tool pin lookup failed")
        return PinDecision(
            allowed=False,
            reason=PIN_REASON_MISSING,
            live_fingerprint=live,
            pinned_fingerprint=None,
            status=None,
        )

    if pin is None:
        return PinDecision(
            allowed=False,
            reason=PIN_REASON_MISSING,
            live_fingerprint=live,
            pinned_fingerprint=None,
            status=None,
        )
    if pin.status == PIN_STATUS_REVOKED:
        return PinDecision(
            allowed=False,
            reason=PIN_REASON_REVOKED,
            live_fingerprint=live,
            pinned_fingerprint=pin.fingerprint,
            status=pin.status,
        )
    if live is None or pin.fingerprint != live:
        return PinDecision(
            allowed=False,
            reason=PIN_REASON_DRIFT,
            live_fingerprint=live,
            pinned_fingerprint=pin.fingerprint,
            status=pin.status,
        )
    if pin.status != PIN_STATUS_APPROVED:
        return PinDecision(
            allowed=False,
            reason=PIN_REASON_MISSING,
            live_fingerprint=live,
            pinned_fingerprint=pin.fingerprint,
            status=pin.status,
        )

    try:
        blocked = await get_scan_gate().blocking_reason(tool_name, live)
    except Exception:
        logger.exception("tool pin scan failed")
        blocked = PIN_REASON_SCAN_BLOCKED
    if blocked:
        return PinDecision(
            allowed=False,
            reason=PIN_REASON_SCAN_BLOCKED,
            live_fingerprint=live,
            pinned_fingerprint=pin.fingerprint,
            status=pin.status,
        )
    return PinDecision(
        allowed=True,
        reason=None,
        live_fingerprint=live,
        pinned_fingerprint=pin.fingerprint,
        status=pin.status,
    )


async def visible_tool_names(names: list[str]) -> list[str]:
    """Return ``names`` unchanged unless pinning is enforced.

    In enforce mode, names that are not currently allowed are omitted.
    A check that fails is omitted as well.
    """

    if settings.tool_pinning_mode != MODE_ENFORCE:
        return list(names)
    visible: list[str] = []
    for name in names:
        try:
            decision = await evaluate_tool(name)
        except Exception:
            logger.exception("tool pin filter failed")
            continue
        if decision.allowed:
            visible.append(name)
    return visible


async def sync_pending_from_catalog() -> list[str]:
    """Store a pending pin wherever the catalog fingerprint is not already stored.

    An approved, pending, or revoked row whose fingerprint still matches is
    left alone. A different fingerprint becomes pending so it has to be
    approved again. Returns the tool names that were written.
    """

    updated: list[str] = []
    async with database.async_session_maker() as session:
        existing = {row.tool_name: row for row in await list_pins(session)}
        for definition in list_tool_definitions():
            live = fingerprint_tool(definition)
            current = existing.get(definition.name)
            if current is not None and current.fingerprint == live:
                continue
            await upsert_pending(
                session,
                tool_name=definition.name,
                fingerprint=live,
                implementation_digest=implementation_digest(definition.name),
            )
            updated.append(definition.name)
        await session.commit()
    clear_pin_cache()
    return updated


async def approve_named_tool(
    tool_name: str,
    *,
    approved_by_api_key_id: str | None,
    note: str | None,
) -> ToolPin:
    """Approve the live fingerprint of a registered tool. The caller audits."""

    definition = get_tool_definition(tool_name)
    if definition is None:
        raise LookupError(tool_name)
    async with database.async_session_maker() as session:
        row = await approve_pin(
            session,
            tool_name=definition.name,
            fingerprint=fingerprint_tool(definition),
            approved_by_api_key_id=approved_by_api_key_id,
            note=note,
            implementation_digest=implementation_digest(definition.name),
        )
        await session.commit()
        session.expunge(row)
    clear_pin_cache()
    return row


async def revoke_named_tool(tool_name: str, *, note: str | None) -> ToolPin | None:
    """Revoke a stored pin. Return None when the tool has no row."""

    async with database.async_session_maker() as session:
        row = await revoke_pin(session, tool_name, note=note)
        if row is None:
            return None
        await session.commit()
        session.expunge(row)
    clear_pin_cache()
    return row


async def approve_current_catalog(
    *,
    note: str | None,
    approved_by_api_key_id: str | None,
) -> list[str]:
    """Approve every tool currently registered. Used by startup and the script."""

    names: list[str] = []
    async with database.async_session_maker() as session:
        for definition in list_tool_definitions():
            await approve_pin(
                session,
                tool_name=definition.name,
                fingerprint=fingerprint_tool(definition),
                approved_by_api_key_id=approved_by_api_key_id,
                note=note,
                implementation_digest=implementation_digest(definition.name),
            )
            names.append(definition.name)
        await session.commit()
    clear_pin_cache()
    return names


async def bootstrap_approve_current_tools() -> list[str]:
    """Approve the catalog when bootstrap is on and the environment allows it.

    Production-like settings reject the flag before the process serves traffic.
    This check is a second guard so a direct call cannot approve production.
    """

    if settings.is_production_like or not settings.tool_pinning_bootstrap_approve:
        return []
    return await approve_current_catalog(
        note="bootstrap",
        approved_by_api_key_id=None,
    )


async def _cached_pin(tool_name: str) -> _CachedPin | None:
    rows = await _pins_by_name()
    return rows.get(tool_name)


async def _pins_by_name() -> dict[str, _CachedPin]:
    global _cache_rows, _cache_deadline

    now = time.monotonic()
    cached = _cache_rows
    if cached is not None and now < _cache_deadline:
        return cached

    while True:
        generation = _cache_generation
        async with database.async_session_maker() as session:
            stored_rows = await list_pins(session)
        if generation != _cache_generation:
            continue
        stored = {
            row.tool_name: _CachedPin(
                tool_name=row.tool_name,
                fingerprint=row.fingerprint,
                status=row.status,
            )
            for row in stored_rows
        }
        if generation != _cache_generation:
            continue
        ttl = settings.tool_pinning_cache_ttl_s
        if ttl <= 0:
            _cache_rows = None
            _cache_deadline = 0.0
            return stored
        _cache_rows = stored
        _cache_deadline = time.monotonic() + ttl
        return stored


async def load_pin_row(tool_name: str) -> ToolPin | None:
    """Read one pin from the database, bypassing the cache.

    The row is detached before the session closes so the caller can read it.
    An invalid tool name returns None.
    """

    try:
        async with database.async_session_maker() as session:
            row = await get_pin(session, tool_name)
            if row is not None:
                session.expunge(row)
            return row
    except ValueError:
        return None
