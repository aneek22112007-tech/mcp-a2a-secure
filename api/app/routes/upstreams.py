"""Registered MCP upstreams."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel

import app.upstream.filesystem
import app.upstream.lab  # noqa: F401
from app.auth.dependencies import authorize_route
from app.upstream.registry import all_specs, upstream_status

router = APIRouter(
    prefix="/api/upstreams",
    tags=["upstreams"],
    dependencies=[Depends(authorize_route)],
)


class UpstreamOut(BaseModel):
    id: str
    enabled: bool
    image: str
    available: bool
    tool_count: int
    tools: list[str]
    detail: str


@router.get("", response_model=list[UpstreamOut])
def list_upstreams() -> list[dict[str, Any]]:
    """Upstreams registered on this gateway."""
    return [upstream_status(spec) for spec in all_specs()]
