"""Gateway error-handling tests — Phase 2.

Covers all six required error cases through the REST layer using fake MCP
sessions.  No live MCP server, real Docker, or external network is required.

The tests use FastAPI's ``TestClient`` so the full middleware stack (security
headers, request IDs, error envelope) is exercised alongside the gateway.
``_dispatch`` is monkey-patched to simulate MCP outcomes without a real
MCP session.

Error envelope shape expected from ``app.errors``:
    {
        "error": {
            "code": <str>,
            "message": <str>,
            "request_id": <str | None>,
        }
    }
"""

from __future__ import annotations

import asyncio
import logging

import pytest
from fastapi.testclient import TestClient

import app.gateway as gateway_module
from app.config import settings
from app.main import app

try:
    from mcp.server.fastmcp.exceptions import ToolError
except ImportError:  # SDK layout guard
    ToolError = Exception  # type: ignore[assignment,misc]

pytestmark = pytest.mark.anyio

client = TestClient(app, headers={"Authorization": "Bearer mcpg_test"})

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

SENSITIVE_PATTERNS = [
    "Traceback",
    'File "',
    "line ",
    '.py"',
    "SELECT",
    "password",
    "secret",
    "token",
    "localhost:",
    "/Users/",
    "/home/",
    "/var/",
    "Exception:",
    "Error:",
]


def _assert_no_sensitive_data(text: str) -> None:
    """Assert no stack traces, file paths, or credentials appear in the response."""
    for pattern in SENSITIVE_PATTERNS:
        assert pattern not in text, (
            f"Sensitive pattern {pattern!r} found in response: {text[:200]}"
        )


def _error_envelope(response) -> dict:
    """Parse and validate the standard error envelope."""
    body = response.json()
    assert "error" in body, f"No 'error' key in response: {body}"
    error = body["error"]
    assert "code" in error, f"No 'error.code' in: {error}"
    assert "message" in error, f"No 'error.message' in: {error}"
    return error


# ---------------------------------------------------------------------------
# Case 1: HTTP 404 — unknown / unregistered tool
# ---------------------------------------------------------------------------


def test_gateway_404_unknown_tool(monkeypatch) -> None:
    """Requesting a tool not in ALLOWED_TOOLS returns HTTP 404.

    The gateway allowlist is the first check; _dispatch is never reached.
    """
    # Call a tool name that is NOT in ALLOWED_TOOLS.
    # We use the /api/notes endpoint but patch the tool name check by hitting
    # a non-existent endpoint; instead, call call_tool directly via a route
    # that the hardening test exercises as well.
    # Simplest approach: monkeypatch ALLOWED_TOOLS so "list_notes" is absent.
    monkeypatch.setattr(gateway_module, "ALLOWED_TOOLS", frozenset())

    response = client.get("/api/notes")
    assert response.status_code == 404
    error = _error_envelope(response)
    assert error["code"] == "NOT_FOUND"
    assert "request_id" in error
    _assert_no_sensitive_data(response.text)


# ---------------------------------------------------------------------------
# Case 2: HTTP 400 — malformed / un-serialisable arguments
# ---------------------------------------------------------------------------


async def test_gateway_400_unserializable_args() -> None:
    """Arguments that cannot be JSON-serialised raise HTTP 400.

    We invoke ``call_tool`` directly because the REST layer always constructs
    valid dicts; this tests the gateway's own serialisation guard.
    """
    from fastapi import HTTPException

    # A set is not JSON-serialisable.
    with pytest.raises(HTTPException) as exc_info:
        await gateway_module.call_tool("read_note", {"name": {1, 2, 3}})  # type: ignore[arg-type]

    assert exc_info.value.status_code == 400
    detail = exc_info.value.detail
    # Must not leak the full Python repr of the object.
    assert "SELECT" not in detail
    assert "Traceback" not in detail


# ---------------------------------------------------------------------------
# Case 3: HTTP 413 — oversized arguments
# ---------------------------------------------------------------------------


async def test_gateway_413_oversized_args() -> None:
    """Arguments exceeding MAX_ARG_BYTES raise HTTP 413."""
    from fastapi import HTTPException

    big_content = "x" * (gateway_module.MAX_ARG_BYTES + 1)
    with pytest.raises(HTTPException) as exc_info:
        await gateway_module.call_tool(
            "write_note", {"name": "a", "content": big_content}
        )

    assert exc_info.value.status_code == 413
    detail = exc_info.value.detail
    assert "KiB" in detail or "gateway limit" in detail
    assert "Traceback" not in detail


def test_gateway_413_oversized_via_rest(monkeypatch) -> None:
    """Oversized note content sent through the REST layer returns HTTP 413."""
    # The REST layer has a 100 KiB per-note limit; the gateway has 128 KiB.
    # Exceed the route-level limit to get the route's 413.
    from app.routes.notes import MAX_CONTENT_BYTES

    big = "y" * (MAX_CONTENT_BYTES + 1)
    response = client.put("/api/notes/big", json={"content": big})
    assert response.status_code == 413
    error = _error_envelope(response)
    assert error["code"] == "PAYLOAD_TOO_LARGE"
    _assert_no_sensitive_data(response.text)


# ---------------------------------------------------------------------------
# Case 4: HTTP 504 — MCP / gateway timeout
# ---------------------------------------------------------------------------


async def test_gateway_504_timeout(monkeypatch) -> None:
    """A slow dispatch that exceeds tool_timeout_s raises HTTP 504."""
    from fastapi import HTTPException

    async def _slow(name: str, args: dict) -> None:
        await asyncio.sleep(10)

    monkeypatch.setattr(settings, "tool_timeout_s", 0.05)
    monkeypatch.setattr(gateway_module, "_dispatch", _slow)

    with pytest.raises(HTTPException) as exc_info:
        await gateway_module.call_tool("list_notes", {})

    assert exc_info.value.status_code == 504
    assert "did not complete within" in exc_info.value.detail
    assert "Traceback" not in exc_info.value.detail


def test_gateway_504_via_rest(monkeypatch) -> None:
    """Gateway timeout surfaced through the REST layer has the correct envelope."""

    async def _slow(name: str, args: dict) -> None:
        await asyncio.sleep(10)

    monkeypatch.setattr(settings, "tool_timeout_s", 0.05)
    monkeypatch.setattr(gateway_module, "_dispatch", _slow)

    response = client.get("/api/notes")
    assert response.status_code == 504
    error = _error_envelope(response)
    assert error["code"] == "GATEWAY_TIMEOUT"
    assert "request_id" in error
    _assert_no_sensitive_data(response.text)


# ---------------------------------------------------------------------------
# Case 5: HTTP 500 — unexpected internal exception
# ---------------------------------------------------------------------------


async def test_gateway_500_unexpected_exception(monkeypatch) -> None:
    """An unexpected exception inside dispatch raises HTTP 500.

    The original exception message must not appear in the response detail.
    """
    from fastapi import HTTPException

    secret_message = "SECRET_DB_PASSWORD_VISIBLE_IN_STACK"

    async def _boom(name: str, args: dict) -> None:
        raise RuntimeError(secret_message)

    monkeypatch.setattr(gateway_module, "_dispatch", _boom)

    with pytest.raises(HTTPException) as exc_info:
        await gateway_module.call_tool("list_notes", {})

    assert exc_info.value.status_code == 500
    assert secret_message not in exc_info.value.detail
    assert exc_info.value.detail in (
        "An internal error occurred.",
        "Internal tool error.",
    ), f"Unexpected detail: {exc_info.value.detail!r}"


def test_gateway_500_via_rest_hides_exception_detail(monkeypatch, caplog) -> None:
    """HTTP 500 from gateway never leaks the internal error through the REST layer."""
    secret = "SELECT_username_FROM_users_WHERE_id=1"

    async def _boom(name: str, args: dict) -> None:
        raise RuntimeError(secret)

    monkeypatch.setattr(gateway_module, "_dispatch", _boom)

    with caplog.at_level(logging.ERROR, logger="app.gateway"):
        response = client.get("/api/notes")

    assert response.status_code == 500
    error = _error_envelope(response)
    assert error["code"] == "INTERNAL_SERVER_ERROR"
    # Secret must NOT appear in the client response.
    assert secret not in response.text
    assert "Traceback" not in response.text
    assert "request_id" in error


# ---------------------------------------------------------------------------
# Case 6: MCP ToolError — safe response mapping
# ---------------------------------------------------------------------------


async def test_gateway_tool_error_file_not_found(monkeypatch) -> None:
    """ToolError wrapping FileNotFoundError maps to HTTP 404 without leaking paths."""
    from fastapi import HTTPException

    async def _dispatch_fnf(name: str, args: dict) -> None:
        cause = FileNotFoundError("/home/user/secrets/note.md")
        raise ToolError("No such file") from cause

    monkeypatch.setattr(gateway_module, "_dispatch", _dispatch_fnf)

    with pytest.raises(HTTPException) as exc_info:
        await gateway_module.call_tool("read_note", {"name": "missing"})

    assert exc_info.value.status_code == 404
    # Filesystem paths must not leak.
    assert "/home/user/secrets" not in exc_info.value.detail
    assert "Note not found" in exc_info.value.detail


async def test_gateway_tool_error_os_error_hides_path(monkeypatch, caplog) -> None:
    """ToolError wrapping OSError returns HTTP 500 with a generic message."""
    from fastapi import HTTPException

    secret_path = "/etc/sensitive/config"

    async def _dispatch_os_err(name: str, args: dict) -> None:
        cause = PermissionError(f"Permission denied: {secret_path}")
        raise ToolError(f"Errno 13 Permission denied {secret_path}") from cause

    monkeypatch.setattr(gateway_module, "_dispatch", _dispatch_os_err)

    with (
        caplog.at_level(logging.ERROR, logger="app.gateway"),
        pytest.raises(HTTPException) as exc_info,
    ):
        await gateway_module.call_tool("read_note", {"name": "secret"})

    assert exc_info.value.status_code == 500
    assert secret_path not in exc_info.value.detail
    assert exc_info.value.detail == "Internal tool error."


async def test_gateway_tool_error_value_error_maps_to_400(monkeypatch) -> None:
    """ToolError wrapping ValueError maps to HTTP 400."""
    from fastapi import HTTPException

    async def _dispatch_val(name: str, args: dict) -> None:
        cause = ValueError("note name must be alphanumeric")
        raise ToolError("invalid note name: 'bad name!'") from cause

    monkeypatch.setattr(gateway_module, "_dispatch", _dispatch_val)

    with pytest.raises(HTTPException) as exc_info:
        await gateway_module.call_tool("read_note", {"name": "bad name!"})

    assert exc_info.value.status_code == 400


async def test_gateway_tool_error_unknown_maps_to_500(monkeypatch) -> None:
    """An unclassified ToolError maps to HTTP 500 with a generic detail."""
    from fastapi import HTTPException

    secret = "internal_db_schema_leaked"

    async def _dispatch_unknown(name: str, args: dict) -> None:
        raise ToolError(f"something went wrong: {secret}")

    monkeypatch.setattr(gateway_module, "_dispatch", _dispatch_unknown)

    with pytest.raises(HTTPException) as exc_info:
        await gateway_module.call_tool("list_notes", {})

    assert exc_info.value.status_code == 500
    assert secret not in exc_info.value.detail
    assert exc_info.value.detail == "Internal tool error."


# ---------------------------------------------------------------------------
# Status endpoint error disclosure tests (Phase 1A)
# ---------------------------------------------------------------------------


def test_status_offline_returns_stable_error_code(monkeypatch) -> None:
    """When MCP is unreachable, /api/status returns error='mcp_unavailable'.

    The raw exception message must never appear in the response body.
    """
    from contextlib import asynccontextmanager

    import app.routes.status as status_module

    secret_msg = "Connection refused 127.0.0.1:9999 sqlalchemy"

    @asynccontextmanager
    async def _failing_connect(*args, **kwargs):
        raise ConnectionRefusedError(secret_msg)
        yield  # pragma: no cover

    monkeypatch.setattr(status_module, "connect", _failing_connect)

    response = client.get("/api/status")
    assert response.status_code == 200
    body = response.json()
    assert body["mcp"] == "offline"
    assert body["error"] == "mcp_unavailable"
    # Secret exception message must NOT be in the response.
    assert secret_msg not in response.text
    assert "Connection refused" not in response.text


def test_status_offline_error_code_is_stable_string(monkeypatch) -> None:
    """The error code for MCP failures is the literal string 'mcp_unavailable'."""
    from contextlib import asynccontextmanager

    import app.routes.status as status_module

    @asynccontextmanager
    async def _timeout_connect(*args, **kwargs):
        raise TimeoutError("timed out after 3s connecting to mcp://internal")
        yield  # pragma: no cover

    monkeypatch.setattr(status_module, "connect", _timeout_connect)

    response = client.get("/api/status")
    assert response.status_code == 200
    body = response.json()
    assert body["mcp"] == "offline"
    # Error field must be the stable code, not the exception text.
    assert body["error"] == "mcp_unavailable"
    assert "timed out" not in response.text


# ---------------------------------------------------------------------------
# _normalise unit tests — coverage for all fallback paths
# ---------------------------------------------------------------------------


def test_normalise_tuple_with_structured_result() -> None:
    """Primary path: (content_list, {result: value}) returns the value."""
    from app.gateway import _normalise

    result = _normalise(([], {"result": "hello"}))
    assert result == "hello"


def test_normalise_plain_dict_with_result_key() -> None:
    """Fallback: plain dict with 'result' key returns the value."""
    from app.gateway import _normalise

    result = _normalise({"result": [1, 2, 3]})
    assert result == [1, 2, 3]


def test_normalise_plain_dict_without_result_key() -> None:
    """Fallback: plain dict without 'result' key returns the whole dict."""
    from app.gateway import _normalise

    raw = {"data": "value"}
    result = _normalise(raw)
    assert result == raw


def test_normalise_plain_string() -> None:
    """Plain string passthrough."""
    from app.gateway import _normalise

    assert _normalise("just a string") == "just a string"


def test_normalise_list_of_text_blocks() -> None:
    """ContentBlock list is joined into a newline-separated string."""
    from app.gateway import _normalise

    class FakeBlock:
        def __init__(self, text: str) -> None:
            self.text = text

    result = _normalise([FakeBlock("line1"), FakeBlock("line2")])
    assert result == "line1\nline2"


def test_normalise_single_text_block() -> None:
    """Single ContentBlock returns just the text (no newline)."""
    from app.gateway import _normalise

    class FakeBlock:
        def __init__(self, text: str) -> None:
            self.text = text

    result = _normalise([FakeBlock("only")])
    assert result == "only"


def test_normalise_list_of_strings() -> None:
    """List of plain strings is joined."""
    from app.gateway import _normalise

    result = _normalise(["a", "b"])
    assert result == "a\nb"


def test_normalise_list_of_dicts_with_text() -> None:
    """List of dicts with 'text' key are joined."""
    from app.gateway import _normalise

    result = _normalise([{"text": "foo"}, {"text": "bar"}])
    assert result == "foo\nbar"


def test_normalise_unknown_type_passthrough() -> None:
    """Unknown types pass through unchanged."""
    from app.gateway import _normalise

    obj = object()
    assert _normalise(obj) is obj


def test_normalise_empty_list_passthrough() -> None:
    """Empty list falls through to the final return."""
    from app.gateway import _normalise

    result = _normalise([])
    assert result == []


# ---------------------------------------------------------------------------
# Bare exception paths (outside ToolError) — lines 210-218
# ---------------------------------------------------------------------------


async def test_gateway_bare_value_error_maps_to_400(monkeypatch) -> None:
    """Bare ValueError from dispatch (not wrapped in ToolError) → HTTP 400."""
    from fastapi import HTTPException

    async def _raise_value_error(name: str, args: dict) -> None:
        raise ValueError("invalid argument value")

    monkeypatch.setattr(gateway_module, "_dispatch", _raise_value_error)

    with pytest.raises(HTTPException) as exc_info:
        await gateway_module.call_tool("list_notes", {})

    assert exc_info.value.status_code == 400


async def test_gateway_bare_file_not_found_maps_to_404(monkeypatch) -> None:
    """Bare FileNotFoundError from dispatch → HTTP 404."""
    from fastapi import HTTPException

    async def _raise_fnf(name: str, args: dict) -> None:
        raise FileNotFoundError("no such note")

    monkeypatch.setattr(gateway_module, "_dispatch", _raise_fnf)

    with pytest.raises(HTTPException) as exc_info:
        await gateway_module.call_tool("list_notes", {})

    assert exc_info.value.status_code == 404
    assert "Note not found" in exc_info.value.detail


async def test_gateway_bare_os_error_maps_to_500(monkeypatch) -> None:
    """Bare OSError from dispatch → HTTP 500 with generic message."""
    from fastapi import HTTPException

    secret_path = "/etc/shadow"

    async def _raise_os_err(name: str, args: dict) -> None:
        raise PermissionError(f"Permission denied: {secret_path}")

    monkeypatch.setattr(gateway_module, "_dispatch", _raise_os_err)

    with pytest.raises(HTTPException) as exc_info:
        await gateway_module.call_tool("list_notes", {})

    assert exc_info.value.status_code == 500
    assert secret_path not in exc_info.value.detail
    assert exc_info.value.detail == "Internal tool error."


async def test_gateway_tool_error_invalid_note_name_maps_to_400(monkeypatch) -> None:
    """ToolError with 'invalid note name' text → HTTP 400 with safe detail."""
    from fastapi import HTTPException

    async def _dispatch_invalid_name(name: str, args: dict) -> None:
        raise ToolError("invalid note name: 'bad/name'")

    monkeypatch.setattr(gateway_module, "_dispatch", _dispatch_invalid_name)

    with pytest.raises(HTTPException) as exc_info:
        await gateway_module.call_tool("read_note", {"name": "bad/name"})

    assert exc_info.value.status_code == 400
    # Path separators or filesystem fragments must not appear beyond the name itself.
    assert "Traceback" not in exc_info.value.detail


async def test_gateway_successful_dispatch_returns_ok(monkeypatch) -> None:
    """Successful dispatch returns ok=True with result and duration_ms."""

    async def _dispatch_ok(name: str, args: dict) -> tuple:
        return ([], {"result": ["note1", "note2"]})

    monkeypatch.setattr(gateway_module, "_dispatch", _dispatch_ok)

    result = await gateway_module.call_tool("list_notes", {})
    assert result["ok"] is True
    assert result["result"] == ["note1", "note2"]
    assert isinstance(result["duration_ms"], float)
