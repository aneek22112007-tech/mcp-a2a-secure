"""Tests for the Notes REST API and MCP Guard gateway.

Strategy
--------
All HTTP tests use ``httpx.AsyncClient`` against the real ASGI app, run under
the ``anyio`` pytest plugin (already installed).  The ``@pytest.mark.anyio``
marker drives each async test function.

Gateway unit tests exercise ``app.gateway.call_tool`` directly with the real
MCP server in a temporary notes directory, or with ``unittest.mock.patch``
where external side-effects (timeout, unknown tools) must be simulated.

No ``pytest_asyncio`` import is used — only the ``anyio`` plugin bundled
with the project's existing dependencies.
"""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app

# ---------------------------------------------------------------------------
# anyio backend declaration (required once per test module)
# ---------------------------------------------------------------------------

pytestmark = pytest.mark.anyio


# ---------------------------------------------------------------------------
# Notes-dir isolation (autouse — applied to every test)
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def isolated_notes(tmp_path, monkeypatch):
    """Redirect NOTES_DIR to a fresh temporary directory for every test."""
    import app.mcp_server as mcp_module

    notes_dir = tmp_path / "notes"
    notes_dir.mkdir()
    monkeypatch.setattr(mcp_module, "NOTES_DIR", notes_dir)
    return notes_dir


# ---------------------------------------------------------------------------
# Shared ASGI client fixture
# ---------------------------------------------------------------------------


@pytest.fixture
async def client():
    """Yield a live ASGI test client backed by the FastAPI application."""
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as ac:
        yield ac


# ===========================================================================
# Tests — Notes REST API (HTTP level)
# ===========================================================================


# 1. Empty notes directory → empty list
async def test_list_notes_empty(client: AsyncClient):
    r = await client.get("/api/notes")
    assert r.status_code == 200
    assert r.json() == []


# 2. Write three notes, list returns sorted names
async def test_write_then_list(client: AsyncClient):
    for name, content in [("zebra", "z"), ("apple", "a"), ("mango", "m")]:
        r = await client.put(f"/api/notes/{name}", json={"content": content})
        assert r.status_code == 200
    r = await client.get("/api/notes")
    assert r.status_code == 200
    assert r.json() == ["apple", "mango", "zebra"]


# 3. Write then read — content round-trips exactly
async def test_write_then_read(client: AsyncClient):
    content = "# Hello\nworld"
    r = await client.put("/api/notes/hello", json={"content": content})
    assert r.status_code == 200
    assert r.json()["content"] == content

    r = await client.get("/api/notes/hello")
    assert r.status_code == 200
    data = r.json()
    assert data["name"] == "hello"
    assert data["content"] == content


# 4. Second write overwrites first
async def test_write_overwrite(client: AsyncClient):
    await client.put("/api/notes/draft", json={"content": "v1"})
    await client.put("/api/notes/draft", json={"content": "v2"})
    r = await client.get("/api/notes/draft")
    assert r.status_code == 200
    assert r.json()["content"] == "v2"


# 5. Reading a note that doesn't exist returns exactly 404
async def test_read_missing_returns_404(client: AsyncClient):
    r = await client.get("/api/notes/doesnotexist")
    assert r.status_code == 404


# 6a. Traversal: URL-encoded ../x in write — ASGI normalises path → 404
async def test_traversal_encoded_write(client: AsyncClient):
    r = await client.put("/api/notes/..%2Fx", json={"content": "bad"})
    # ASGI path-normalises ../ before routing, so the router returns 404.
    assert r.status_code == 404


# 6b. Traversal: URL-encoded ../x in read — same ASGI normalisation → 404
async def test_traversal_encoded_read(client: AsyncClient):
    r = await client.get("/api/notes/..%2Fx")
    assert r.status_code == 404


# 7. URL-encoded deep traversal ../../etc/passwd — ASGI normalisation → 404
async def test_traversal_deep_encoded(client: AsyncClient):
    r = await client.get("/api/notes/..%2F..%2Fetc%2Fpasswd")
    assert r.status_code == 404


# 8. Name with space (invalid character) → exactly 400
async def test_invalid_chars_rejected(client: AsyncClient):
    r = await client.put("/api/notes/bad%20name", json={"content": "x"})
    assert r.status_code == 400


# 9. Name longer than 64 characters → exactly 400
async def test_long_name_rejected(client: AsyncClient):
    long_name = "a" * 65
    r = await client.put(f"/api/notes/{long_name}", json={"content": "x"})
    assert r.status_code == 400


# 10. Oversized body (> 100 KiB) → exactly 413 (not 422)
async def test_oversized_body_rejected(client: AsyncClient):
    big_content = "x" * (100 * 1024 + 1)
    r = await client.put("/api/notes/test", json={"content": big_content})
    assert r.status_code == 413


# 10b. 70 KiB note content (between old 64 KB gateway limit and 100 KB route
# limit) — must be accepted (tests the gateway limit raise to 128 KiB).
async def test_seventy_kb_note_accepted(client: AsyncClient):
    content = "x" * (70 * 1024)
    r = await client.put("/api/notes/large", json={"content": content})
    assert r.status_code == 200


# 10c. 100 KiB + 1 byte note content → exactly 413
async def test_hundred_kb_plus_one_rejected(client: AsyncClient):
    content = "x" * (100 * 1024 + 1)
    r = await client.put("/api/notes/toolarge", json={"content": content})
    assert r.status_code == 413


# 11. GET /api/notes/ with trailing slash — the router follows redirect to 200
async def test_list_via_trailing_slash(client: AsyncClient):
    r = await client.get("/api/notes/", follow_redirects=True)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


# 11b. Empty name segment → router never matches the named-note route → 404
async def test_empty_name_segment(client: AsyncClient):
    # /api/notes/ with follow_redirects=False — the router should return 200
    # for /api/notes (list) or 404 for any segment that doesn't match.
    # An empty path-segment after the slash is just the list endpoint again.
    r = await client.get("/api/notes/", follow_redirects=False)
    # The list endpoint handles this — either 200 or a redirect to the list.
    assert r.status_code in (200, 307, 308)


# ===========================================================================
# Tests — Gateway unit tests
# ===========================================================================


# 12. Unknown tool → HTTP 404
async def test_gateway_unknown_tool_rejected():
    from fastapi import HTTPException

    from app.gateway import call_tool

    with pytest.raises(HTTPException) as exc_info:
        await call_tool("delete_everything", {})
    assert exc_info.value.status_code == 404


# 13. Oversized args (> 128 KiB) → HTTP 413
async def test_gateway_oversized_args_rejected():
    from fastapi import HTTPException

    from app.gateway import call_tool

    big = "x" * (128 * 1024 + 1)
    with pytest.raises(HTTPException) as exc_info:
        await call_tool("write_note", {"name": "t", "content": big})
    assert exc_info.value.status_code == 413


# 14. Successful call_tool returns {ok, result, duration_ms}
async def test_gateway_success_shape():
    from app.gateway import call_tool

    result = await call_tool("list_notes", {})
    assert result["ok"] is True
    assert "result" in result
    assert isinstance(result["duration_ms"], float)


# 15. Slow tool → HTTP 504 after TOOL_TIMEOUT_SECONDS.
#     Uses a real async sleep rather than a mock, because the timeout only
#     fires if the awaitable actually suspends (a sync mock returns instantly).
async def test_gateway_timeout(monkeypatch):
    from fastapi import HTTPException

    from app.config import settings
    from app.gateway import call_tool

    monkeypatch.setattr(settings, "tool_timeout_s", 0.05)

    async def _slow(*_a, **_kw):
        await asyncio.sleep(10)

    with (
        patch("app.gateway._dispatch", new=AsyncMock(side_effect=_slow)),
        pytest.raises(HTTPException) as exc_info,
    ):
        await call_tool("list_notes", {})
    assert exc_info.value.status_code == 504


# 16. Notes routes invoke gateway.call_tool, not the filesystem directly
async def test_notes_routes_use_gateway(client: AsyncClient):
    captured: list[tuple[str, dict]] = []

    async def fake_call_tool(name: str, args: dict, **_kw):
        captured.append((name, args))
        if name == "write_note":
            return {"ok": True, "result": f"saved {args['name']}", "duration_ms": 1.0}
        return {"ok": True, "result": [], "duration_ms": 1.0}

    with patch("app.routes.notes.call_tool", new=fake_call_tool):
        r = await client.put("/api/notes/check", json={"content": "hello"})

    assert r.status_code == 200
    assert ("write_note", {"name": "check", "content": "hello"}) in captured


# 16b. GET list route calls gateway.call_tool("list_notes", {})
async def test_list_route_uses_gateway(client: AsyncClient):
    captured: list[tuple[str, dict]] = []

    async def fake_call_tool(name: str, args: dict, **_kw):
        captured.append((name, args))
        return {"ok": True, "result": [], "duration_ms": 1.0}

    with patch("app.routes.notes.call_tool", new=fake_call_tool):
        r = await client.get("/api/notes")

    assert r.status_code == 200
    assert ("list_notes", {}) in captured


# 16c. GET read route calls gateway.call_tool("read_note", {"name": ...})
async def test_read_route_uses_gateway(client: AsyncClient):
    captured: list[tuple[str, dict]] = []

    async def fake_call_tool(name: str, args: dict, **_kw):
        captured.append((name, args))
        return {"ok": True, "result": "hello content", "duration_ms": 1.0}

    with patch("app.routes.notes.call_tool", new=fake_call_tool):
        r = await client.get("/api/notes/myNote")

    assert r.status_code == 200
    assert ("read_note", {"name": "myNote"}) in captured


# 17. MCP Guard server info endpoint — name and tools
async def test_mcp_info_shape(client: AsyncClient):
    r = await client.get("/api/mcp/info")
    assert r.status_code == 200
    data = r.json()
    assert data["server_name"] == "mcp-guard"
    assert data["transport"] == "streamable-http"
    assert data["mcp_endpoint"] == "/mcp/"
    assert set(data["tools"]) == {"list_notes", "read_note", "write_note"}


# 18. OS error in tool -> 500 "Internal tool error." and no file path leaked
async def test_gateway_oserror_sanitised():
    from fastapi import HTTPException
    from mcp.server.fastmcp.exceptions import ToolError

    import app.gateway as gateway_module

    async def _failing_dispatch(name, args):
        raise ToolError(
            "[Errno 21] Is a directory: '/path/to/api/data/notes/dirnote.md'"
        )

    with (
        patch.object(gateway_module, "_dispatch", side_effect=_failing_dispatch),
        pytest.raises(HTTPException) as exc_info,
    ):
        await gateway_module.call_tool("read_note", {"name": "dirnote"})

    assert exc_info.value.status_code == 500
    assert exc_info.value.detail == "Internal tool error."
    assert "dirnote.md" not in exc_info.value.detail
    assert "Errno" not in exc_info.value.detail
