"""GET /api/status — real MCP handshake against this server's /mcp/ endpoint."""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Literal

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel

from app.auth import authorize_route
from app.config import settings
from app.mcp_client import connect

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", dependencies=[Depends(authorize_route)])

PROBE_TIMEOUT_SECONDS = 3


class ToolStatus(BaseModel):
    name: str
    description: str | None
    input_schema: dict


class StatusResponse(BaseModel):
    mcp: Literal["online", "offline"]
    latency_ms: int | None
    server_name: str | None
    server_version: str | None
    protocol_version: str | None
    uptime_seconds: int
    tools: list[ToolStatus]
    error: str | None


def _uptime_seconds(request: Request) -> int:
    started = getattr(request.app.state, "started_at", None)
    if started is None:
        return 0
    return max(0, int(time.monotonic() - started))


def _offline(request: Request, exc: BaseException) -> StatusResponse:
    # Log diagnostic details server-side; never expose str(exc) to the client.
    # exc_info is omitted here; the exception object is passed to avoid LOG014.
    logger.warning(
        "[status] MCP probe failed type=%s msg=%.200s",
        type(exc).__name__,
        str(exc),
    )
    return StatusResponse(
        mcp="offline",
        latency_ms=None,
        server_name=None,
        server_version=None,
        protocol_version=None,
        uptime_seconds=_uptime_seconds(request),
        tools=[],
        error="mcp_unavailable",
    )


@router.get("/status", response_model=StatusResponse)
async def api_status(request: Request) -> StatusResponse:
    """Handshake with this process's MCP endpoint and report the result.

    Failures stay on HTTP 200 with mcp="offline" so a down transport is a
    status, not a server error.
    """
    started = time.perf_counter()
    headers = None
    if settings.mcp_self_api_key:
        headers = {
            "Authorization": f"Bearer {settings.mcp_self_api_key.get_secret_value()}"
        }

    try:
        async with asyncio.timeout(PROBE_TIMEOUT_SECONDS):
            async with connect(
                settings.mcp_self_url, timeout=PROBE_TIMEOUT_SECONDS, headers=headers
            ) as session:
                initialized = await session.initialize()
                listed = await session.list_tools()
    # Every transport, timeout, and protocol failure is a status, not a 500.
    except (Exception, BaseExceptionGroup) as exc:  # noqa: BLE001
        return _offline(request, exc)

    latency_ms = max(1, round((time.perf_counter() - started) * 1000))
    info = initialized.serverInfo
    tools = [
        ToolStatus(
            name=tool.name,
            description=tool.description,
            input_schema=tool.inputSchema,
        )
        for tool in listed.tools
    ]
    return StatusResponse(
        mcp="online",
        latency_ms=latency_ms,
        server_name=info.name,
        server_version=str(info.version),
        protocol_version=str(initialized.protocolVersion),
        uptime_seconds=_uptime_seconds(request),
        tools=tools,
        error=None,
    )
