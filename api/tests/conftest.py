import uuid
from datetime import UTC, datetime

import pytest

from app.audit import (
    AuditEventOut,
    AuditRecord,
    get_audit_sink,
    set_audit_sink,
)
from app.auth import ApiKeyVerifier, Principal, set_api_key_verifier
from app.auth.throttle import auth_failure_throttle


class DummyVerifier(ApiKeyVerifier):
    async def verify(self, raw_key: str) -> Principal | None:
        if raw_key == "mcpg_test":
            return Principal(
                api_key_id="test",
                client_id="test",
                key_prefix="mcpg_test",
                scopes=frozenset({"notes:read", "notes:write", "agent:run"}),
            )
        return None


class MemoryAuditSink:
    """Test sink. Stores records in memory and never touches the database."""

    def __init__(self) -> None:
        self.records: list[AuditRecord] = []

    async def write(self, record: AuditRecord) -> AuditEventOut:
        self.records.append(record)
        return AuditEventOut(
            id=str(uuid.uuid4()),
            created_at=datetime.now(UTC),
            action=record.action,
            decision=record.decision,
            status=record.status,
            status_code=record.status_code,
            error_code=record.error_code,
            reason=record.reason,
            tool_name=record.tool_name,
            args_hash=record.args_hash,
            duration_ms=record.duration_ms,
            request_id=record.request_id,
            client_id=record.client_id,
            api_key_id=record.api_key_id,
            key_prefix=record.key_prefix,
        )


@pytest.fixture(autouse=True)
def setup_dummy_verifier():
    set_api_key_verifier(DummyVerifier())


@pytest.fixture(autouse=True)
def memory_audit_sink():
    previous = get_audit_sink()
    sink = MemoryAuditSink()
    set_audit_sink(sink)
    yield sink
    set_audit_sink(previous)


@pytest.fixture(autouse=True)
def reset_auth_throttle():
    auth_failure_throttle.reset()


@pytest.fixture(autouse=True)
def sandbox_inprocess(monkeypatch):
    """Tests stay in-process. The executor cache is cleared with the mode."""

    from app.config import settings
    from app.sandbox.executor import clear_executor_cache

    monkeypatch.setattr(settings, "sandbox_mode", "inprocess")
    clear_executor_cache()
    yield
    clear_executor_cache()


@pytest.fixture
def anyio_backend():
    return "asyncio"
