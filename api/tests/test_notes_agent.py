"""Notes agent graph and the HTTP gateway client."""

from __future__ import annotations

import json

import httpx
import pytest

from app.agents.gateway import GatewayBlockedError, McpGatewaySession
from app.agents.notes_agent import (
    PLAN_PURPOSE,
    SUMMARY_PURPOSE,
    AgentNotConfiguredError,
    run_notes_agent,
)
from app.config import settings
from app.llm.backend import LLMDisabledError, LLMInvocation

pytestmark = pytest.mark.anyio


class ScriptedBackend:
    def __init__(self, replies: list[str]) -> None:
        self._replies = list(replies)
        self.calls: list[str] = []

    async def invoke(self, messages, *, purpose, key_prefix=None, request_id=None):
        del messages, key_prefix, request_id
        self.calls.append(purpose)
        return LLMInvocation(
            text=self._replies.pop(0),
            provider="ollama",
            model="qwen3.5:9b",
            latency_ms=1,
            input_tokens=1,
            output_tokens=1,
            fell_back=False,
        )


class FakeGateway:
    def __init__(self, *, error: Exception | None = None, text: str = "alpha") -> None:
        self.error = error
        self.text = text
        self.calls: list[tuple[str, dict]] = []

    async def call_tool(self, name, arguments):
        from app.agents.gateway import GatewayToolResult

        self.calls.append((name, arguments))
        if self.error is not None:
            raise self.error
        return GatewayToolResult(ok=True, text=self.text)


async def _no_direct_tools(*args, **kwargs):
    del args, kwargs
    raise AssertionError("bypassed the gateway")


@pytest.fixture
def forbid_direct_tools(monkeypatch):
    monkeypatch.setattr("app.gateway.call_tool", _no_direct_tools)
    monkeypatch.setattr("app.mcp_server.mcp.call_tool", _no_direct_tools)
    monkeypatch.setattr(settings, "llm_enabled", True)


def _tool(name: str, arguments: dict) -> str:
    return json.dumps({"action": "tool", "name": name, "arguments": arguments})


async def test_gateway_block_stops_without_retry(forbid_direct_tools):
    del forbid_direct_tools
    backend = ScriptedBackend([_tool("list_notes", {})])
    gateway = FakeGateway(
        error=GatewayBlockedError(403, "Missing required scope: agent:run.")
    )
    outcome = await run_notes_agent(
        "list the notes",
        request_id="rid-1",
        backend=backend,
        gateway=gateway,
    )
    assert gateway.calls == [("list_notes", {})]
    assert backend.calls == [PLAN_PURPOSE]
    assert "403" in outcome.result
    assert "did not retry" in outcome.result
    assert outcome.tool_calls[0]["status"] == "403"
    assert outcome.request_id == "rid-1"


async def test_tool_cap(forbid_direct_tools):
    del forbid_direct_tools
    replies = [_tool("read_note", {"name": f"n{index}"}) for index in range(1, 6)]
    replies.append("Read five notes.")
    backend = ScriptedBackend(replies)
    gateway = FakeGateway(text="body")
    outcome = await run_notes_agent("read five notes", backend=backend, gateway=gateway)
    assert [name for name, _ in gateway.calls] == ["read_note"] * 5
    assert [args["name"] for _, args in gateway.calls] == [
        "n1",
        "n2",
        "n3",
        "n4",
        "n5",
    ]
    assert backend.calls == [PLAN_PURPOSE] * 5 + [SUMMARY_PURPOSE]
    assert outcome.result == "Read five notes."
    assert outcome.provider == "ollama"
    assert len(outcome.tool_calls) == 5


async def test_duplicate_tool_is_not_called_again(forbid_direct_tools):
    del forbid_direct_tools
    backend = ScriptedBackend(
        [
            _tool("list_notes", {}),
            _tool("list_notes", {}),
            "Only listed once.",
        ]
    )
    gateway = FakeGateway(text="alpha")
    outcome = await run_notes_agent("list the notes", backend=backend, gateway=gateway)
    assert gateway.calls == [("list_notes", {})]
    assert outcome.result == "Only listed once."


async def test_disallowed_tool_does_not_call_the_gateway(forbid_direct_tools):
    del forbid_direct_tools
    backend = ScriptedBackend(
        [
            _tool("delete_everything", {}),
            '{"action":"finish"}',
            "No notes were changed.",
        ]
    )
    gateway = FakeGateway()
    outcome = await run_notes_agent("delete notes", backend=backend, gateway=gateway)
    assert gateway.calls == []
    assert outcome.tool_calls[0]["status"] == "rejected"
    assert outcome.result == "No notes were changed."


async def test_unparsed_plan_does_not_call_a_tool(forbid_direct_tools):
    del forbid_direct_tools
    backend = ScriptedBackend(["hello there", "No tool was selected."])
    gateway = FakeGateway()
    outcome = await run_notes_agent("list the notes", backend=backend, gateway=gateway)
    assert gateway.calls == []
    assert outcome.result == "No tool was selected."
    assert backend.calls == [PLAN_PURPOSE, SUMMARY_PURPOSE]


async def test_disabled_agent_does_not_open_the_gateway(monkeypatch):
    monkeypatch.setattr(settings, "llm_enabled", False)
    backend = ScriptedBackend(["{}"])
    gateway = FakeGateway()
    with pytest.raises(LLMDisabledError):
        await run_notes_agent("list the notes", backend=backend, gateway=gateway)
    assert gateway.calls == []
    assert backend.calls == []


async def test_missing_agent_key(monkeypatch):
    monkeypatch.setattr(settings, "llm_enabled", True)
    monkeypatch.setattr(settings, "notes_agent_api_key", None)
    with pytest.raises(AgentNotConfiguredError):
        await run_notes_agent("list the notes")


def _handler(calls: list[str]):
    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        method = body.get("method", "")
        calls.append(method)
        assert request.headers["authorization"] == "Bearer mcpg_test"
        if method == "initialize":
            return httpx.Response(
                200,
                headers={
                    "mcp-session-id": "sess-1",
                    "content-type": "application/json",
                },
                json={"jsonrpc": "2.0", "id": 1, "result": {}},
            )
        if method == "notifications/initialized":
            assert request.headers["mcp-session-id"] == "sess-1"
            return httpx.Response(202)
        if method == "tools/call":
            payload = {
                "jsonrpc": "2.0",
                "id": body["id"],
                "result": {
                    "content": [{"type": "text", "text": "alpha"}],
                    "isError": False,
                },
            }
            raw = "event: message\ndata: " + json.dumps(payload) + "\n\n"
            return httpx.Response(
                200,
                headers={"content-type": "text/event-stream"},
                text=raw,
            )
        raise AssertionError(method)

    return handler


async def test_gateway_session_parses_sse_tool_result():
    calls: list[str] = []
    async with McpGatewaySession(
        "http://127.0.0.1:8000/mcp",
        "mcpg_test",
        transport=httpx.MockTransport(_handler(calls)),
    ) as session:
        result = await session.call_tool("list_notes", {})
    assert result.ok is True
    assert result.text == "alpha"
    assert calls == ["initialize", "notifications/initialized", "tools/call"]


async def test_gateway_403_on_initialize_is_not_retried():
    calls: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        calls.append(body["method"])
        return httpx.Response(
            403,
            json={
                "error": {
                    "code": "FORBIDDEN",
                    "message": "Missing required scope: agent:run.",
                }
            },
        )

    with pytest.raises(GatewayBlockedError) as caught:
        async with McpGatewaySession(
            "http://127.0.0.1:8000/mcp/",
            "mcpg_secret_value",
            transport=httpx.MockTransport(handler),
        ) as session:
            await session.call_tool("list_notes", {})
    assert caught.value.status_code == 403
    assert calls == ["initialize"]
    assert "mcpg_secret_value" not in str(caught.value)


async def test_gateway_429_on_tool_call_is_not_retried():
    calls: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        method = body.get("method", "")
        calls.append(method)
        if method == "tools/call":
            return httpx.Response(
                429,
                json={"error": {"message": "Too Many Requests"}},
            )
        if method == "initialize":
            return httpx.Response(
                200,
                headers={"mcp-session-id": "sess-1"},
                json={"jsonrpc": "2.0", "id": 1, "result": {}},
            )
        return httpx.Response(202)

    async with McpGatewaySession(
        "http://127.0.0.1:8000/mcp/",
        "mcpg_test",
        transport=httpx.MockTransport(handler),
    ) as session:
        with pytest.raises(GatewayBlockedError) as caught:
            await session.call_tool("write_note", {"name": "a", "content": "b"})
            await session.call_tool("write_note", {"name": "a", "content": "b"})
    assert caught.value.status_code == 429
    assert calls.count("tools/call") == 1
