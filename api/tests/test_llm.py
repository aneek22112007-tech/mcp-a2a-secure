"""LLM backend, health, and the agent HTTP routes."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from langchain_core.messages import AIMessage, HumanMessage
from pydantic import SecretStr

from app.auth import Principal, set_api_key_verifier
from app.config import settings
from app.llm.backend import (
    LLMBackend,
    LLMDisabledError,
    LLMUnavailableError,
    _is_connection_or_timeout,
)
from app.llm.health import LLMHealth, check_health
from app.llm.recording import get_recorder, set_recorder
from app.main import app

pytestmark = pytest.mark.anyio


class MemoryRecorder:
    def __init__(self) -> None:
        self.records = []

    async def record(self, rec) -> None:
        self.records.append(rec)


@pytest.fixture
def memory_recorder():
    previous = get_recorder()
    recorder = MemoryRecorder()
    set_recorder(recorder)
    yield recorder
    set_recorder(previous)


class _Down:
    def __init__(self, *args, **kwargs) -> None:
        del args, kwargs

    async def ainvoke(self, messages):
        del messages
        raise ConnectionError("down")


class _Slow:
    def __init__(self, *args, **kwargs) -> None:
        del args, kwargs

    async def ainvoke(self, messages):
        del messages
        raise TimeoutError("slow")


class _BadOutput:
    def __init__(self, *args, **kwargs) -> None:
        del args, kwargs

    async def ainvoke(self, messages):
        del messages
        raise ValueError("bad output")


class _GroqBoom:
    def __init__(self, *args, **kwargs) -> None:
        del args, kwargs
        raise AssertionError("fell back")


class _Up:
    def __init__(self, *args, **kwargs) -> None:
        del args, kwargs

    async def ainvoke(self, messages):
        del messages
        return AIMessage(
            content="from groq",
            usage_metadata={"input_tokens": 2, "output_tokens": 3, "total_tokens": 5},
        )


def test_connection_and_timeout_are_fallback_errors():
    assert _is_connection_or_timeout(ConnectionError("down"))
    assert _is_connection_or_timeout(TimeoutError("slow"))
    assert _is_connection_or_timeout(ConnectionRefusedError("refused"))

    class ReadTimeout(Exception):
        pass

    assert _is_connection_or_timeout(ReadTimeout("timed out"))

    class RequestError(Exception):
        pass

    try:
        raise ConnectionError("down")
    except ConnectionError as exc:
        wrapped = RequestError("wrapped")
        wrapped.__cause__ = exc
    assert _is_connection_or_timeout(wrapped)

    class ResponseError(Exception):
        pass

    assert not _is_connection_or_timeout(ResponseError("model not found"))
    assert not _is_connection_or_timeout(ValueError("bad output"))


async def test_disabled_backend_records_and_raises(monkeypatch, memory_recorder):
    monkeypatch.setattr(settings, "llm_enabled", False)

    def _boom(*args, **kwargs):
        del args, kwargs
        raise AssertionError("model was constructed")

    monkeypatch.setattr("app.llm.backend.ChatOllama", _boom)
    with pytest.raises(LLMDisabledError):
        await LLMBackend().invoke([HumanMessage(content="hi")], purpose="test")
    assert memory_recorder.records[-1].status == "disabled"
    assert memory_recorder.records[-1].error == "LLMDisabledError"


async def test_connection_error_falls_back_to_groq(monkeypatch, memory_recorder):
    monkeypatch.setattr(settings, "llm_enabled", True)
    monkeypatch.setattr(settings, "groq_api_key", SecretStr("gsk-test-secret"))
    monkeypatch.setattr("app.llm.backend.ChatOllama", _Down)
    monkeypatch.setattr("app.llm.backend.ChatGroq", _Up)

    result = await LLMBackend().invoke(
        [HumanMessage(content="hi")],
        purpose="test",
        key_prefix="mcpg_test",
        request_id="rid-1",
    )

    assert result.provider == "groq"
    assert result.model == settings.groq_model
    assert result.text == "from groq"
    assert result.fell_back is True
    assert result.input_tokens == 2
    assert result.output_tokens == 3
    assert [rec.provider for rec in memory_recorder.records] == ["ollama", "groq"]
    assert memory_recorder.records[0].status == "error"
    assert memory_recorder.records[0].fell_back is False
    assert memory_recorder.records[1].status == "ok"
    assert memory_recorder.records[1].fell_back is True
    blob = " ".join(
        str(value)
        for rec in memory_recorder.records
        for value in (
            rec.provider,
            rec.model,
            rec.error,
            rec.purpose,
            rec.key_prefix,
        )
    )
    assert "gsk-test-secret" not in blob


async def test_timeout_falls_back_to_groq(monkeypatch, memory_recorder):
    monkeypatch.setattr(settings, "llm_enabled", True)
    monkeypatch.setattr(settings, "groq_api_key", SecretStr("gsk-test-secret"))
    monkeypatch.setattr("app.llm.backend.ChatOllama", _Slow)
    monkeypatch.setattr("app.llm.backend.ChatGroq", _Up)
    result = await LLMBackend().invoke([HumanMessage(content="hi")], purpose="test")
    assert result.provider == "groq"
    assert result.fell_back is True
    assert memory_recorder.records[0].error == "TimeoutError"


async def test_bad_output_does_not_fall_back(monkeypatch, memory_recorder):
    monkeypatch.setattr(settings, "llm_enabled", True)
    monkeypatch.setattr(settings, "groq_api_key", SecretStr("gsk-test-secret"))
    monkeypatch.setattr("app.llm.backend.ChatOllama", _BadOutput)
    monkeypatch.setattr("app.llm.backend.ChatGroq", _GroqBoom)
    with pytest.raises(LLMUnavailableError):
        await LLMBackend().invoke([HumanMessage(content="hi")], purpose="test")
    assert len(memory_recorder.records) == 1
    assert memory_recorder.records[0].provider == "ollama"
    assert memory_recorder.records[0].status == "error"
    assert memory_recorder.records[0].fell_back is False
    assert memory_recorder.records[0].error == "ValueError"


async def test_unreachable_ollama_without_groq(monkeypatch, memory_recorder):
    monkeypatch.setattr(settings, "llm_enabled", True)
    monkeypatch.setattr(settings, "groq_api_key", None)
    monkeypatch.setattr("app.llm.backend.ChatOllama", _Down)
    with pytest.raises(LLMUnavailableError, match="Groq is not configured"):
        await LLMBackend().invoke([HumanMessage(content="hi")], purpose="test")
    assert len(memory_recorder.records) == 1
    assert memory_recorder.records[0].provider == "ollama"


def test_get_chat_model_is_ollama_when_enabled(monkeypatch):
    monkeypatch.setattr(settings, "llm_enabled", True)
    monkeypatch.setattr(settings, "ollama_model", "qwen3.5:9b")
    model = LLMBackend().get_chat_model()
    assert type(model).__name__ == "ChatOllama"
    assert model.model == "qwen3.5:9b"


def test_get_chat_model_disabled(monkeypatch):
    monkeypatch.setattr(settings, "llm_enabled", False)
    with pytest.raises(LLMDisabledError):
        LLMBackend().get_chat_model()


class _FakeHttp:
    def __init__(self, response=None, error=None) -> None:
        self.response = response
        self.error = error

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False

    async def get(self, url):
        del url
        if self.error is not None:
            raise self.error
        return self.response


class _TagsResponse:
    status_code = 200

    def json(self):
        return {"models": [{"name": "qwen3.5:9b"}]}


async def test_health_reports_ollama_and_hides_groq_key(monkeypatch):
    monkeypatch.setattr(settings, "llm_enabled", True)
    monkeypatch.setattr(settings, "ollama_model", "qwen3.5:9b")
    monkeypatch.setattr(settings, "groq_api_key", SecretStr("gsk-super-secret"))
    monkeypatch.setattr(
        "app.llm.health.httpx.AsyncClient",
        lambda *args, **kwargs: _FakeHttp(_TagsResponse()),
    )
    health = await check_health()
    assert health == LLMHealth(
        enabled=True,
        ollama_reachable=True,
        ollama_model="qwen3.5:9b",
        ollama_model_present=True,
        groq_configured=True,
    )
    assert "gsk-super-secret" not in health.model_dump_json()


async def test_health_when_ollama_is_down(monkeypatch):
    import httpx

    monkeypatch.setattr(settings, "llm_enabled", False)
    monkeypatch.setattr(settings, "groq_api_key", None)
    monkeypatch.setattr(
        "app.llm.health.httpx.AsyncClient",
        lambda *args, **kwargs: _FakeHttp(error=httpx.ConnectError("refused")),
    )
    health = await check_health()
    assert health.ollama_reachable is False
    assert health.ollama_model_present is False
    assert health.groq_configured is False
    assert health.enabled is False


class _NotesOnly:
    async def verify(self, raw_key: str) -> Principal | None:
        if raw_key == "mcpg_notes":
            return Principal(
                api_key_id="notes",
                client_id="notes",
                key_prefix="mcpg_note",
                scopes=frozenset({"notes:read", "notes:write"}),
            )
        return None


class _AdminOnly:
    async def verify(self, raw_key: str) -> Principal | None:
        if raw_key == "mcpg_admin":
            return Principal(
                api_key_id="admin",
                client_id="admin",
                key_prefix="mcpg_admi",
                scopes=frozenset({"admin"}),
            )
        return None


def test_notes_run_forbidden_without_agent_scope(monkeypatch):
    monkeypatch.setattr(settings, "llm_enabled", True)
    set_api_key_verifier(_NotesOnly())
    client = TestClient(app)
    response = client.post(
        "/api/agents/notes/run",
        headers={"Authorization": "Bearer mcpg_notes"},
        json={"task": "list the notes"},
    )
    assert response.status_code == 403
    assert "agent:run" in response.json()["error"]["message"]


def test_notes_run_disabled_returns_503(monkeypatch):
    async def _boom(*args, **kwargs):
        del args, kwargs
        raise AssertionError("agent ran")

    monkeypatch.setattr(settings, "llm_enabled", False)
    monkeypatch.setattr("app.routes.agents.run_notes_agent", _boom)
    client = TestClient(app, headers={"Authorization": "Bearer mcpg_test"})
    response = client.post("/api/agents/notes/run", json={"task": "list the notes"})
    assert response.status_code == 503
    assert response.json()["error"]["message"] == "LLM is disabled."


def test_llm_health_requires_admin(monkeypatch):
    def _boom():
        raise AssertionError("health ran")

    monkeypatch.setattr("app.routes.llm.check_health", _boom)
    client = TestClient(app, headers={"Authorization": "Bearer mcpg_test"})
    response = client.get("/api/llm/health")
    assert response.status_code == 403


def test_llm_health_admin(monkeypatch):
    async def _health():
        return LLMHealth(
            enabled=False,
            ollama_reachable=False,
            ollama_model="qwen3.5:9b",
            ollama_model_present=False,
            groq_configured=False,
        )

    monkeypatch.setattr("app.routes.llm.check_health", _health)
    set_api_key_verifier(_AdminOnly())
    client = TestClient(app, headers={"Authorization": "Bearer mcpg_admin"})
    response = client.get("/api/llm/health")
    assert response.status_code == 200
    body = response.json()
    assert body["enabled"] is False
    assert body["groq_configured"] is False
    assert "api_key" not in body
    assert "secret" not in body


def test_notes_run_returns_agent_outcome(monkeypatch):
    from app.agents.notes_agent import NotesAgentOutcome

    async def _run(task, *, request_id=None, key_prefix=None):
        assert task == "list the notes"
        assert key_prefix == "mcpg_test"
        return NotesAgentOutcome(
            result="There is one note.",
            tool_calls=[
                {
                    "name": "list_notes",
                    "arguments": {},
                    "status": "ok",
                    "output": "alpha",
                    "error": None,
                }
            ],
            provider="ollama",
            model="qwen3.5:9b",
            request_id=request_id,
        )

    monkeypatch.setattr(settings, "llm_enabled", True)
    monkeypatch.setattr("app.routes.agents.run_notes_agent", _run)
    client = TestClient(app, headers={"Authorization": "Bearer mcpg_test"})
    response = client.post("/api/agents/notes/run", json={"task": "list the notes"})
    assert response.status_code == 200
    body = response.json()
    assert body["result"] == "There is one note."
    assert body["provider"] == "ollama"
    assert body["model"] == "qwen3.5:9b"
    assert body["tool_calls"][0]["name"] == "list_notes"
    assert body["request_id"]


def test_notes_run_rejects_an_empty_task():
    client = TestClient(app, headers={"Authorization": "Bearer mcpg_test"})
    response = client.post("/api/agents/notes/run", json={"task": "   "})
    assert response.status_code == 422
