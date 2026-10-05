"""Async persistence helpers for tool pins."""

from __future__ import annotations

import re

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.base import utc_now
from app.models.tool_pins import ToolPin
from app.pins.types import (
    PIN_STATUS_APPROVED,
    PIN_STATUS_PENDING,
    PIN_STATUS_REVOKED,
    PIN_STATUSES,
)
from app.repos.common import require_text

_FINGERPRINT_RE = re.compile(r"^[0-9a-f]{64}$")
_TOOL_NAME_RE = re.compile(r"^[A-Za-z0-9_.-]{1,100}$")
_NOTE_MAX = 500


def _tool_name(value: str) -> str:
    name = require_text(value, field="tool_name", max_length=100)
    if not _TOOL_NAME_RE.fullmatch(name):
        raise ValueError("tool_name contains unsupported characters")
    return name


def _fingerprint(value: str) -> str:
    fingerprint = require_text(value, field="fingerprint", max_length=64)
    if not _FINGERPRINT_RE.fullmatch(fingerprint):
        raise ValueError("fingerprint must be a 64 character sha256 hex digest")
    return fingerprint


def _digest(value: str | None) -> str | None:
    if value is None:
        return None
    digest = require_text(value, field="implementation_digest", max_length=64)
    if not _FINGERPRINT_RE.fullmatch(digest):
        raise ValueError(
            "implementation_digest must be a 64 character sha256 hex digest"
        )
    return digest


def _note(value: str | None) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        raise TypeError("note must be a string")
    cleaned = value.strip()
    if not cleaned:
        return None
    if len(cleaned) > _NOTE_MAX:
        raise ValueError("note must be at most 500 characters")
    return cleaned


def _status(value: str) -> str:
    status = require_text(value, field="status", max_length=16)
    if status not in PIN_STATUSES:
        raise ValueError("invalid pin status")
    return status


async def get_pin(session: AsyncSession, tool_name: str) -> ToolPin | None:
    """Return the pin for ``tool_name``, or None."""

    name = _tool_name(tool_name)
    result = await session.execute(select(ToolPin).where(ToolPin.tool_name == name))
    return result.scalar_one_or_none()


async def list_pins(session: AsyncSession) -> list[ToolPin]:
    """Return every pin, ordered by tool name."""

    result = await session.execute(select(ToolPin).order_by(ToolPin.tool_name.asc()))
    return list(result.scalars().all())


async def upsert_pending(
    session: AsyncSession,
    *,
    tool_name: str,
    fingerprint: str,
    implementation_digest: str | None,
) -> ToolPin:
    """Insert or replace a pin as pending for the given fingerprint.

    A previous approval is cleared. The caller commits.
    """

    name = _tool_name(tool_name)
    digest = _digest(implementation_digest)
    current = await get_pin(session, name)
    now = utc_now()
    if current is None:
        current = ToolPin(
            tool_name=name,
            fingerprint=_fingerprint(fingerprint),
            status=PIN_STATUS_PENDING,
            implementation_digest=digest,
            approved_at=None,
            approved_by_api_key_id=None,
            revoked_at=None,
            note=None,
            created_at=now,
            updated_at=now,
        )
        session.add(current)
    else:
        current.fingerprint = _fingerprint(fingerprint)
        current.status = _status(PIN_STATUS_PENDING)
        current.implementation_digest = digest
        current.approved_at = None
        current.approved_by_api_key_id = None
        current.revoked_at = None
        current.updated_at = now
    await session.flush()
    return current


async def approve_pin(
    session: AsyncSession,
    *,
    tool_name: str,
    fingerprint: str,
    approved_by_api_key_id: str | None,
    note: str | None,
    implementation_digest: str | None,
) -> ToolPin:
    """Store an approved pin for the live fingerprint. The caller commits."""

    name = _tool_name(tool_name)
    digest = _digest(implementation_digest)
    stored_note = _note(note)
    approver = approved_by_api_key_id
    if approver is not None:
        approver = require_text(approver, field="approved_by_api_key_id", max_length=36)
    current = await get_pin(session, name)
    now = utc_now()
    if current is None:
        current = ToolPin(
            tool_name=name,
            fingerprint=_fingerprint(fingerprint),
            status=PIN_STATUS_APPROVED,
            implementation_digest=digest,
            approved_at=now,
            approved_by_api_key_id=approver,
            revoked_at=None,
            note=stored_note,
            created_at=now,
            updated_at=now,
        )
        session.add(current)
    else:
        current.fingerprint = _fingerprint(fingerprint)
        current.status = _status(PIN_STATUS_APPROVED)
        current.implementation_digest = digest
        current.approved_at = now
        current.approved_by_api_key_id = approver
        current.revoked_at = None
        if stored_note is not None:
            current.note = stored_note
        current.updated_at = now
    await session.flush()
    return current


async def revoke_pin(
    session: AsyncSession,
    tool_name: str,
    *,
    note: str | None,
) -> ToolPin | None:
    """Mark a pin revoked. Return None when no row exists. The caller commits."""

    current = await get_pin(session, tool_name)
    if current is None:
        return None
    stored_note = _note(note)
    now = utc_now()
    current.status = _status(PIN_STATUS_REVOKED)
    current.revoked_at = now
    current.updated_at = now
    if stored_note is not None:
        current.note = stored_note
    await session.flush()
    return current
