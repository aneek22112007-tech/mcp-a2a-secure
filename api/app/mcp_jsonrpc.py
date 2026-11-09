"""Shared request-body and JSON-RPC helpers for MCP ASGI middleware."""

from __future__ import annotations

import json

from starlette.types import Message, Receive, Scope


async def buffer_body(receive: Receive) -> list[Message] | None:
    """Buffer the HTTP request body until completion or disconnect.

    Returns None if an http.disconnect message is received.
    """
    buffered: list[Message] = []
    while True:
        message = await receive()
        kind = message["type"]
        if kind == "http.disconnect":
            return None
        buffered.append(message)
        if kind != "http.request":
            break
        if not message.get("more_body", False):
            break
    return buffered


def replay(buffered: list[Message], receive: Receive) -> Receive:
    """Replay buffered ASGI messages before reading further from receive."""
    index = 0

    async def _replay() -> Message:
        nonlocal index
        if index < len(buffered):
            message = buffered[index]
            index += 1
            return message
        return await receive()

    return _replay


def is_json(scope: Scope) -> bool:
    """Check whether the request has an application/json content-type."""
    for key, value in scope.get("headers", []):
        if key.lower() != b"content-type":
            continue
        try:
            text = value.decode("latin-1")
        except UnicodeDecodeError:
            continue
        if "application/json" in text.lower():
            return True
    return False


def body_bytes(buffered: list[Message]) -> bytes:
    """Extract and concatenate the raw body bytes from buffered ASGI messages."""
    parts: list[bytes] = []
    for message in buffered:
        if message["type"] != "http.request":
            continue
        body = message.get("body", b"") or b""
        if isinstance(body, bytearray):
            body = bytes(body)
        if isinstance(body, bytes):
            parts.append(body)
    return b"".join(parts)


def tools_calls(scope: Scope, buffered: list[Message]) -> list[dict]:
    """Parse JSON-RPC payload from buffered body and extract any tools/call requests."""
    if not is_json(scope):
        return []
    try:
        payload = json.loads(body_bytes(buffered))
    except (UnicodeDecodeError, json.JSONDecodeError, TypeError, ValueError):
        return []
    if isinstance(payload, dict):
        messages = [payload]
    elif isinstance(payload, list):
        messages = payload
    else:
        return []
    calls: list[dict] = []
    for item in messages:
        if isinstance(item, dict) and item.get("method") == "tools/call":
            calls.append(item)
    return calls
