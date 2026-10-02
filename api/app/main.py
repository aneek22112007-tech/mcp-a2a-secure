"""MCP Guard — FastAPI application entry point.

Mounts:
  - REST router: status endpoints (from PR #76)
  - REST router: notes endpoints (Day 1)
  - MCP streamable-HTTP transport at /mcp/
"""

import time
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.types import ASGIApp

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
    async with mcp.session_manager.run():
        yield


app = FastAPI(title=settings.app_name, lifespan=lifespan)

register_error_handlers(app)

# add_middleware inserts at the front of the user stack, so the last addition
# runs first on the way in. Starlette still places ServerErrorMiddleware
# outside every user middleware. Security headers wrap that built stack so
# unhandled 500s and CORS preflight responses receive them too.
app.add_middleware(BodySizeLimitMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT"],
    allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
)
app.add_middleware(RequestContextMiddleware)

_build_middleware_stack = app.build_middleware_stack


def _build_stack_with_security_headers() -> ASGIApp:
    return SecurityHeadersMiddleware(_build_middleware_stack())


app.build_middleware_stack = _build_stack_with_security_headers  # type: ignore[method-assign]

# Status endpoints (PR #76 — real MCP handshake health check)
app.include_router(status_router)

# Notes REST endpoints (Day 1 — gateway-backed CRUD)
app.include_router(notes_router)


@app.get("/health")
def health():
    return {"status": "ok", "app": settings.app_name}


# MCP streamable-HTTP transport — Inspector and A2A workers connect here
app.mount("/mcp", mcp.streamable_http_app())
