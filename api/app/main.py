"""MCP Guard — FastAPI application entry point.

Mounts:
  - REST router: status endpoints
  - REST router: notes endpoints
  - REST router: API keys
  - REST router: audit log and live SSE stream
  - REST router: notes agent and LLM health
  - MCP streamable-HTTP transport at /mcp/
"""

import asyncio
import time
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from starlette.types import ASGIApp

from app.audit.mcp_asgi import McpToolAuditMiddleware
from app.auth import McpBearerAuthMiddleware
from app.auth.scopes import check_route_scope_coverage
from app.auth.verifier import (
    DenyAllVerifier,
    get_api_key_verifier,
    set_api_key_verifier,
)
from app.config import settings, warn_explicit_production_modes
from app.database import async_session_maker
from app.errors import register_error_handlers
from app.llm.recording import (
    DbLLMCallRecorder,
    LLMCallRecorder,
    get_recorder,
    set_recorder,
)
from app.mcp_server import ensure_notes_dir, mcp
from app.mcp_tool_scope import McpToolScopeMiddleware
from app.middleware import (
    BodySizeLimitMiddleware,
    RequestContextMiddleware,
    SecurityHeadersMiddleware,
    install_request_id_logging,
)
from app.pins.gate import NullScanGate, get_scan_gate, set_scan_gate
from app.pins.listing import install_pinned_tool_list
from app.pins.mcp_asgi import McpToolPinMiddleware
from app.rate_limit import McpRateLimitMiddleware, rate_limit_dependency
from app.routes.a2a import router as a2a_router
from app.routes.agents import router as agents_router
from app.routes.analyst import router as analyst_router
from app.routes.api_keys import router as api_keys_router
from app.routes.audit import router as audit_router
from app.routes.guard import router as guard_router
from app.routes.llm import router as llm_router
from app.routes.llm_calls import router as llm_calls_router
from app.routes.metrics import router as metrics_router
from app.routes.notes import router as notes_router
from app.routes.pins import router as pins_router
from app.routes.sandbox import router as sandbox_router
from app.routes.scanner import router as scanner_router
from app.routes.status import router as status_router
from app.routes.upstreams import router as upstreams_router
from app.sandbox.recorder import NullRunRecorder, get_run_recorder, set_run_recorder
from app.scanner.gate import DbScanGate
from app.services.api_keys import HmacApiKeyVerifier
from app.services.retention import retention_scheduler_task
from app.services.sandbox_runs import DbRunRecorder, sweep_stale_runs
from app.services.scanner import run_scan_all
from app.shared_state import status as shared_state_status

install_request_id_logging()

# Held for the life of this process. Closing it releases advisory lock 727001.
_startup_lock_conn = None


async def _release_startup_lock() -> None:
    """Drop the startup-job lock when this process stops."""

    global _startup_lock_conn
    conn = _startup_lock_conn
    _startup_lock_conn = None
    if conn is None:
        return
    try:
        await conn.execute(text("SELECT pg_advisory_unlock(727001)"))
        await conn.commit()
    finally:
        await conn.close()


async def _run_startup_jobs() -> None:
    """Run bootstrap approve, the stale-run sweep, and the startup scan once.

    Postgres takes session advisory lock 727001 and holds that connection
    until this process stops. A second replica then skips the work. Releasing
    the lock as soon as the jobs finish lets the other replica run them too,
    because these jobs are faster than replica startup. SQLite has one
    process and runs the jobs as before.
    """

    global _startup_lock_conn

    import logging

    from app.database import engine

    logger = logging.getLogger(__name__)

    async def _jobs() -> None:
        if settings.tool_pinning_bootstrap_approve:
            from app.services.pins import bootstrap_approve_current_tools

            await bootstrap_approve_current_tools()
        try:
            await sweep_stale_runs()
        except Exception:
            logger.exception("Failed to sweep stale sandbox runs at startup")
        if settings.scanner_run_on_startup and settings.scanner_enabled:
            try:
                await run_scan_all()
            except Exception:
                logger.exception("Failed to run tool poisoning scanner at startup")

    if engine.dialect.name != "postgresql":
        await _jobs()
        return

    conn = await engine.connect()
    try:
        result = await conn.execute(text("SELECT pg_try_advisory_lock(727001)"))
        got_lock = bool(result.scalar())
        await conn.commit()
    except Exception:
        await conn.close()
        raise
    if not got_lock:
        await conn.close()
        logger.info("startup jobs ran on another instance")
        return
    # Keep this connection out of the pool so the session lock stays held.
    _startup_lock_conn = conn
    logger.info("running startup jobs")
    await _jobs()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Later ``import app....`` lines rebind the name app inside this function.
    application = app
    application.state.ready = False
    application.state.started_at = time.monotonic()
    ensure_notes_dir()

    from app.shared_state import start as start_shared_state
    from app.shared_state import start_relay, stop_relay
    from app.shared_state import stop as stop_shared_state

    await start_shared_state()
    await start_relay()
    warn_explicit_production_modes()

    if isinstance(get_api_key_verifier(), DenyAllVerifier):
        set_api_key_verifier(HmacApiKeyVerifier())

    if isinstance(get_run_recorder(), NullRunRecorder):
        set_run_recorder(DbRunRecorder())

    if isinstance(get_scan_gate(), NullScanGate):
        set_scan_gate(DbScanGate())

    if type(get_recorder()) is LLMCallRecorder:
        set_recorder(DbLLMCallRecorder())

    import app.upstream.filesystem
    import app.upstream.lab
    from app.upstream.registry import register_upstreams

    await register_upstreams()
    install_pinned_tool_list()
    from app.auth.scopes import TOOL_SCOPES
    from app.tools.catalog import list_tool_definitions

    unmapped = [td.name for td in list_tool_definitions() if td.name not in TOOL_SCOPES]
    if unmapped:
        import logging

        logging.getLogger(__name__).warning(
            "Registered MCP tools without explicit scope mapping in TOOL_SCOPES: %s. Calls to these tools will be denied (fail-closed).",
            ", ".join(sorted(unmapped)),
        )

    try:
        await _run_startup_jobs()

        scheduler_task = None
        if settings.enable_retention_scheduler:
            scheduler_task = asyncio.create_task(retention_scheduler_task())

        async with mcp.session_manager.run():
            application.state.ready = True
            try:
                yield
            finally:
                application.state.ready = False

        if scheduler_task:
            scheduler_task.cancel()
            try:
                await scheduler_task
            except asyncio.CancelledError:
                pass

        await stop_relay()
        await stop_shared_state()
    finally:
        await _release_startup_lock()


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
        allow_headers=[
            "Authorization",
            "Content-Type",
            "X-Request-ID",
            "Mcp-Session-Id",
            "Mcp-Protocol-Version",
        ],
        expose_headers=["X-Request-ID", "Retry-After", "Mcp-Session-Id"],
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
app.include_router(analyst_router)
app.include_router(metrics_router)
app.include_router(sandbox_router)
app.include_router(pins_router)
app.include_router(upstreams_router)
app.include_router(scanner_router)
app.include_router(agents_router)
app.include_router(llm_router)
app.include_router(llm_calls_router)
app.include_router(guard_router)
# A2A manager-to-worker delegation
app.include_router(a2a_router)


@app.get("/health")
async def health():
    return {"status": "ok", "app": settings.app_name}


@app.get("/ready")
async def ready():
    """Report this process, the database, and shared state.

    The body stays free of exception text. A Valkey outage leaves the
    status at 200. A database failure is 503.
    """
    instance = settings.instance_id
    if not getattr(app.state, "ready", False):
        return JSONResponse(
            status_code=503,
            content={"status": "not_ready", "instance": instance},
        )
    database = "ok"
    try:
        async with asyncio.timeout(settings.ready_db_timeout_s):
            async with async_session_maker() as session:
                await session.execute(text("SELECT 1"))
    except Exception:  # noqa: BLE001 - the response must not include the error
        database = "unavailable"
    body = {
        "status": "ready" if database == "ok" else "not_ready",
        "instance": instance,
        "database": database,
        "shared_state": shared_state_status(),
    }
    if database == "ok":
        return body
    return JSONResponse(status_code=503, content=body)


# MCP streamable-HTTP transport — Inspector and A2A workers connect here
app.mount(
    "/mcp",
    McpBearerAuthMiddleware(
        McpRateLimitMiddleware(
            McpToolScopeMiddleware(
                McpToolPinMiddleware(McpToolAuditMiddleware(mcp.streamable_http_app()))
            )
        )
    ),
)

# Must be called after every route and mount is registered so the allowlist
# check catches unmapped routes at import time, not at first request.
check_route_scope_coverage(app)
