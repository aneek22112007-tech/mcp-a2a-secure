"""Tests for llm_calls database model, LLMCallRecorder hook, GET /api/llm-calls, 30-day cleanup, and metrics."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

import app.database as app_db
from app.llm.recording import DbLLMCallRecorder, LLMCallRecord, LLMCallRecorder
from app.main import app
from app.models import Base
from app.models.llm_calls import LLMCall
from app.repos.llm_calls import (
    cleanup_old_llm_calls,
    list_llm_calls,
)

pytestmark = pytest.mark.anyio


@pytest.fixture
async def test_db(tmp_path, monkeypatch):
    db_file = tmp_path / f"test_llm_{uuid.uuid4().hex}.db"
    engine = create_async_engine(f"sqlite+aiosqlite:///{db_file}")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    monkeypatch.setattr(app_db, "async_session_maker", maker)

    async with maker() as session:
        yield session

    await engine.dispose()


@pytest.fixture
async def http_client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


async def test_default_llm_call_recorder_is_log_only(test_db: AsyncSession):
    recorder = LLMCallRecorder()
    now = datetime.now(UTC)

    record = LLMCallRecord(
        provider="ollama",
        model="qwen3.5:9b",
        purpose="notes_agent.plan",
        status="ok",
        latency_ms=120,
        input_tokens=45,
        output_tokens=18,
        fell_back=False,
        key_prefix="mcpg_test",
        request_id="req-12345",
        error=None,
        created_at=now,
    )
    await recorder.record(record)

    _, total = await list_llm_calls(test_db)
    assert total == 0


async def test_db_llm_call_recorder_persists_row(test_db: AsyncSession):
    recorder = DbLLMCallRecorder()
    now = datetime.now(UTC)

    record = LLMCallRecord(
        provider="ollama",
        model="qwen3.5:9b",
        purpose="notes_agent.plan",
        status="ok",
        latency_ms=120,
        input_tokens=45,
        output_tokens=18,
        fell_back=False,
        key_prefix="mcpg_test",
        request_id="req-12345",
        error=None,
        created_at=now,
    )
    await recorder.record(record)

    calls, total = await list_llm_calls(test_db)
    assert total == 1
    call = calls[0]
    assert call.provider == "ollama"
    assert call.model == "qwen3.5:9b"
    assert call.purpose == "notes_agent.plan"
    assert call.error is None
    assert call.status == "ok"
    assert call.latency_ms == 120.0
    assert call.latency == 120.0
    assert call.input_tokens == 45
    assert call.output_tokens == 18
    assert call.fell_back is False
    assert call.is_fallback is False
    assert call.key_prefix == "mcpg_test"
    assert call.request_id == "req-12345"
    assert call.created_at == now
    assert call.timestamp == now


async def test_db_llm_call_recorder_nullable_tokens_and_error(test_db: AsyncSession):
    recorder = DbLLMCallRecorder()
    now = datetime.now(UTC)

    record = LLMCallRecord(
        provider="groq",
        model="llama-3.3-70b-versatile",
        purpose="notes_agent.summarize",
        status="error",
        latency_ms=85,
        input_tokens=None,
        output_tokens=None,
        fell_back=True,
        key_prefix=None,
        request_id=None,
        error="APITimeoutError",
        created_at=now,
    )
    await recorder.record(record)

    calls, total = await list_llm_calls(test_db)
    assert total == 1
    call = calls[0]
    assert call.purpose == "notes_agent.summarize"
    assert call.error == "APITimeoutError"
    assert call.input_tokens is None
    assert call.output_tokens is None
    assert call.fell_back is True
    assert call.is_fallback is True
    assert call.key_prefix == ""
    assert call.request_id == ""


async def test_admin_authorization(test_db: AsyncSession, http_client: AsyncClient):
    del test_db

    # 1. Unauthenticated -> 401
    resp_unauth = await http_client.get("/api/llm-calls")
    assert resp_unauth.status_code == 401

    # 2. Non-admin principal (mcpg_test only has notes:read, notes:write, agent:run) -> 403
    resp_non_admin = await http_client.get(
        "/api/llm-calls",
        headers={"Authorization": "Bearer mcpg_test"},
    )
    assert resp_non_admin.status_code == 403

    # 3. Admin principal (mcpg_admin has admin scope) -> 200
    resp_admin = await http_client.get(
        "/api/llm-calls",
        headers={"Authorization": "Bearer mcpg_admin"},
    )
    assert resp_admin.status_code == 200
    body = resp_admin.json()
    assert "items" in body
    assert "calls" in body
    assert "total" in body
    assert "metrics" in body


async def test_filtering_and_pagination(
    test_db: AsyncSession, http_client: AsyncClient
):
    # Insert rows directly
    now = datetime.now(UTC)
    for i in range(10):
        provider = "ollama" if i % 2 == 0 else "groq"
        status = "ok" if i < 8 else "fallback"
        is_fallback = status == "fallback"
        key_prefix = "key_a" if i < 5 else "key_b"
        call = LLMCall(
            id=str(uuid.uuid4()),
            model="test-model",
            provider=provider,
            input_tokens=10 * i,
            output_tokens=5 * i,
            latency_ms=100.0 + i,
            status=status,
            is_fallback=is_fallback,
            key_prefix=key_prefix,
            request_id=f"req-{i}",
            created_at=now + timedelta(seconds=i),
        )
        test_db.add(call)
    await test_db.commit()

    headers = {"Authorization": "Bearer mcpg_admin"}

    # Filter by provider
    resp = await http_client.get("/api/llm-calls?provider=ollama", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 5
    assert all(c["provider"] == "ollama" for c in data["items"])

    # Filter by status
    resp = await http_client.get("/api/llm-calls?status=fallback", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 2
    assert all(c["status"] == "fallback" for c in data["items"])

    # Filter by key_prefix
    resp = await http_client.get("/api/llm-calls?key_prefix=key_a", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["total"] == 5

    # Filter by key (alias)
    resp = await http_client.get("/api/llm-calls?key=key_b", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["total"] == 5

    # Pagination: limit 3, offset 2
    resp = await http_client.get("/api/llm-calls?limit=3&offset=2", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["items"]) == 3
    assert data["total"] == 10
    assert data["limit"] == 3
    assert data["offset"] == 2

    # Pagination via page query param: page 2, limit 4 -> offset 4
    resp = await http_client.get("/api/llm-calls?page=2&limit=4", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["items"]) == 4
    assert data["offset"] == 4


async def test_metrics_computation(test_db: AsyncSession, http_client: AsyncClient):
    headers = {"Authorization": "Bearer mcpg_admin"}

    # 1. Empty table edge case
    resp_empty = await http_client.get("/api/llm-calls", headers=headers)
    assert resp_empty.status_code == 200
    data = resp_empty.json()
    assert data["call_count"] == 0
    assert data["average_latency"] == 0.0
    assert data["fallback_rate"] == 0.0
    assert data["metrics"]["call_count"] == 0
    assert data["metrics"]["average_latency"] == 0.0
    assert data["metrics"]["fallback_rate"] == 0.0

    # 2. Add normal calls and fallback calls
    # Call 1: 100ms, not fallback
    # Call 2: 200ms, not fallback
    # Call 3: 300ms, fallback
    now = datetime.now(UTC)
    c1 = LLMCall(
        model="m1",
        provider="ollama",
        latency_ms=100.0,
        status="ok",
        is_fallback=False,
        created_at=now,
    )
    c2 = LLMCall(
        model="m2",
        provider="ollama",
        latency_ms=200.0,
        status="ok",
        is_fallback=False,
        created_at=now,
    )
    c3 = LLMCall(
        model="m3",
        provider="groq",
        latency_ms=300.0,
        status="fallback",
        is_fallback=True,
        created_at=now,
    )
    test_db.add_all([c1, c2, c3])
    await test_db.commit()

    resp = await http_client.get("/api/llm-calls", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["call_count"] == 3
    # Average latency: (100 + 200 + 300) / 3 = 200.0
    assert data["average_latency"] == 200.0
    # Fallback rate: 1 / 3 = 0.3333
    assert data["fallback_rate"] == 0.3333


async def test_30_day_retention_cleanup(test_db: AsyncSession):
    now = datetime.now(UTC)
    old_time = now - timedelta(days=35)
    recent_time = now - timedelta(days=5)

    old_call = LLMCall(
        model="old-model",
        provider="ollama",
        latency_ms=100.0,
        status="ok",
        created_at=old_time,
    )
    recent_call = LLMCall(
        model="recent-model",
        provider="ollama",
        latency_ms=120.0,
        status="ok",
        created_at=recent_time,
    )
    test_db.add_all([old_call, recent_call])
    await test_db.commit()

    # Verify both are present
    _, total = await list_llm_calls(test_db)
    assert total == 2

    # Run cleanup for 30 days
    deleted = await cleanup_old_llm_calls(db=test_db, retention_days=30)
    assert deleted == 1

    calls_after, total_after = await list_llm_calls(test_db)
    assert total_after == 1
    assert calls_after[0].model == "recent-model"


async def test_global_metrics_endpoint_includes_llm(
    test_db: AsyncSession, http_client: AsyncClient
):
    # Add one call
    now = datetime.now(UTC)
    call = LLMCall(
        model="m1",
        provider="ollama",
        latency_ms=150.0,
        status="ok",
        is_fallback=False,
        created_at=now,
    )
    test_db.add(call)
    await test_db.commit()

    resp = await http_client.get(
        "/api/metrics", headers={"Authorization": "Bearer mcpg_admin"}
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "llm" in data
    assert data["llm"]["available"] is True
    assert data["llm"]["call_count"] == 1
    assert data["llm"]["average_latency"] == 150.0
