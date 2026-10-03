"""Online and offline coverage for GET /api/status.

The online case has to be a real uvicorn process. A TestClient self-call
deadlocks: the MCP client needs the same portal that is blocked inside the
status request. StreamableHTTPSessionManager.run() also refuses a second
start, and test_mcp_http.py already starts it, so this module resets that
one-shot flag before launching the server.
"""

from __future__ import annotations

import socket
import threading
import time

import httpx
import pytest
import uvicorn

from app.config import settings
from app.main import app
from app.mcp_server import mcp

EXPECTED_TOOLS = ["list_notes", "read_note", "write_note"]


def _free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


@pytest.fixture(scope="module")
def live_server():
    manager = mcp.session_manager
    if getattr(manager, "_has_started", False):
        manager._has_started = False

    port = _free_port()
    server = uvicorn.Server(
        uvicorn.Config(app, host="127.0.0.1", port=port, log_level="warning")
    )
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()

    deadline = time.monotonic() + 15
    while not server.started:
        if time.monotonic() > deadline:
            server.should_exit = True
            thread.join(timeout=5)
            raise RuntimeError("uvicorn did not start")
        time.sleep(0.05)

    try:
        yield port
    finally:
        server.should_exit = True
        thread.join(timeout=5)


def test_status_online(live_server, monkeypatch):
    monkeypatch.setattr(
        settings, "mcp_self_url", f"http://127.0.0.1:{live_server}/mcp/"
    )
    from pydantic import SecretStr

    monkeypatch.setattr(settings, "mcp_self_api_key", SecretStr("mcpg_test"))
    response = httpx.get(f"http://127.0.0.1:{live_server}/api/status", timeout=10)

    assert response.status_code == 200
    body = response.json()
    assert body["mcp"] == "online"
    assert body["latency_ms"] > 0
    assert body["error"] is None
    assert sorted(tool["name"] for tool in body["tools"]) == EXPECTED_TOOLS
    for tool in body["tools"]:
        assert isinstance(tool["input_schema"], dict)


def test_status_offline(live_server, monkeypatch):
    closed = _free_port()
    monkeypatch.setattr(settings, "mcp_self_url", f"http://127.0.0.1:{closed}/mcp/")
    response = httpx.get(f"http://127.0.0.1:{live_server}/api/status", timeout=10)

    assert response.status_code == 200
    body = response.json()
    assert body["mcp"] == "offline"
    assert isinstance(body["error"], str) and body["error"]
