import logging
from collections.abc import Callable
from typing import Annotated

from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPBearer

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
from app.auth.scopes import ROUTE_SCOPES
from app.models.audit_events import AUDIT_DECISION_ALLOWED, AUDIT_DECISION_DENIED

logger = logging.getLogger(__name__)

# Used only so Swagger UI shows the Authorize button.
bearer_scheme = HTTPBearer(auto_error=False)

_AUTH_REASONS = frozenset({"missing", "duplicate", "malformed", "rejected"})


def _authentication_reason(exc: AuthenticationError) -> str:
    if exc.args and isinstance(exc.args[0], str) and exc.args[0] in _AUTH_REASONS:
        return exc.args[0]
    return "rejected"


def _route_template(request: Request) -> str:
    return f"{request.scope['method']} {request.scope['route'].path}"


async def _record_auth_decision(
    request: Request,
    *,
    allowed: bool,
    status: str,
    reason: str,
    principal: Principal | None = None,
    status_code: int | None = None,
    error_code: str | None = None,
) -> None:
    """Record one auth decision. Failures are best-effort and do not change the response."""

    template = _route_template(request)
    await record_event(
        AuditRecord(
            action=ACTION_AUTH_ALLOW if allowed else ACTION_AUTH_DENY,
            decision=(AUDIT_DECISION_ALLOWED if allowed else AUDIT_DECISION_DENIED),
            status=status,
            reason=f"route={template}" if allowed else reason,
            status_code=status_code,
            error_code=error_code,
            request_id=current_request_id(request.scope),
            **AuditRecord.actor_fields(principal),
        ),
        required=False,
    )


async def get_principal(
    request: Request, _token: str | None = Depends(bearer_scheme)
) -> Principal:
    if hasattr(request.state, "principal"):
        return request.state.principal

    try:
        principal = await authenticate(request.scope["headers"])
    except AuthenticationError as exc:
        await _record_auth_decision(
            request,
            allowed=False,
            status=STATUS_DENIED,
            reason=_authentication_reason(exc),
            status_code=401,
            error_code="UNAUTHORIZED",
        )
        raise HTTPException(
            status_code=401,
            detail="Authentication required.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except Exception:
        await _record_auth_decision(
            request,
            allowed=False,
            status=STATUS_ERROR,
            reason="verifier_error",
            status_code=500,
            error_code="INTERNAL_SERVER_ERROR",
        )
        raise

    await _record_auth_decision(
        request,
        allowed=True,
        status=STATUS_OK,
        reason=f"route={_route_template(request)}",
        principal=principal,
    )
    request.state.principal = principal
    return principal


def require_scopes(*scopes: str) -> Callable:
    async def scope_dependency(
        principal: Annotated[Principal, Depends(get_principal)],
    ) -> Principal:
        for scope in scopes:
            if not principal.has_scope(scope):
                raise HTTPException(
                    status_code=403,
                    detail=f"Missing required scope: {scope}.",
                    headers={
                        "WWW-Authenticate": (
                            f'Bearer error="insufficient_scope", scope="{scope}"'
                        )
                    },
                )
        return principal

    return scope_dependency


async def authorize_route(
    request: Request, _token: str | None = Depends(bearer_scheme)
) -> Principal | None:
    method = request.scope["method"]
    check_method = "GET" if method == "HEAD" else method
    route_path = request.scope["route"].path

    required_scope = ROUTE_SCOPES.get((check_method, route_path))

    if (check_method, route_path) not in ROUTE_SCOPES:
        logger.warning(
            "[auth] Unmapped route accessed, failing closed method=%s path=%s",
            check_method,
            route_path,
        )
        await _record_auth_decision(
            request,
            allowed=False,
            status=STATUS_DENIED,
            reason="unmapped_route",
            status_code=403,
            error_code="FORBIDDEN",
        )
        raise HTTPException(status_code=403, detail="Forbidden")

    if required_scope is None:
        return None

    try:
        principal = await authenticate(request.scope["headers"])
    except AuthenticationError as exc:
        await _record_auth_decision(
            request,
            allowed=False,
            status=STATUS_DENIED,
            reason=_authentication_reason(exc),
            status_code=401,
            error_code="UNAUTHORIZED",
        )
        raise HTTPException(
            status_code=401,
            detail="Authentication required.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except Exception:
        await _record_auth_decision(
            request,
            allowed=False,
            status=STATUS_ERROR,
            reason="verifier_error",
            status_code=500,
            error_code="INTERNAL_SERVER_ERROR",
        )
        raise

    if not principal.has_scope(required_scope):
        await _record_auth_decision(
            request,
            allowed=False,
            status=STATUS_DENIED,
            reason=f"insufficient_scope:{required_scope}",
            principal=principal,
            status_code=403,
            error_code="FORBIDDEN",
        )
        raise HTTPException(
            status_code=403,
            detail=f"Missing required scope: {required_scope}.",
            headers={
                "WWW-Authenticate": (
                    f'Bearer error="insufficient_scope", scope="{required_scope}"'
                )
            },
        )

    await _record_auth_decision(
        request,
        allowed=True,
        status=STATUS_OK,
        reason=f"route={_route_template(request)}",
        principal=principal,
    )
    request.state.principal = principal
    return principal
