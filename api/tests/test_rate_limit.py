import time

import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from starlette.requests import Request

import app.main  # noqa: F401
from app.audit import get_audit_sink
from app.auth.principal import Principal
from app.config import settings
from app.models import Base
from app.models.audit_events import AuditEvent
from app.rate_limit import (
    SHARED_SURFACE,
    McpRateLimitMiddleware,
    TokenBucketRateLimiter,
    limiter,
    rate_limit_dependency,
)
from app.repos.metrics import get_metrics_summary


def test_rate_limiter_basics(monkeypatch):
    monkeypatch.setattr(settings, "rate_limit_capacity", 2)
    monkeypatch.setattr(settings, "rate_limit_refill_rate_per_sec", 10.0)

    limiter = TokenBucketRateLimiter()

    allowed, retry, _ = limiter.acquire("rest", "key1")
    assert allowed is True
    assert retry == 0.0

    allowed, retry, _ = limiter.acquire("rest", "key1")
    assert allowed is True
    assert retry == 0.0

    allowed, retry, should_audit = limiter.acquire("rest", "key1")
    assert allowed is False
    assert retry > 0.0
    assert should_audit is True


def test_rate_limiter_independent_buckets(monkeypatch):
    monkeypatch.setattr(settings, "rate_limit_capacity", 1)
    monkeypatch.setattr(settings, "rate_limit_refill_rate_per_sec", 10.0)

    limiter = TokenBucketRateLimiter()

    allowed, _, _ = limiter.acquire("rest", "key1")
    assert allowed is True

    allowed, _, _ = limiter.acquire("rest", "key1")
    assert allowed is False

    allowed, _, _ = limiter.acquire("rest", "key2")
    assert allowed is True

    allowed, _, _ = limiter.acquire("mcp", "key1")
    assert allowed is True


def test_rate_limiter_refill(monkeypatch):
    monkeypatch.setattr(settings, "rate_limit_capacity", 1)
    monkeypatch.setattr(settings, "rate_limit_refill_rate_per_sec", 10.0)

    limiter = TokenBucketRateLimiter()

    allowed, _, _ = limiter.acquire("rest", "key1")
    assert allowed is True

    allowed, retry, should_audit = limiter.acquire("rest", "key1")
    assert allowed is False
    assert retry > 0
    assert should_audit is True

    allowed, retry, should_audit = limiter.acquire("rest", "key1")
    assert allowed is False
    assert should_audit is False  # Throttled

    time.sleep(retry + 0.01)

    allowed, _, _ = limiter.acquire("rest", "key1")
    assert allowed is True


# ===========================================================================
# P8 C1: Shared Rate Limit Bucket Tests
# ===========================================================================


def test_shared_surface_constant():
    """Verify SHARED_SURFACE is 'key'."""
    assert SHARED_SURFACE == "key"


@pytest.mark.anyio
async def test_rest_and_mcp_share_rate_limit_bucket(monkeypatch):
    """1. REST and MCP use the same bucket identity for the same API key.
    2. A request consuming a token through REST reduces the tokens available to MCP for that same key.
    """
    monkeypatch.setattr(settings, "rate_limit_capacity", 2)
    monkeypatch.setattr(settings, "rate_limit_refill_rate_per_sec", 0.001)

    key_id = "test-shared-key-1"
    principal = Principal(
        api_key_id=key_id,
        client_id="c1",
        key_prefix="pref",
        scopes=frozenset({"notes:read"}),
    )

    # 1. Consume 1 token via REST
    req = Request(
        {"type": "http", "method": "GET", "path": "/api/notes", "headers": []}
    )
    await rate_limit_dependency(req, principal=principal)

    # Bucket key must be (SHARED_SURFACE, key_id)
    assert (SHARED_SURFACE, key_id) in limiter._buckets
    assert limiter._buckets[(SHARED_SURFACE, key_id)].tokens == pytest.approx(
        1.0, abs=0.01
    )

    # 2. Consume 1 token via MCP for the same key
    mcp_called = False

    async def dummy_app(scope, receive, send):
        nonlocal mcp_called
        mcp_called = True
        await send({"type": "http.response.start", "status": 200, "headers": []})

    middleware = McpRateLimitMiddleware(dummy_app)
    scope = {
        "type": "http",
        "method": "POST",
        "path": "/mcp",
        "headers": [],
        "mcp_guard.principal": principal,
    }
    sent = []

    async def dummy_send(msg):
        sent.append(msg)

    async def dummy_receive():
        return {"type": "http.request", "body": b""}

    await middleware(scope, dummy_receive, dummy_send)
    assert mcp_called is True
    assert limiter._buckets[(SHARED_SURFACE, key_id)].tokens == pytest.approx(
        0.0, abs=0.01
    )

    # 3. Third request via REST must be rejected (429)
    with pytest.raises(HTTPException) as exc_info:
        await rate_limit_dependency(req, principal=principal)
    assert exc_info.value.status_code == 429

    # 4. Fourth request via MCP must also be rejected (429)
    sent_mcp_denied = []

    async def send_denied(msg):
        sent_mcp_denied.append(msg)

    await middleware(scope, dummy_receive, send_denied)
    assert any(msg.get("status") == 429 for msg in sent_mcp_denied)


@pytest.mark.anyio
async def test_mcp_consumption_reduces_rest_tokens(monkeypatch):
    """3. A request consuming a token through MCP reduces the tokens available to REST for that same key."""
    monkeypatch.setattr(settings, "rate_limit_capacity", 1)
    monkeypatch.setattr(settings, "rate_limit_refill_rate_per_sec", 0.001)

    key_id = "test-shared-key-2"
    principal = Principal(
        api_key_id=key_id,
        client_id="c1",
        key_prefix="pref",
        scopes=frozenset({"notes:read"}),
    )

    # Consume token via MCP
    async def dummy_app(scope, receive, send):
        await send({"type": "http.response.start", "status": 200, "headers": []})

    middleware = McpRateLimitMiddleware(dummy_app)
    scope = {
        "type": "http",
        "method": "POST",
        "path": "/mcp",
        "headers": [],
        "mcp_guard.principal": principal,
    }
    sent = []

    async def dummy_send(msg):
        sent.append(msg)

    async def dummy_receive():
        return {"type": "http.request", "body": b""}

    await middleware(scope, dummy_receive, dummy_send)
    assert any(msg.get("status") == 200 for msg in sent)

    # REST request must immediately fail with 429
    req = Request(
        {"type": "http", "method": "GET", "path": "/api/notes", "headers": []}
    )
    with pytest.raises(HTTPException) as exc_info:
        await rate_limit_dependency(req, principal=principal)
    assert exc_info.value.status_code == 429


@pytest.mark.anyio
async def test_different_api_keys_receive_separate_buckets(monkeypatch):
    """4. Different API key IDs still receive separate buckets."""
    monkeypatch.setattr(settings, "rate_limit_capacity", 1)
    monkeypatch.setattr(settings, "rate_limit_refill_rate_per_sec", 0.001)

    key_a = Principal(
        api_key_id="key-a",
        client_id="c1",
        key_prefix="pref_a",
        scopes=frozenset({"notes:read"}),
    )
    key_b = Principal(
        api_key_id="key-b",
        client_id="c2",
        key_prefix="pref_b",
        scopes=frozenset({"notes:read"}),
    )

    req = Request(
        {"type": "http", "method": "GET", "path": "/api/notes", "headers": []}
    )

    # Exhaust key A on REST
    await rate_limit_dependency(req, principal=key_a)
    with pytest.raises(HTTPException):
        await rate_limit_dependency(req, principal=key_a)

    # Key B should still be allowed on MCP
    mcp_called = False

    async def dummy_app(scope, receive, send):
        nonlocal mcp_called
        mcp_called = True
        await send({"type": "http.response.start", "status": 200, "headers": []})

    middleware = McpRateLimitMiddleware(dummy_app)
    scope_b = {
        "type": "http",
        "method": "POST",
        "path": "/mcp",
        "headers": [],
        "mcp_guard.principal": key_b,
    }

    async def dummy_send(msg):
        pass

    async def dummy_receive():
        return {"type": "http.request", "body": b""}

    await middleware(scope_b, dummy_receive, dummy_send)
    assert mcp_called is True


@pytest.mark.anyio
async def test_audit_records_include_surface_tag(monkeypatch):
    """5. REST audit denials contain 'rate_limit_exceeded surface=rest'.
    6. MCP audit denials contain 'rate_limit_exceeded surface=mcp'.
    """
    monkeypatch.setattr(settings, "rate_limit_capacity", 1)
    monkeypatch.setattr(settings, "rate_limit_refill_rate_per_sec", 0.001)

    sink = get_audit_sink()
    sink.records.clear()

    principal_rest = Principal(
        api_key_id="key-audit-rest",
        client_id="c1",
        key_prefix="pref_rest",
        scopes=frozenset({"notes:read"}),
    )
    req = Request(
        {"type": "http", "method": "GET", "path": "/api/notes", "headers": []}
    )

    # 1st consumes token, 2nd denies and audits
    await rate_limit_dependency(req, principal=principal_rest)
    with pytest.raises(HTTPException):
        await rate_limit_dependency(req, principal=principal_rest)

    rest_audit = next(
        (
            r
            for r in sink.records
            if r.action == "rate_limit.deny" and r.api_key_id == "key-audit-rest"
        ),
        None,
    )
    assert rest_audit is not None
    assert rest_audit.reason == "rate_limit_exceeded surface=rest"
    assert rest_audit.decision == "denied"
    assert rest_audit.status == "denied"

    # MCP denial audit
    principal_mcp = Principal(
        api_key_id="key-audit-mcp",
        client_id="c2",
        key_prefix="pref_mcp",
        scopes=frozenset({"notes:read"}),
    )

    async def dummy_app(scope, receive, send):
        await send({"type": "http.response.start", "status": 200, "headers": []})

    middleware = McpRateLimitMiddleware(dummy_app)
    scope_mcp = {
        "type": "http",
        "method": "POST",
        "path": "/mcp",
        "headers": [],
        "mcp_guard.principal": principal_mcp,
    }

    async def dummy_send(msg):
        pass

    async def dummy_receive():
        return {"type": "http.request", "body": b""}

    # 1st consumes token, 2nd denies and audits
    await middleware(scope_mcp, dummy_receive, dummy_send)
    await middleware(scope_mcp, dummy_receive, dummy_send)

    mcp_audit = next(
        (
            r
            for r in sink.records
            if r.action == "rate_limit.deny" and r.api_key_id == "key-audit-mcp"
        ),
        None,
    )
    assert mcp_audit is not None
    assert mcp_audit.reason == "rate_limit_exceeded surface=mcp"
    assert mcp_audit.decision == "denied"
    assert mcp_audit.status == "denied"


@pytest.mark.anyio
async def test_metrics_counts_all_rate_limit_reason_variants(tmp_path):
    """7. Metrics count both reason variants through the prefix query."""
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path}/test_metrics.db")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with maker() as session:
        session.add_all(
            [
                AuditEvent(
                    action="rate_limit.deny",
                    decision="denied",
                    status="denied",
                    reason="rate_limit_exceeded surface=rest",
                ),
                AuditEvent(
                    action="rate_limit.deny",
                    decision="denied",
                    status="denied",
                    reason="rate_limit_exceeded surface=mcp",
                ),
                AuditEvent(
                    action="rate_limit.deny",
                    decision="denied",
                    status="denied",
                    reason="rate_limit_exceeded",  # legacy reason without suffix
                ),
                AuditEvent(
                    action="auth.deny",
                    decision="denied",
                    status="denied",
                    reason="token_expired",  # unrelated denial
                ),
                AuditEvent(
                    action="tool.run",
                    decision="allowed",
                    status="ok",
                    reason=None,
                ),
            ]
        )
        await session.commit()

        summary = await get_metrics_summary(session)
        assert summary["totals"]["rate_limit_rejections"] == 3
        assert summary["totals"]["denied"] == 4
        assert summary["totals"]["successful"] == 1
        assert summary["totals"]["total"] == 5

    await engine.dispose()
