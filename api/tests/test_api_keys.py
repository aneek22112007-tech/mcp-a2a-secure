import hmac
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.bearer import API_KEY_TOKEN_PREFIX
from app.main import app
from app.repos.clients import create as create_client
from app.services.api_keys import (
    HmacApiKeyVerifier,
    _hash_secret,
    generate_api_key,
)

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from app.models import Base

@pytest.fixture
async def session(tmp_path, monkeypatch):
    import app.database  # noqa: F401
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path}/keys.db")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    # Patch the app's session maker to use our test maker in all modules that imported it
    monkeypatch.setattr(app.database, "async_session_maker", maker)
    monkeypatch.setattr("app.services.api_keys.async_session_maker", maker)
    monkeypatch.setattr("app.routes.api_keys.async_session_maker", maker)
    
    async with maker() as db:
        yield db
        await db.rollback()
    await engine.dispose()
@pytest.fixture
def client_app():
    from app.auth.verifier import set_api_key_verifier
    set_api_key_verifier(HmacApiKeyVerifier())
    client = TestClient(app, base_url="http://localhost:8000")
    yield client
    from tests.conftest import DummyVerifier
    set_api_key_verifier(DummyVerifier())


@pytest.mark.anyio
async def test_generate_and_verify_api_key(session: AsyncSession):
    # Create client
    client = await create_client(session, name="Test Client")
    
    # Generate key
    api_key, raw_key = await generate_api_key(
        session=session,
        client_id=client.id,
        name="Test Key",
        scopes=["notes:read"]
    )
    
    assert raw_key.startswith(API_KEY_TOKEN_PREFIX)
    assert len(api_key.key_prefix) == 8
    
    # Verify hash is stored correctly
    prefix, secret = raw_key[len(API_KEY_TOKEN_PREFIX):].split("_", 1)
    assert api_key.key_prefix == prefix
    
    expected_hash = _hash_secret(secret)
    assert hmac.compare_digest(api_key.key_hash, expected_hash)
    
    await session.commit()
    
    # Verify key using HmacApiKeyVerifier
    verifier = HmacApiKeyVerifier()
    principal = await verifier.verify(raw_key)
    
    assert principal is not None
    assert principal.client_id == client.id
    assert principal.key_prefix == prefix
    assert "notes:read" in principal.scopes


@pytest.mark.anyio
async def test_authentication_edge_cases(session: AsyncSession):
    verifier = HmacApiKeyVerifier()
    client = await create_client(session, name="Test Client")
    _api_key, raw_key = await generate_api_key(
        session=session, client_id=client.id, name="K", scopes=["notes:read"]
    )
    
    # Malformed format
    assert await verifier.verify("invalid_key") is None
    assert await verifier.verify(f"{API_KEY_TOKEN_PREFIX}prefixonly") is None
    
    # Unknown prefix
    assert await verifier.verify(f"{API_KEY_TOKEN_PREFIX}unknown_secret") is None
    
    # Incorrect secret
    prefix = raw_key[len(API_KEY_TOKEN_PREFIX):].split("_")[0]
    assert await verifier.verify(f"{API_KEY_TOKEN_PREFIX}{prefix}_wrongsecret") is None


@pytest.mark.anyio
async def test_key_revocation_and_expiration(session: AsyncSession):
    verifier = HmacApiKeyVerifier()
    client = await create_client(session, name="Test Client")
    api_key, raw_key = await generate_api_key(
        session=session, client_id=client.id, name="K", scopes=[]
    )
    
    # Revoke
    api_key.revoked_at = datetime.now(UTC)
    await session.commit()
    assert await verifier.verify(raw_key) is None
    
    # Expire
    api_key.revoked_at = None
    api_key.expires_at = datetime.now(UTC) - timedelta(days=1)
    await session.commit()
    assert await verifier.verify(raw_key) is None


@pytest.mark.anyio
async def test_admin_api_endpoints(client_app, session: AsyncSession):
    client = await create_client(session, name="Test Client")
    
    # Create an admin key to use the endpoints
    _admin_key, raw_admin = await generate_api_key(
        session=session, client_id=client.id, name="Admin", scopes=["admin"]
    )
    await session.commit()
    
    # Test POST /api/keys
    res = client_app.post(
        "/api/keys",
        headers={"Authorization": f"Bearer {raw_admin}"},
        json={"client_id": client.id, "name": "New Key", "scopes": ["notes:read"]}
    )
    assert res.status_code == 201
    data = res.json()
    assert "raw_key" in data
    new_key_id = data["id"]
    
    # Test GET /api/keys
    res = client_app.get(
        f"/api/keys?client_id={client.id}",
        headers={"Authorization": f"Bearer {raw_admin}"}
    )
    assert res.status_code == 200
    keys = res.json()["keys"]
    assert len(keys) >= 2
    assert "key_hash" not in keys[0]
    
    # Test DELETE /api/keys/{id}
    res = client_app.delete(
        f"/api/keys/{new_key_id}",
        headers={"Authorization": f"Bearer {raw_admin}"}
    )
    assert res.status_code == 200
    
    # Verify it is revoked
    res = client_app.get(
        f"/api/keys?client_id={client.id}",
        headers={"Authorization": f"Bearer {raw_admin}"}
    )
    revoked_key = next(k for k in res.json()["keys"] if k["id"] == new_key_id)
    assert revoked_key["revoked_at"] is not None

