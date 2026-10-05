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

from fastapi import Depends, FastAPI
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
from app.pins.listing import install_pinned_tool_list
from app.pins.mcp_asgi import McpToolPinMiddleware
from app.rate_limit import McpRateLimitMiddleware, rate_limit_dependency
from app.routes.api_keys import router as api_keys_router
from app.routes.audit import router as audit_router
from app.routes.metrics import router as metrics_router
from app.routes.notes import router as notes_router
from app.routes.sandbox import router as sandbox_router
from app.routes.status import router as status_router
from app.sandbox.recorder import NullRunRecorder, get_run_recorder, set_run_recorder
from app.services.api_keys import HmacApiKeyVerifier
from app.services.retention import retention_scheduler_task
from app.services.sandbox_runs import DbRunRecorder, sweep_stale_runs

install_request_id_logging()


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.started_at = time.monotonic()
    ensure_notes_dir()

    if isinstance(get_api_key_verifier(), DenyAllVerifier):
        set_api_key_verifier(HmacApiKeyVerifier())

    if isinstance(get_run_recorder(), NullRunRecorder):
        set_run_recorder(DbRunRecorder())

    install_pinned_tool_list()
    if settings.tool_pinning_bootstrap_approve:
        from app.services.pins import bootstrap_approve_current_tools

        await bootstrap_approve_current_tools()

    try:
        await sweep_stale_runs()
    except Exception:
        import logging

        logging.getLogger(__name__).exception(
            "Failed to sweep stale sandbox runs at startup"
        )

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
        allow_methods=["GET", "POST", "PUT", "DELETE"],
        allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
        expose_headers=["X-Request-ID", "Retry-After"],
        max_age=600,
    )
    original_build = application.build_middleware_stack

    def build_middleware_stack() -> ASGIApp:
        from app.middleware import ClientIPMiddleware

        return SecurityHeadersMiddleware(
            RequestContextMiddleware(ClientIPMiddleware(original_build()))
        )

    application.build_middleware_stack = build_middleware_stack  # type: ignore[method-assign]


docs_args = {}
if not settings.is_development:
    docs_args = {"docs_url": None, "redoc_url": None, "openapi_url": None}

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
app.include_router(sandbox_router)


@app.get("/health")
def health():
    return {"status": "ok", "app": settings.app_name}


# MCP streamable-HTTP transport — Inspector and A2A workers connect here
app.mount(
    "/mcp",
    McpBearerAuthMiddleware(
        McpRateLimitMiddleware(
            McpToolPinMiddleware(McpToolAuditMiddleware(mcp.streamable_http_app()))
        )
    ),
)

# Must be called after every route and mount is registered so the allowlist
# check catches unmapped routes at import time, not at first request.
check_route_scope_coverage(app)
