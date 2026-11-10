"""Registered MCP upstreams."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.auth.dependencies import authorize_route
from app.upstream.filesystem import filesystem_status

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
def list_upstreams() -> list[dict[str, object]]:
    """Upstreams this process registered. One entry today: the filesystem server."""

    return [filesystem_status()]
