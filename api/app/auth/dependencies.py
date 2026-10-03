import logging
from collections.abc import Callable
from typing import Annotated

from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPBearer

from app.auth.bearer import AuthenticationError, authenticate
from app.auth.principal import Principal
from app.auth.scopes import ROUTE_SCOPES

logger = logging.getLogger(__name__)

# Used only so Swagger UI shows the Authorize button.
bearer_scheme = HTTPBearer(auto_error=False)


async def get_principal(
    request: Request, _token: str | None = Depends(bearer_scheme)
) -> Principal:
    if hasattr(request.state, "principal"):
        return request.state.principal

    try:
        principal = await authenticate(request.scope["headers"])
    except AuthenticationError:
        raise HTTPException(
            status_code=401,
            detail="Authentication required.",
            headers={"WWW-Authenticate": "Bearer"},
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
                        "WWW-Authenticate": f'Bearer error="insufficient_scope", scope="{scope}"'
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
        raise HTTPException(status_code=403, detail="Forbidden")

    if required_scope is None:
        return None

    try:
        principal = await authenticate(request.scope["headers"])
    except AuthenticationError:
        raise HTTPException(
            status_code=401,
            detail="Authentication required.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not principal.has_scope(required_scope):
        raise HTTPException(
            status_code=403,
            detail=f"Missing required scope: {required_scope}.",
            headers={
                "WWW-Authenticate": f'Bearer error="insufficient_scope", scope="{required_scope}"'
            },
        )

    request.state.principal = principal
    return principal
