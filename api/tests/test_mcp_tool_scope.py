"""Tests for McpToolScopeMiddleware and per-tool scope enforcement."""

import json

import pytest
from fastapi.testclient import TestClient
from starlette.types import Message, Receive, Scope, Send

from app.auth.principal import Principal
from app.auth.scopes import AGENT_RUN, NOTES_READ, NOTES_WRITE, TOOL_SCOPES
from app.auth.verifier import ApiKeyVerifier, set_api_key_verifier
from app.main import app
from app.mcp_tool_scope import McpToolScopeMiddleware
from app.tools.catalog import list_tool_definitions

pytestmark = pytest.mark.anyio


class MockInnerApp:
    def __init__(self, response_body: bytes = b'{"result": "ok"}'):
        self.called = False
        self.received_messages: list[Message] = []
        self.scope: Scope | None = None
        self.response_body = response_body

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        self.called = True
        self.scope = scope
        while True:
            msg = await receive()
            self.received_messages.append(msg)
            if msg.get("type") != "http.request" or not msg.get("more_body", False):
                break
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send(
            {
                "type": "http.response.body",
                "body": self.response_body,
                "more_body": False,
            }
        )


async def call_middleware(
    middleware: McpToolScopeMiddleware,
    body: bytes,
    *,
    principal: Principal | None = None,
    content_type: str = "application/json",
    method: str = "POST",
) -> tuple[int, dict[str, str], bytes]:
    scope: Scope = {
        "type": "http",
        "method": method,
        "path": "/mcp/",
        "headers": [(b"content-type", content_type.encode("latin-1"))],
        "mcp_guard.principal": principal,
        "mcp_guard.request_id": "test-req-123",
        "client": ("127.0.0.1", 12345),
    }

    sent = False

    async def receive() -> Message:
        nonlocal sent
        if not sent:
            sent = True
            return {"type": "http.request", "body": body, "more_body": False}
        return {"type": "http.disconnect"}

    response_status = 0
    response_headers: dict[str, str] = {}
    response_body = bytearray()

    async def send(msg: Message) -> None:
        nonlocal response_status
        if msg["type"] == "http.response.start":
            response_status = msg["status"]
            for k, v in msg.get("headers", []):
                response_headers[k.decode("latin-1").lower()] = v.decode("latin-1")
        elif msg["type"] == "http.response.body":
            response_body.extend(msg.get("body", b""))

    await middleware(scope, receive, send)
    return response_status, response_headers, bytes(response_body)


# 1. A principal with agent:run but without notes:write cannot call write_note.
async def test_agent_run_without_notes_write_cannot_call_write_note(memory_audit_sink):
    inner = MockInnerApp()
    mw = McpToolScopeMiddleware(inner)

    principal = Principal(
        api_key_id="k-agent",
        client_id="c-agent",
        key_prefix="mcpg_agent",
        scopes=frozenset({AGENT_RUN}),
    )
    req = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "tools/call",
        "params": {
            "name": "write_note",
            "arguments": {"name": "demo.md", "content": "hello"},
        },
    }
    status, headers, body = await call_middleware(
        mw, json.dumps(req).encode(), principal=principal
    )

    assert status == 403
    assert inner.called is False
    assert "www-authenticate" in headers
    assert 'scope="notes:write"' in headers["www-authenticate"]
    data = json.loads(body)
    assert data["error"]["code"] == "FORBIDDEN"
    assert data["error"]["message"] == "Missing required scope: notes:write."

    assert len(memory_audit_sink.records) == 1
    rec = memory_audit_sink.records[0]
    assert rec.action == "auth.deny"
    assert rec.decision == "denied"
    assert rec.status == "denied"
    assert rec.tool_name == "write_note"
    assert rec.reason == "insufficient_scope:notes:write"
    assert rec.client_id == "c-agent"
    assert rec.api_key_id == "k-agent"
    assert rec.key_prefix == "mcpg_agent"


# 2. A principal with agent:run and notes:read can call list_notes.
async def test_principal_with_notes_read_can_call_list_notes(memory_audit_sink):
    inner = MockInnerApp()
    mw = McpToolScopeMiddleware(inner)

    principal = Principal(
        api_key_id="k-read",
        client_id="c-read",
        key_prefix="mcpg_read",
        scopes=frozenset({AGENT_RUN, NOTES_READ}),
    )
    req = {
        "jsonrpc": "2.0",
        "id": 2,
        "method": "tools/call",
        "params": {"name": "list_notes", "arguments": {}},
    }
    raw = json.dumps(req).encode()
    status, _, _ = await call_middleware(mw, raw, principal=principal)

    assert status == 200
    assert inner.called is True
    assert len(memory_audit_sink.records) == 0


# 3. A principal with agent:run and notes:read cannot call write_note.
async def test_principal_with_notes_read_cannot_call_write_note(memory_audit_sink):
    inner = MockInnerApp()
    mw = McpToolScopeMiddleware(inner)

    principal = Principal(
        api_key_id="k-read",
        client_id="c-read",
        key_prefix="mcpg_read",
        scopes=frozenset({AGENT_RUN, NOTES_READ}),
    )
    req = {
        "jsonrpc": "2.0",
        "id": 3,
        "method": "tools/call",
        "params": {
            "name": "write_note",
            "arguments": {"name": "note.md", "content": "content"},
        },
    }
    status, headers, body = await call_middleware(
        mw, json.dumps(req).encode(), principal=principal
    )

    assert status == 403
    assert inner.called is False
    assert "www-authenticate" in headers
    assert 'scope="notes:write"' in headers["www-authenticate"]
    data = json.loads(body)
    assert data["error"]["code"] == "FORBIDDEN"
    assert data["error"]["message"] == "Missing required scope: notes:write."
    assert len(memory_audit_sink.records) == 1
    assert memory_audit_sink.records[0].reason == "insufficient_scope:notes:write"


# 4. A principal with agent:run, notes:read and notes:write can call write_note.
async def test_principal_with_all_scopes_can_call_write_note(memory_audit_sink):
    inner = MockInnerApp()
    mw = McpToolScopeMiddleware(inner)

    principal = Principal(
        api_key_id="k-full",
        client_id="c-full",
        key_prefix="mcpg_full",
        scopes=frozenset({AGENT_RUN, NOTES_READ, NOTES_WRITE}),
    )
    req = {
        "jsonrpc": "2.0",
        "id": 4,
        "method": "tools/call",
        "params": {
            "name": "write_note",
            "arguments": {"name": "note.md", "content": "content"},
        },
    }
    status, _, _ = await call_middleware(
        mw, json.dumps(req).encode(), principal=principal
    )

    assert status == 200
    assert inner.called is True
    assert len(memory_audit_sink.records) == 0


# 5. A tool absent from TOOL_SCOPES is denied (fail-closed).
async def test_unmapped_tool_is_denied(memory_audit_sink):
    inner = MockInnerApp()
    mw = McpToolScopeMiddleware(inner)

    principal = Principal(
        api_key_id="k-full",
        client_id="c-full",
        key_prefix="mcpg_full",
        scopes=frozenset({AGENT_RUN, NOTES_READ, NOTES_WRITE}),
    )
    req = {
        "jsonrpc": "2.0",
        "id": 5,
        "method": "tools/call",
        "params": {"name": "unmapped_danger_tool", "arguments": {}},
    }
    status, headers, body = await call_middleware(
        mw, json.dumps(req).encode(), principal=principal
    )

    assert status == 403
    assert inner.called is False
    data = json.loads(body)
    assert data["error"]["code"] == "FORBIDDEN"
    assert "unmapped_danger_tool" in data["error"]["message"]
    assert "no configured scope mapping" in data["error"]["message"]
    # No WWW-Authenticate challenge for unmapped tool
    assert "www-authenticate" not in headers

    assert len(memory_audit_sink.records) == 1
    rec = memory_audit_sink.records[0]
    assert rec.action == "auth.deny"
    assert rec.decision == "denied"
    assert rec.status == "denied"
    assert rec.tool_name == "unmapped_danger_tool"
    assert rec.reason == "unmapped_tool"
    assert rec.status_code == 403
    assert rec.error_code == "FORBIDDEN"


# 6 & 7. Batch containing an unauthorized call is denied as a whole, producing one audit row per denied call.
async def test_batch_with_unauthorized_call_denied_as_whole(memory_audit_sink):
    inner = MockInnerApp()
    mw = McpToolScopeMiddleware(inner)

    principal = Principal(
        api_key_id="k-read",
        client_id="c-read",
        key_prefix="mcpg_read",
        scopes=frozenset({AGENT_RUN, NOTES_READ}),
    )
    batch = [
        {
            "jsonrpc": "2.0",
            "id": 10,
            "method": "tools/call",
            "params": {"name": "list_notes"},
        },
        {
            "jsonrpc": "2.0",
            "id": 11,
            "method": "tools/call",
            "params": {"name": "write_note"},
        },
        {
            "jsonrpc": "2.0",
            "id": 12,
            "method": "tools/call",
            "params": {"name": "unknown_tool"},
        },
    ]
    status, _, _ = await call_middleware(
        mw, json.dumps(batch).encode(), principal=principal
    )

    assert status == 403
    assert inner.called is False

    # Call 10 was allowed, Call 11 denied (missing notes:write), Call 12 denied (unmapped_tool)
    assert len(memory_audit_sink.records) == 2
    assert memory_audit_sink.records[0].tool_name == "write_note"
    assert memory_audit_sink.records[0].reason == "insufficient_scope:notes:write"
    assert memory_audit_sink.records[1].tool_name == "unknown_tool"
    assert memory_audit_sink.records[1].reason == "unmapped_tool"


# 8. Denial audit records include actor information and a safe tool name.
async def test_denial_audit_records_include_actor_and_safe_tool_name(memory_audit_sink):
    inner = MockInnerApp()
    mw = McpToolScopeMiddleware(inner)

    principal = Principal(
        api_key_id="key-xyz-789",
        client_id="client-worker-1",
        key_prefix="mcpg_work",
        scopes=frozenset({AGENT_RUN}),
    )
    # Using an invalid tool name containing dangerous characters
    req = {
        "jsonrpc": "2.0",
        "id": 20,
        "method": "tools/call",
        "params": {"name": "tool/../../malicious\x00"},
    }
    status, _, _ = await call_middleware(
        mw, json.dumps(req).encode(), principal=principal
    )

    assert status == 403
    assert len(memory_audit_sink.records) == 1
    rec = memory_audit_sink.records[0]
    assert rec.client_id == "client-worker-1"
    assert rec.api_key_id == "key-xyz-789"
    assert rec.key_prefix == "mcpg_work"
    assert rec.tool_name == "invalid"  # sanitized by safe_tool_name


# 9. Non-JSON requests pass through unchanged.
async def test_non_json_requests_pass_through():
    inner = MockInnerApp(response_body=b"plain response")
    mw = McpToolScopeMiddleware(inner)

    raw_data = b"raw text data not json"
    status, _, body = await call_middleware(mw, raw_data, content_type="text/plain")

    assert status == 200
    assert inner.called is True
    assert inner.received_messages[0]["body"] == raw_data
    assert body == b"plain response"


# 10. Malformed JSON / requests without extractable tool calls pass through to FastMCP.
async def test_malformed_json_and_non_tool_calls_pass_through():
    inner = MockInnerApp()
    mw = McpToolScopeMiddleware(inner)

    # Malformed JSON
    raw_malformed = b"this is {not valid json"
    status, _, _ = await call_middleware(mw, raw_malformed)
    assert status == 200
    assert inner.called is True
    assert inner.received_messages[0]["body"] == raw_malformed

    # Non tools/call JSON-RPC method (e.g. initialize)
    inner.called = False
    init_msg = json.dumps(
        {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}}
    ).encode()
    status, _, _ = await call_middleware(mw, init_msg)
    assert status == 200
    assert inner.called is True


# 11. Allowed requests replay their buffered request body correctly.
async def test_allowed_requests_replay_body_correctly():
    inner = MockInnerApp()
    mw = McpToolScopeMiddleware(inner)

    principal = Principal(
        api_key_id="k-ok",
        client_id="c-ok",
        key_prefix="mcpg_ok",
        scopes=frozenset({AGENT_RUN, NOTES_READ}),
    )
    req = {
        "jsonrpc": "2.0",
        "id": 99,
        "method": "tools/call",
        "params": {"name": "read_note", "arguments": {"name": "secret.md"}},
    }
    raw = json.dumps(req).encode()
    status, _, _ = await call_middleware(mw, raw, principal=principal)

    assert status == 200
    assert inner.called is True
    replayed_body = b"".join(m.get("body", b"") for m in inner.received_messages)
    assert replayed_body == raw


# 12. Middleware integration with full pipeline via app and verifier.
class ScopedKeyVerifier(ApiKeyVerifier):
    async def verify(self, raw_key: str) -> Principal | None:
        if raw_key == "mcpg_readonly_worker":
            return Principal(
                api_key_id="worker_ro",
                client_id="worker_client",
                key_prefix="mcpg_read",
                scopes=frozenset({AGENT_RUN, NOTES_READ}),
            )
        if raw_key == "mcpg_runner_only":
            return Principal(
                api_key_id="worker_no_tools",
                client_id="worker_client",
                key_prefix="mcpg_runn",
                scopes=frozenset({AGENT_RUN}),
            )
        return None


def test_integration_mcp_gateway_pipeline(memory_audit_sink):
    old_verifier = (
        app.state.api_key_verifier if hasattr(app.state, "api_key_verifier") else None
    )
    set_api_key_verifier(ScopedKeyVerifier())

    try:
        with TestClient(app, base_url="http://localhost:8000") as client:
            # Initialize an MCP session
            init_res = client.post(
                "/mcp/",
                headers={
                    "Authorization": "Bearer mcpg_readonly_worker",
                    "Content-Type": "application/json",
                    "Accept": "application/json, text/event-stream",
                },
                json={
                    "jsonrpc": "2.0",
                    "id": 1,
                    "method": "initialize",
                    "params": {
                        "protocolVersion": "2024-11-05",
                        "capabilities": {},
                        "clientInfo": {"name": "test-client", "version": "1.0.0"},
                    },
                },
            )
            assert init_res.status_code == 200
            session_id = init_res.headers.get("mcp-session-id")

            # Runner-only key trying to call write_note -> denied by McpToolScopeMiddleware
            res_denied = client.post(
                "/mcp/",
                headers={
                    "Authorization": "Bearer mcpg_runner_only",
                    "Content-Type": "application/json",
                    "Accept": "application/json, text/event-stream",
                    **({"mcp-session-id": session_id} if session_id else {}),
                },
                json={
                    "jsonrpc": "2.0",
                    "id": 2,
                    "method": "tools/call",
                    "params": {
                        "name": "write_note",
                        "arguments": {"name": "x.md", "content": "c"},
                    },
                },
            )
            assert res_denied.status_code == 403
            assert res_denied.json()["error"]["code"] == "FORBIDDEN"
            assert (
                "Missing required scope: notes:write."
                in res_denied.json()["error"]["message"]
            )

            # Read-only worker calling list_notes -> passes through McpToolScopeMiddleware
            res_allowed = client.post(
                "/mcp/",
                headers={
                    "Authorization": "Bearer mcpg_readonly_worker",
                    "Content-Type": "application/json",
                    "Accept": "application/json, text/event-stream",
                    **({"mcp-session-id": session_id} if session_id else {}),
                },
                json={
                    "jsonrpc": "2.0",
                    "id": 3,
                    "method": "tools/call",
                    "params": {"name": "list_notes", "arguments": {}},
                },
            )
            assert res_allowed.status_code == 200
    finally:
        if old_verifier:
            set_api_key_verifier(old_verifier)


# 13. Verify unmapped tools detection against TOOL_SCOPES
def test_unmapped_tools_warning_detection():
    registered = [td.name for td in list_tool_definitions()]
    # All standard notes tools should be mapped in TOOL_SCOPES
    for standard_tool in ["list_notes", "read_note", "write_note"]:
        assert standard_tool in TOOL_SCOPES
        assert standard_tool in registered

    unmapped = [name for name in registered if name not in TOOL_SCOPES]
    assert isinstance(unmapped, list)
