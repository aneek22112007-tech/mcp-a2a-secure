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

from app.config import settings
from app.errors import register_error_handlers
from app.mcp_server import mcp
from app.middleware import RequestContextMiddleware
from app.routes.notes import router as notes_router
from app.routes.status import router as status_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.started_at = time.monotonic()
    async with mcp.session_manager.run():
        yield


app = FastAPI(title=settings.app_name, lifespan=lifespan)

# Register error handlers
register_error_handlers(app)

# Note: Middlewares are executed in reverse order of addition.
# So RequestContextMiddleware goes first (runs last/outermost wrapper)
# or last? Wait, `app.add_middleware` adds to the top of the stack.
# We want CORSMiddleware to execute first (outermost), and RequestContextMiddleware to execute next.
# So we add RequestContextMiddleware FIRST, then CORSMiddleware.
app.add_middleware(RequestContextMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["GET", "POST", "PUT"],
    allow_headers=["*"],
)

# Status endpoints (PR #76 — real MCP handshake health check)
app.include_router(status_router)

# Notes REST endpoints (Day 1 — gateway-backed CRUD)
app.include_router(notes_router)


@app.get("/health")
def health():
    return {"status": "ok", "app": settings.app_name}


# MCP streamable-HTTP transport — Inspector and A2A workers connect here
app.mount("/mcp", mcp.streamable_http_app())
