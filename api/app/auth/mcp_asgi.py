import logging

from starlette.types import ASGIApp, Receive, Scope, Send

from app.audit.events import (
    ACTION_AUTH_ALLOW,
    ACTION_AUTH_DENY,
    STATUS_DENIED,
    STATUS_ERROR,
    STATUS_OK,
    AuditRecord,
)
from app.audit.redaction import current_request_id
from app.audit.sink import record_event
from app.auth.bearer import AuthenticationError, authenticate
from app.auth.principal import Principal
from app.auth.scopes import MCP_REQUIRED_SCOPE
from app.middleware import _send_error
from app.models.audit_events import AUDIT_DECISION_ALLOWED, AUDIT_DECISION_DENIED

logger = logging.getLogger(__name__)

_AUTH_REASONS = frozenset({"missing", "duplicate", "malformed", "rejected"})


def _authentication_reason(exc: AuthenticationError) -> str:
    if exc.args and isinstance(exc.args[0], str) and exc.args[0] in _AUTH_REASONS:
        return exc.args[0]
    return "rejected"


def _route_template(scope: Scope) -> str:
    return f"{scope['method']} /mcp"


async def _record_mcp_auth(
    scope: Scope,
    *,
    allowed: bool,
    status: str,
    reason: str,
    principal: Principal | None = None,
    status_code: int | None = None,
    error_code: str | None = None,
) -> None:
    template = _route_template(scope)
    await record_event(
        AuditRecord(
            action=ACTION_AUTH_ALLOW if allowed else ACTION_AUTH_DENY,
            decision=AUDIT_DECISION_ALLOWED if allowed else AUDIT_DECISION_DENIED,
            status=status,
            reason=f"route={template}" if allowed else reason,
            status_code=status_code,
            error_code=error_code,
            request_id=current_request_id(scope),
            **AuditRecord.actor_fields(principal),
        ),
        required=False,
    )


class McpBearerAuthMiddleware:
    def __init__(self, app: ASGIApp, required_scope: str = MCP_REQUIRED_SCOPE) -> None:
        self.app = app
        self.required_scope = required_scope

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        try:
            principal = await authenticate(scope["headers"])
        except AuthenticationError as exc:
            await _record_mcp_auth(
                scope,
                allowed=False,
                status=STATUS_DENIED,
                reason=_authentication_reason(exc),
                status_code=401,
                error_code="UNAUTHORIZED",
            )
            await _send_error(
                send,
                None,
                401,
                "UNAUTHORIZED",
                "Authentication required.",
                extra_headers=[(b"www-authenticate", b"Bearer")],
            )
            return
        except Exception as exc:
            await _record_mcp_auth(
                scope,
                allowed=False,
                status=STATUS_ERROR,
                reason="verifier_error",
                status_code=500,
                error_code="INTERNAL_SERVER_ERROR",
            )
            logger.exception("Verifier exception type=%s", type(exc).__name__)
            await _send_error(
                send,
                None,
                500,
                "INTERNAL_SERVER_ERROR",
                "An unexpected error occurred.",
            )
            return

        if not principal.has_scope(self.required_scope):
            await _record_mcp_auth(
                scope,
                allowed=False,
                status=STATUS_DENIED,
                reason=f"insufficient_scope:{self.required_scope}",
                principal=principal,
                status_code=403,
                error_code="FORBIDDEN",
            )
            await _send_error(
                send,
                None,
                403,
                "FORBIDDEN",
                f"Missing required scope: {self.required_scope}.",
                extra_headers=[
                    (
                        b"www-authenticate",
                        f'Bearer error="insufficient_scope", scope="{self.required_scope}"'.encode(
                            "ascii"
                        ),
                    )
                ],
            )
            return

        await _record_mcp_auth(
            scope,
            allowed=True,
            status=STATUS_OK,
            reason=f"route={_route_template(scope)}",
            principal=principal,
        )
        scope["mcp_guard.principal"] = principal
        scope.setdefault("state", {})["principal"] = principal
        await self.app(scope, receive, send)
