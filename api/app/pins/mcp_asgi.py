"""Reject unapproved MCP ``tools/call`` messages before they are forwarded.

Other JSON-RPC methods are forwarded unchanged. Response bodies, including
streamable-HTTP event streams, are not rewritten.
"""

from __future__ import annotations

import json

from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.audit.events import (
    STATUS_DENIED,
    AuditRecord,
)
from app.audit.redaction import current_client_ip, current_request_id, safe_tool_name
from app.audit.sink import record_event
from app.auth.principal import Principal
from app.config import settings
from app.middleware import _send_error
from app.models.audit_events import AUDIT_DECISION_DENIED
from app.pins.types import MODE_OFF, MODE_WARN, PIN_REASON_MISSING
from app.services.pins import PinDecision, evaluate_tool, pin_audit_action


class McpToolPinMiddleware:
    """Hold ``tools/call`` when pinning is enforced and the tool is not approved.

    ``off`` does not read the body. ``warn`` records the pin decision and
    forwards the call. ``enforce`` returns 403 and does not call the inner app.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope.get("method") != "POST":
            await self.app(scope, receive, send)
            return
        if settings.tool_pinning_mode == MODE_OFF:
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

        calls = _tools_calls(scope, buffered)
        if not calls:
            await self.app(scope, _replay(buffered, receive), send)
            return

        blocked = False
        for call in calls:
            params = call.get("params")
            if not isinstance(params, dict):
                params = {}
            decision = await _decision_for(params.get("name"))
            if decision.allowed:
                continue
            await _audit_pin(scope, params.get("name"), decision)
            if settings.tool_pinning_mode != MODE_WARN:
                blocked = True
        if blocked:
            await _send_error(
                send,
                None,
                403,
                "FORBIDDEN",
                "Tool is not approved.",
            )
            return

        await self.app(scope, _replay(buffered, receive), send)


def _replay(buffered: list[Message], receive: Receive):
    index = 0

    async def replay() -> Message:
        nonlocal index
        if index < len(buffered):
            message = buffered[index]
            index += 1
            return message
        return await receive()

    return replay


async def _decision_for(name: object) -> PinDecision:
    if not isinstance(name, str) or not name:
        return PinDecision(
            allowed=False,
            reason=PIN_REASON_MISSING,
            live_fingerprint=None,
            pinned_fingerprint=None,
            status=None,
        )
    return await evaluate_tool(name)


async def _audit_pin(scope: Scope, name: object, decision: PinDecision) -> None:
    principal = scope.get("mcp_guard.principal")
    if not isinstance(principal, Principal):
        principal = None
    reason = decision.reason or PIN_REASON_MISSING
    blocked = settings.tool_pinning_mode != MODE_WARN
    await record_event(
        AuditRecord(
            action=pin_audit_action(reason),
            decision=AUDIT_DECISION_DENIED,
            status=STATUS_DENIED,
            tool_name=safe_tool_name(name),
            args_hash=decision.live_fingerprint,
            reason=reason,
            status_code=403 if blocked else None,
            error_code="FORBIDDEN" if blocked else None,
            request_id=current_request_id(scope),
            client_ip=current_client_ip(scope),
            **AuditRecord.actor_fields(principal),
        ),
        required=False,
    )


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
