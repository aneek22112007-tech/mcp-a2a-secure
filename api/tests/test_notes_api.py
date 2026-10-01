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


# 5. Reading a note that doesn't exist returns 404
async def test_read_missing_returns_404(client: AsyncClient):
    r = await client.get("/api/notes/doesnotexist")
    assert r.status_code == 404


# 6a. Traversal: URL-encoded ../x in write (rejected at router or handler level)
async def test_traversal_encoded_write(client: AsyncClient):
    r = await client.put("/api/notes/..%2Fx", json={"content": "bad"})
    # The ASGI stack path-normalises ../ so the router returns 404 (no matching route)
    # OR the _safe() guard returns 400. Both reject the traversal attempt safely.
    assert r.status_code in (400, 404)


# 6b. Traversal: URL-encoded ../x in read (rejected at router or handler level)
async def test_traversal_encoded_read(client: AsyncClient):
    r = await client.get("/api/notes/..%2Fx")
    assert r.status_code in (400, 404)


# 7. URL-encoded deep traversal ../../etc/passwd (rejected at router or handler level)
async def test_traversal_deep_encoded(client: AsyncClient):
    r = await client.get("/api/notes/..%2F..%2Fetc%2Fpasswd")
    assert r.status_code in (400, 404)


# 8. Name with space (invalid character)
async def test_invalid_chars_rejected(client: AsyncClient):
    r = await client.put("/api/notes/bad%20name", json={"content": "x"})
    assert r.status_code == 400


# 9. Name longer than 64 characters rejected
async def test_long_name_rejected(client: AsyncClient):
    long_name = "a" * 65
    r = await client.put(f"/api/notes/{long_name}", json={"content": "x"})
    assert r.status_code == 400


# 10. Oversized body (>100 KiB) rejected by Pydantic before gateway
async def test_oversized_body_rejected(client: AsyncClient):
    big_content = "x" * (100 * 1024 + 1)
    r = await client.put("/api/notes/test", json={"content": big_content})
    # Pydantic validator raises ValueError → FastAPI returns 422
    assert r.status_code == 422


# 11. GET /api/notes/ (trailing slash) returns the list, not a named-note read
async def test_list_via_trailing_slash(client: AsyncClient):
    r = await client.get("/api/notes/")
    assert r.status_code in (200, 307)
    if r.status_code == 200:
        assert isinstance(r.json(), list)


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


# 13. Oversized args (>64 KiB) → HTTP 413
async def test_gateway_oversized_args_rejected():
    from fastapi import HTTPException

    from app.gateway import call_tool

    big = "x" * (64 * 1024 + 1)
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


# 15. Slow tool → HTTP 504 after TOOL_TIMEOUT_SECONDS
async def test_gateway_timeout():
    from fastapi import HTTPException

    import app.gateway as gw_module
    from app.gateway import call_tool

    original_timeout = gw_module.TOOL_TIMEOUT_SECONDS
    gw_module.TOOL_TIMEOUT_SECONDS = 0.05  # 50 ms for test speed

    async def _slow(*_a, **_kw):
        await asyncio.sleep(10)

    try:
        with patch("app.gateway._dispatch", new=AsyncMock(side_effect=_slow)), pytest.raises(HTTPException) as exc_info:
            await call_tool("list_notes", {})
        assert exc_info.value.status_code == 504
    finally:
        gw_module.TOOL_TIMEOUT_SECONDS = original_timeout


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


# 17. MCP Guard server info endpoint — name and tools
async def test_mcp_info_shape(client: AsyncClient):
    r = await client.get("/api/mcp/info")
    assert r.status_code == 200
    data = r.json()
    assert data["server_name"] == "mcp-guard"
    assert data["transport"] == "streamable-http"
    assert data["mcp_endpoint"] == "/mcp/"
    assert set(data["tools"]) == {"list_notes", "read_note", "write_note"}
