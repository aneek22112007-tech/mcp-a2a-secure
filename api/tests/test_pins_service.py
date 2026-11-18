"""Tool pin sync, approval, and the pins list, on SQLite."""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

import app.database as app_db
import app.routes.pins as pins_routes
import app.services.scanner as scanner_service
from app.config import settings
from app.main import app
from app.models import ApiKey, Base, Client
from app.pins.types import PIN_STATUS_APPROVED, PIN_STATUS_PENDING, PIN_STATUS_REVOKED
from app.repos.tool_pins import list_pins
from app.services.pins import sync_pending_from_catalog
from app.tools.catalog import ToolDefinition, list_tool_definitions

pytestmark = pytest.mark.anyio

_AUTH = {"Authorization": "Bearer mcpg_admin"}


@pytest.fixture
async def pin_db(tmp_path, monkeypatch):
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path}/pins.db")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    monkeypatch.setattr(app_db, "async_session_maker", maker)
    monkeypatch.setattr(scanner_service, "async_session_maker", maker)
    async with maker() as session:
        session.add(Client(id="admin", name="admin", status="active"))
        session.add(
            ApiKey(
                id="admin",
                client_id="admin",
                name="admin",
                key_prefix="mcpg_adm",
                key_hash="pins-test-admin-hash",
                scopes=["admin"],
            )
        )
        await session.commit()
    yield maker
    await engine.dispose()


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as http:
        yield http


async def test_sync_creates_pins_for_catalog_tools(pin_db):
    catalog = [definition.name for definition in list_tool_definitions()]
    written = await sync_pending_from_catalog()

    async with pin_db() as session:
        rows = await list_pins(session)

    assert sorted(written) == sorted(catalog)
    assert {row.tool_name for row in rows} == set(catalog)
    assert all(row.status == PIN_STATUS_PENDING for row in rows)


async def test_approve_then_revoke_changes_state_and_writes_audit(
    pin_db, client, memory_audit_sink
):
    tool_name = list_tool_definitions()[0].name
    await sync_pending_from_catalog()

    approved = await client.post(f"/api/pins/{tool_name}/approve", headers=_AUTH)
    assert approved.status_code == 200
    assert approved.json()["status"] == PIN_STATUS_APPROVED

    revoked = await client.post(f"/api/pins/{tool_name}/revoke", headers=_AUTH)
    assert revoked.status_code == 200
    assert revoked.json()["status"] == PIN_STATUS_REVOKED

    async with pin_db() as session:
        rows = await list_pins(session)
    stored = next(row for row in rows if row.tool_name == tool_name)
    assert stored.status == PIN_STATUS_REVOKED

    actions = [record.action for record in memory_audit_sink.records]
    assert "tool.pin.approve" in actions
    assert "tool.pin.revoke" in actions


async def test_changed_tool_definition_shows_matches_false(pin_db, client, monkeypatch):
    tool_name = list_tool_definitions()[0].name
    approved = await client.post(f"/api/pins/{tool_name}/approve", headers=_AUTH)
    assert approved.status_code == 200
    assert approved.json()["matches"] is True

    original = pins_routes.get_tool_definition

    def drifted(name: str):
        definition = original(name)
        if definition is None or name != tool_name:
            return definition
        return ToolDefinition(
            name=definition.name,
            description=definition.description + " schema changed after approval",
            input_schema=definition.input_schema,
            output_schema=definition.output_schema,
        )

    monkeypatch.setattr(pins_routes, "get_tool_definition", drifted)

    listed = await client.get("/api/pins", headers=_AUTH)
    assert listed.status_code == 200
    item = next(row for row in listed.json()["items"] if row["tool_name"] == tool_name)
    assert item["matches"] is False


async def test_list_pins_mode_matches_setting(pin_db, client, monkeypatch):
    for mode in ("off", "warn", "enforce"):
        monkeypatch.setattr(settings, "tool_pinning_mode", mode)
        response = await client.get("/api/pins", headers=_AUTH)
        assert response.status_code == 200
        assert response.json()["mode"] == settings.tool_pinning_mode
