from contextlib import asynccontextmanager

import anyio
import httpx
import pytest
from mcp import ClientSession

from app.mcp_client import connect


@asynccontextmanager
async def mock_streamable_http_client(*args, **kwargs):
    send_tx, _send_rx = anyio.create_memory_object_stream(10)
    _receive_tx, receive_rx = anyio.create_memory_object_stream(10)

    # We yield receive_rx (as the read stream) and send_tx (as the write stream)
    yield (receive_rx, send_tx, lambda: "test_session_id")


@pytest.mark.anyio
async def test_connect_success(monkeypatch):
    import app.mcp_client as mcp_client_module

    # Mock the streamable_http_client
    monkeypatch.setattr(
        mcp_client_module, "streamable_http_client", mock_streamable_http_client
    )

    # We must also mock the ClientSession because we're just testing the context manager wrapping
    # actually, ClientSession can wrap MockStream without issue.

    async with connect("http://dummy_url", timeout=1) as session:
        assert isinstance(session, ClientSession)


@pytest.mark.anyio
async def test_connect_failure(monkeypatch):
    import app.mcp_client as mcp_client_module

    @asynccontextmanager
    async def failing_streamable(*args, **kwargs):
        raise httpx.ConnectError("Failed to connect")
        yield  # unreachable

    monkeypatch.setattr(mcp_client_module, "streamable_http_client", failing_streamable)

    with pytest.raises(httpx.ConnectError):
        async with connect("http://dummy_url", timeout=1):
            pass
