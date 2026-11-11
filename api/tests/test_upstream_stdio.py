"""Tests for StdioMcp Content-Length framing and validation."""

from __future__ import annotations

import asyncio
from unittest.mock import MagicMock

import pytest

from app.main import app  # noqa: F401
from app.sandbox.errors import SandboxOutputError, SandboxToolError
from app.sandbox.types import ERROR_PROTOCOL_ERROR
from app.upstream.stdio import StdioMcp, _content_length

pytestmark = pytest.mark.anyio


def test_content_length_valid() -> None:
    assert _content_length(b"Content-Length: 42\r\n") == 42
    assert _content_length(b"content-length: 100\n") == 100
    assert _content_length(b"CONTENT-LENGTH:   500  ") == 500


def test_content_length_invalid_format() -> None:
    with pytest.raises(SandboxToolError) as exc_info:
        _content_length(b"Content-Length: abc")
    assert exc_info.value.error_type == ERROR_PROTOCOL_ERROR

    with pytest.raises(SandboxToolError) as exc_info:
        _content_length(b"Content-Length")
    assert exc_info.value.error_type == ERROR_PROTOCOL_ERROR

    with pytest.raises(SandboxToolError) as exc_info:
        _content_length(b"Content-Length:")
    assert exc_info.value.error_type == ERROR_PROTOCOL_ERROR


def test_content_length_non_positive() -> None:
    with pytest.raises(SandboxToolError) as exc_info:
        _content_length(b"Content-Length: 0\r\n")
    assert exc_info.value.error_type == ERROR_PROTOCOL_ERROR

    with pytest.raises(SandboxToolError) as exc_info:
        _content_length(b"Content-Length: -1\r\n")
    assert exc_info.value.error_type == ERROR_PROTOCOL_ERROR

    with pytest.raises(SandboxToolError) as exc_info:
        _content_length(b"Content-Length: -9999\r\n")
    assert exc_info.value.error_type == ERROR_PROTOCOL_ERROR


def test_content_length_exceeds_limit() -> None:
    # Custom max_bytes
    assert _content_length(b"Content-Length: 50\r\n", max_bytes=100) == 50
    with pytest.raises(SandboxOutputError):
        _content_length(b"Content-Length: 101\r\n", max_bytes=100)

    # Default limit
    huge = 100_000_000
    with pytest.raises(SandboxOutputError):
        _content_length(f"Content-Length: {huge}\r\n".encode())


async def test_stdio_mcp_read_content_length_success() -> None:
    body = b'{"jsonrpc":"2.0","id":1,"result":{"ok":true}}'
    header = f"Content-Length: {len(body)}\r\n\r\n".encode()

    reader = asyncio.StreamReader()
    reader.feed_data(header + body)
    reader.feed_eof()

    writer = MagicMock()
    client = StdioMcp(writer, reader)
    res = await client._read()
    assert res == {"jsonrpc": "2.0", "id": 1, "result": {"ok": True}}


async def test_stdio_mcp_read_incomplete() -> None:
    # Header says 100 bytes, but only 10 bytes provided
    header = b"Content-Length: 100\r\n\r\n"
    truncated_body = b"short text"

    reader = asyncio.StreamReader()
    reader.feed_data(header + truncated_body)
    reader.feed_eof()

    writer = MagicMock()
    client = StdioMcp(writer, reader)
    with pytest.raises(SandboxToolError) as exc_info:
        await client._read()
    assert exc_info.value.error_type == ERROR_PROTOCOL_ERROR


async def test_stdio_mcp_read_oversized_content_length() -> None:
    header = b"Content-Length: 500\r\n\r\n"

    reader = asyncio.StreamReader()
    reader.feed_data(header)
    reader.feed_eof()

    writer = MagicMock()
    client = StdioMcp(writer, reader, max_bytes=100)
    with pytest.raises(SandboxOutputError):
        await client._read()
