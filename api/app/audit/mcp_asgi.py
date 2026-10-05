"""Fail-closed audit of MCP ``tools/call`` messages before they are forwarded."""

from __future__ import annotations

import json

from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.audit.events import (
    ACTION_MCP_TOOLS_CALL,
    STATUS_FORWARDED,
    AuditRecord,
)
from app.audit.redaction import (
    args_fingerprint,
    current_client_ip,
    current_request_id,
    safe_tool_name,
)
from app.audit.sink import AuditUnavailableError, record_event
from app.auth.principal import Principal
from app.middleware import _send_error
from app.models.audit_events import AUDIT_DECISION_ALLOWED


class McpToolAuditMiddleware:
    """Record each ``tools/call`` in a POST body, then replay that body.

    Non-HTTP and non-POST traffic is forwarded untouched. Bodies that are not
    JSON, and JSON-RPC methods other than ``tools/call``, are forwarded with
    no row from this middleware. A required audit failure returns 503 and
    does not call the inner MCP app.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope.get("method") != "POST":
            await self.app(scope, receive, send)
            return

        buffered: list[Message] = []
        while True:
            message = await receive()
            kind = message["type"]
            if kind == "http.disconnect":
                return
            buffered.append(message)
            if kind != "http.request":
                break
            if not message.get("more_body", False):
                break

        if not await _audit_tools_calls(scope, buffered, send):
            return

        index = 0

        async def replay() -> Message:
            nonlocal index
            if index < len(buffered):
                message = buffered[index]
                index += 1
                return message
            # Further reads belong to the real client. Synthesizing empty body
            # messages here busy-loops transports that read until disconnect.
            return await receive()

        await self.app(scope, replay, send)


async def _audit_tools_calls(scope: Scope, buffered: list[Message], send: Send) -> bool:
    """Record tools/call rows. Return False when the response was already sent."""

    for call in _tools_calls(scope, buffered):
        params = call.get("params")
        if not isinstance(params, dict):
            params = {}
        try:
            event = await record_event(
                _tools_call_record(scope, params),
                required=True,
            )
        except AuditUnavailableError:
            await _send_error(
                send,
                None,
                503,
                "SERVICE_UNAVAILABLE",
                "Audit log unavailable.",
            )
            return False
        audit_ids = scope.setdefault("mcp_guard.tools_call_audit_ids", {})
        audit_ids[str(call.get("id"))] = None if event is None else event.id
    return True


def _tools_calls(scope: Scope, buffered: list[Message]) -> list[dict]:
    if not _is_json(scope):
        return []
    try:
        payload = json.loads(_body_bytes(buffered))
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


def _tools_call_record(scope: Scope, params: dict) -> AuditRecord:
    principal = scope.get("mcp_guard.principal")
    if not isinstance(principal, Principal):
        principal = None
    return AuditRecord(
        action=ACTION_MCP_TOOLS_CALL,
        decision=AUDIT_DECISION_ALLOWED,
        status=STATUS_FORWARDED,
        tool_name=safe_tool_name(params.get("name")),
        args_hash=args_fingerprint(params.get("arguments")),
        request_id=current_request_id(scope),
        client_ip=current_client_ip(scope),
        **AuditRecord.actor_fields(principal),
    )


def _is_json(scope: Scope) -> bool:
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


def _body_bytes(buffered: list[Message]) -> bytes:
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
