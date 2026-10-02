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


app = FastAPI(title=settings.app_name, lifespan=lifespan, redoc_url=None)

register_error_handlers(app)
apply_http_middleware(app)

# Status endpoints (PR #76 — real MCP handshake health check)
app.include_router(status_router)

# Notes REST endpoints (Day 1 — gateway-backed CRUD)
app.include_router(notes_router)


@app.get("/health")
def health():
    return {"status": "ok", "app": settings.app_name}


# MCP streamable-HTTP transport — Inspector and A2A workers connect here
app.mount("/mcp", mcp.streamable_http_app())
