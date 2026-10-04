"""MCP Guard — FastAPI application entry point.

Mounts:
  - REST router: status endpoints
  - REST router: notes endpoints
  - REST router: API keys
  - REST router: audit log and live SSE stream
  - MCP streamable-HTTP transport at /mcp/
"""

import asyncio
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.types import ASGIApp

from app.audit.mcp_asgi import McpToolAuditMiddleware
from app.auth import McpBearerAuthMiddleware
from app.auth.scopes import check_route_scope_coverage
from app.auth.verifier import (
    DenyAllVerifier,
    get_api_key_verifier,
    set_api_key_verifier,
)
from app.config import settings
from app.errors import register_error_handlers
from app.mcp_server import ensure_notes_dir, mcp
from app.middleware import (
    BodySizeLimitMiddleware,
    RequestContextMiddleware,
    SecurityHeadersMiddleware,
    install_request_id_logging,
)
from app.rate_limit import McpRateLimitMiddleware, rate_limit_dependency
from app.routes.api_keys import router as api_keys_router
from app.routes.audit import router as audit_router
from app.routes.metrics import router as metrics_router
from app.routes.notes import router as notes_router
from app.routes.status import router as status_router
from app.services.api_keys import HmacApiKeyVerifier

install_request_id_logging()


from app.services.retention import retention_scheduler_task


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.started_at = time.monotonic()
    ensure_notes_dir()

    if isinstance(get_api_key_verifier(), DenyAllVerifier):
        set_api_key_verifier(HmacApiKeyVerifier())

    scheduler_task = None
    if settings.enable_retention_scheduler:
        scheduler_task = asyncio.create_task(retention_scheduler_task())

    async with mcp.session_manager.run():
        yield

    if scheduler_task:
        scheduler_task.cancel()
        try:
            await scheduler_task
        except asyncio.CancelledError:
            pass


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

from fastapi import Depends

app = FastAPI(
    title=settings.app_name,
    lifespan=lifespan,
    dependencies=[Depends(rate_limit_dependency)],
    **docs_args,
)

register_error_handlers(app)
apply_http_middleware(app)

# Status endpoints (PR #76 — real MCP handshake health check)
app.include_router(status_router)

# Notes REST endpoints (Day 1 — gateway-backed CRUD)
app.include_router(notes_router)

app.include_router(api_keys_router)
app.include_router(audit_router)
app.include_router(metrics_router)


@app.get("/health")
def health():
    return {"status": "ok", "app": settings.app_name}


# MCP streamable-HTTP transport — Inspector and A2A workers connect here
app.mount(
    "/mcp",
    McpBearerAuthMiddleware(
        McpRateLimitMiddleware(McpToolAuditMiddleware(mcp.streamable_http_app()))
    ),
)

# Must be called after every route and mount is registered so the allowlist
# check catches unmapped routes at import time, not at first request.
check_route_scope_coverage(app)
