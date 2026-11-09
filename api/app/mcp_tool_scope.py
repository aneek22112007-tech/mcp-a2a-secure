"""Per-tool scope enforcement middleware for MCP streamable-HTTP transport."""

from __future__ import annotations

from starlette.types import ASGIApp, Receive, Scope, Send

from app.audit.events import (
    ACTION_AUTH_DENY,
    STATUS_DENIED,
    AuditRecord,
)
from app.audit.redaction import current_client_ip, current_request_id, safe_tool_name
from app.audit.sink import record_event
from app.auth.bearer import insufficient_scope_challenge
from app.auth.principal import Principal
from app.auth.scopes import TOOL_SCOPES
from app.mcp_jsonrpc import buffer_body, replay, tools_calls
from app.middleware import _send_error
from app.models.audit_events import AUDIT_DECISION_DENIED


class McpToolScopeMiddleware:
    """Enforce per-tool scopes on MCP ``tools/call`` requests.

    Requests lacking the required tool scope or calling unmapped tools are denied
    with 403 FORBIDDEN and audited with action ``auth.deny``.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope.get("method") != "POST":
            await self.app(scope, receive, send)
            return

        buffered = await buffer_body(receive)
        if buffered is None:
            return

        calls = tools_calls(scope, buffered)
        if not calls:
            await self.app(scope, replay(buffered, receive), send)
            return

        principal = scope.get("mcp_guard.principal")
        if not isinstance(principal, Principal):
            principal = None

        denials: list[tuple[object, str, str | None]] = []
        for call in calls:
            params = call.get("params")
            if not isinstance(params, dict):
                params = {}
            name = params.get("name")
            if not isinstance(name, str) or name not in TOOL_SCOPES:
                denials.append((name, "unmapped_tool", None))
                continue
            required = TOOL_SCOPES[name]
            if principal is None or not principal.has_scope(required):
                denials.append((name, f"insufficient_scope:{required}", required))
                continue

        if denials:
            for name, reason, _required in denials:
                await record_event(
                    AuditRecord(
                        action=ACTION_AUTH_DENY,
                        decision=AUDIT_DECISION_DENIED,
                        status=STATUS_DENIED,
                        tool_name=safe_tool_name(name),
                        reason=reason,
                        status_code=403,
                        error_code="FORBIDDEN",
                        request_id=current_request_id(scope),
                        client_ip=current_client_ip(scope),
                        **AuditRecord.actor_fields(principal),
                    ),
                    required=False,
                )

            first_name, _first_reason, first_required = denials[0]
            if first_required is not None:
                message = f"Missing required scope: {first_required}."
                extra_headers = [
                    (
                        b"www-authenticate",
                        insufficient_scope_challenge(first_required).encode("ascii"),
                    )
                ]
            else:
                tool_label = f"'{first_name}'" if first_name else "<unknown>"
                message = f"Tool {tool_label} has no configured scope mapping."
                extra_headers = None

            await _send_error(
                send,
                None,
                403,
                "FORBIDDEN",
                message,
                extra_headers=extra_headers,
            )
            return

        await self.app(scope, replay(buffered, receive), send)
