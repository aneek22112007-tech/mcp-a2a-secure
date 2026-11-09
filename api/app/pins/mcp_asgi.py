"""Reject unapproved MCP ``tools/call`` messages before they are forwarded.

Other JSON-RPC methods are forwarded unchanged. Response bodies, including
streamable-HTTP event streams, are not rewritten.
"""

from __future__ import annotations

from starlette.types import ASGIApp, Receive, Scope, Send

from app.audit.events import (
    STATUS_DENIED,
    AuditRecord,
)
from app.audit.redaction import current_client_ip, current_request_id, safe_tool_name
from app.audit.sink import record_event
from app.auth.principal import Principal
from app.config import settings
from app.mcp_jsonrpc import (
    body_bytes,
    buffer_body,
    is_json,
    replay,
    tools_calls,
)
from app.middleware import _send_error
from app.models.audit_events import AUDIT_DECISION_DENIED
from app.pins.types import MODE_OFF, MODE_WARN, PIN_REASON_MISSING
from app.services.pins import PinDecision, evaluate_tool, pin_audit_action

__all__ = [
    "McpToolPinMiddleware",
    "body_bytes",
    "buffer_body",
    "is_json",
    "replay",
    "tools_calls",
]


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

        buffered = await buffer_body(receive)
        if buffered is None:
            return

        calls = tools_calls(scope, buffered)
        if not calls:
            await self.app(scope, replay(buffered, receive), send)
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

        await self.app(scope, replay(buffered, receive), send)


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
