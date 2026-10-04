import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.main import app
from app.models import Base
from app.models.audit_events import AuditEvent
from app.repos.clients import create as create_client
from app.services.api_keys import generate_api_key


@pytest.fixture
async def session(tmp_path, monkeypatch):
    import app.database

    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path}/keys.db")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    monkeypatch.setattr(app.database, "async_session_maker", maker)
    monkeypatch.setattr("app.services.api_keys.async_session_maker", maker)
    monkeypatch.setattr("app.routes.api_keys.async_session_maker", maker)
    monkeypatch.setattr("app.routes.audit.database.async_session_maker", maker)
    monkeypatch.setattr("app.routes.metrics.database.async_session_maker", maker)

    async with maker() as db:
        yield db
        await db.rollback()
    await engine.dispose()


@pytest.fixture
def client_app():
    from app.auth.verifier import set_api_key_verifier
    from app.services.api_keys import HmacApiKeyVerifier

    set_api_key_verifier(HmacApiKeyVerifier())
    client = TestClient(app, base_url="http://localhost:8000")
    yield client
    from tests.conftest import DummyVerifier

    set_api_key_verifier(DummyVerifier())


from app.repos.audit import add_event


@pytest.mark.anyio
async def test_api_cannot_mutate_audit_events(
    client_app,
    session,
):
    """Test that no API route can modify or delete existing audit events."""
    client = await create_client(session, name="Test Client")
    _admin_key, raw_admin = await generate_api_key(
        session=session,
        client_id=client.id,
        name="Admin",
        scopes=["admin", "audit:read"],
    )

    # 1. Create an event in the DB directly since MemoryAuditSink intercepts API logs
    db_event = await add_event(
        session,
        decision="allowed",
        action="test.action",
        status="ok",
        client_id=client.id,
    )
    await session.commit()

    event_id = db_event.id
    original_action = db_event.action

    # 2. Attempt unauthorized/unsupported mutations
    # The API does not map PUT, POST, or DELETE for /api/audit/{id}

    put_res = client_app.put(
        f"/api/audit/{event_id}",
        headers={"Authorization": f"Bearer {raw_admin}"},
        json={"action": "hacked"},
    )
    assert put_res.status_code in (404, 405)

    delete_res = client_app.delete(
        f"/api/audit/{event_id}",
        headers={"Authorization": f"Bearer {raw_admin}"},
    )
    assert delete_res.status_code in (404, 405)

    post_res = client_app.post(
        f"/api/audit/{event_id}",
        headers={"Authorization": f"Bearer {raw_admin}"},
        json={"action": "hacked"},
    )
    assert post_res.status_code in (404, 405)

    # 3. Verify the record remains unchanged in the database
    stmt = select(AuditEvent).where(AuditEvent.id == event_id)
    result = await session.execute(stmt)
    db_event = result.scalar_one()

    assert db_event.action == original_action, "Audit event was modified!"
    assert db_event.id == event_id, "Audit event was deleted or modified!"
