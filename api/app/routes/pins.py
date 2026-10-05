"""Read and change tool schema pins."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError

from app import database
from app.audit.events import (
    ACTION_TOOL_PIN_APPROVE,
    ACTION_TOOL_PIN_REVOKE,
    STATUS_OK,
    AuditRecord,
)
from app.audit.redaction import current_client_ip, current_request_id, safe_tool_name
from app.audit.sink import AuditUnavailableError, record_event
from app.auth.dependencies import authorize_route, get_principal
from app.auth.principal import Principal
from app.models.audit_events import AUDIT_DECISION_ALLOWED
from app.models.tool_pins import ToolPin
from app.repos.tool_pins import list_pins
from app.services.pins import (
    approve_named_tool,
    load_pin_row,
    revoke_named_tool,
    sync_pending_from_catalog,
)
from app.tools.catalog import (
    fingerprint_tool,
    get_tool_definition,
    list_tool_definitions,
)

router = APIRouter(
    prefix="/api/pins",
    tags=["pins"],
    dependencies=[Depends(authorize_route)],
)


class PinNoteBody(BaseModel):
    note: str | None = Field(default=None, max_length=500)


class ToolPinOut(BaseModel):
    tool_name: str
    status: str | None
    fingerprint: str | None
    live_fingerprint: str | None
    matches: bool
    implementation_digest: str | None
    approved_at: datetime | None
    approved_by_api_key_id: str | None
    revoked_at: datetime | None
    note: str | None
    created_at: datetime | None
    updated_at: datetime | None


class ToolPinList(BaseModel):
    items: list[ToolPinOut]


class PinSyncOut(BaseModel):
    updated: list[str]


def _view(row: ToolPin | None, tool_name: str) -> ToolPinOut:
    definition = get_tool_definition(tool_name)
    live = fingerprint_tool(definition) if definition is not None else None
    pinned = None if row is None else row.fingerprint
    return ToolPinOut(
        tool_name=tool_name,
        status=None if row is None else row.status,
        fingerprint=pinned,
        live_fingerprint=live,
        matches=pinned is not None and live is not None and pinned == live,
        implementation_digest=None if row is None else row.implementation_digest,
        approved_at=None if row is None else row.approved_at,
        approved_by_api_key_id=None if row is None else row.approved_by_api_key_id,
        revoked_at=None if row is None else row.revoked_at,
        note=None if row is None else row.note,
        created_at=None if row is None else row.created_at,
        updated_at=None if row is None else row.updated_at,
    )


@router.get("", response_model=ToolPinList)
async def list_tool_pins() -> ToolPinList:
    """List catalog tools and any stored pins. ``matches`` compares the hashes."""

    async with database.async_session_maker() as session:
        stored = await list_pins(session)
        for row in stored:
            session.expunge(row)
        rows = {row.tool_name: row for row in stored}
    names = {definition.name for definition in list_tool_definitions()}
    names.update(rows)
    items = [_view(rows.get(name), name) for name in sorted(names)]
    return ToolPinList(items=items)


@router.get("/{tool_name}", response_model=ToolPinOut)
async def get_tool_pin(tool_name: str) -> ToolPinOut:
    """Return one pin, including a catalog tool that has no row yet."""

    definition = get_tool_definition(tool_name)
    row = await load_pin_row(tool_name)
    if definition is None and row is None:
        raise HTTPException(status_code=404, detail="Tool pin not found.")
    if row is not None and definition is None:
        return _view(row, row.tool_name)
    return _view(row, tool_name)


@router.post("/sync", response_model=PinSyncOut)
async def sync_tool_pins() -> PinSyncOut:
    """Write pending pins for catalog schemas that are not already stored."""

    updated = await sync_pending_from_catalog()
    return PinSyncOut(updated=updated)


@router.post("/{tool_name}/approve", response_model=ToolPinOut)
async def approve_tool_pin(
    tool_name: str,
    principal: Annotated[Principal, Depends(get_principal)],
    body: PinNoteBody | None = None,
) -> ToolPinOut:
    """Approve the live fingerprint. The stored hash is the one just read."""

    definition = get_tool_definition(tool_name)
    if definition is None:
        raise HTTPException(status_code=404, detail="Tool is not registered.")
    live = fingerprint_tool(definition)
    await _audit_pin_change(
        action=ACTION_TOOL_PIN_APPROVE,
        tool_name=definition.name,
        fingerprint=live,
        principal=principal,
    )
    try:
        row = await approve_named_tool(
            definition.name,
            approved_by_api_key_id=principal.api_key_id,
            note=None if body is None else body.note,
        )
    except IntegrityError:
        raise HTTPException(
            status_code=400,
            detail="Approver is not a known API key.",
        ) from None
    return _view(row, definition.name)


@router.post("/{tool_name}/revoke", response_model=ToolPinOut)
async def revoke_tool_pin(
    tool_name: str,
    principal: Annotated[Principal, Depends(get_principal)],
    body: PinNoteBody | None = None,
) -> ToolPinOut:
    """Revoke a stored pin. A missing row is 404 and is not audited."""

    existing = await load_pin_row(tool_name)
    if existing is None:
        raise HTTPException(status_code=404, detail="Tool pin not found.")
    await _audit_pin_change(
        action=ACTION_TOOL_PIN_REVOKE,
        tool_name=existing.tool_name,
        fingerprint=existing.fingerprint,
        principal=principal,
    )
    row = await revoke_named_tool(
        existing.tool_name,
        note=None if body is None else body.note,
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Tool pin not found.")
    return _view(row, row.tool_name)


async def _audit_pin_change(
    *,
    action: str,
    tool_name: str,
    fingerprint: str,
    principal: Principal,
) -> None:
    """Write the required approval or revocation row before the pin changes."""

    try:
        await record_event(
            AuditRecord(
                action=action,
                decision=AUDIT_DECISION_ALLOWED,
                status=STATUS_OK,
                tool_name=safe_tool_name(tool_name),
                args_hash=fingerprint,
                request_id=current_request_id(),
                client_ip=current_client_ip(),
                **AuditRecord.actor_fields(principal),
            ),
            required=True,
        )
    except AuditUnavailableError:
        raise HTTPException(status_code=503, detail="Audit log unavailable.") from None
