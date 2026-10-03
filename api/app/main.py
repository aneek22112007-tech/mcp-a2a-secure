"""MCP Guard — FastAPI application entry point.

Mounts:
  - REST router: status endpoints (from PR #76)
  - REST router: notes endpoints (Day 1)
  - MCP streamable-HTTP transport at /mcp/ (Day 2 Auth)
"""

import time
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.types import ASGIApp

from app.auth import McpBearerAuthMiddleware
from app.auth.scopes import check_route_scope_coverage
from app.config import settings
from app.errors import register_error_handlers
from app.mcp_server import ensure_notes_dir, mcp
from app.middleware import (
    BodySizeLimitMiddleware,
    RequestContextMiddleware,
    SecurityHeadersMiddleware,
    install_request_id_logging,
)
from app.routes.notes import router as notes_router
from app.routes.status import router as status_router

install_request_id_logging()


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.started_at = time.monotonic()
    ensure_notes_dir()

    from app.auth.verifier import (
        DenyAllVerifier,
        get_api_key_verifier,
        set_api_key_verifier,
    )
    from app.services.api_keys import HmacApiKeyVerifier

    if isinstance(get_api_key_verifier(), DenyAllVerifier):
        set_api_key_verifier(HmacApiKeyVerifier())

    async with mcp.session_manager.run():
        yield


def apply_http_middleware(application: FastAPI) -> None:
    """Install the HTTP middleware stack.

    Starlette builds ServerErrorMiddleware outside ``add_middleware`` entries.
    Request context wraps that built stack so 500 logs still see the request id.
    Security headers wrap the request context, including those error responses.
    """

    application.add_middleware(BodySizeLimitMiddleware)
    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "PUT"],
        allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
    )
    original_build = application.build_middleware_stack

    def build_middleware_stack() -> ASGIApp:
        return SecurityHeadersMiddleware(RequestContextMiddleware(original_build()))

    application.build_middleware_stack = build_middleware_stack  # type: ignore[method-assign]


docs_args = {}
if settings.environment not in ("development", "dev", "local"):
    docs_args = {"docs_url": None, "redoc_url": None, "openapi_url": None}

app = FastAPI(title=settings.app_name, lifespan=lifespan, **docs_args)

register_error_handlers(app)
apply_http_middleware(app)

# Status endpoints (PR #76 — real MCP handshake health check)
app.include_router(status_router)

# Notes REST endpoints (Day 1 — gateway-backed CRUD)
app.include_router(notes_router)

from app.routes.api_keys import router as api_keys_router

app.include_router(api_keys_router)


@app.get("/health")
def health():
    return {"status": "ok", "app": settings.app_name}


# MCP streamable-HTTP transport — Inspector and A2A workers connect here
app.mount("/mcp", McpBearerAuthMiddleware(mcp.streamable_http_app()))

# Must be called after every route and mount is registered so the allowlist
# check catches unmapped routes at import time, not at first request.
check_route_scope_coverage(app)
