"""MCP Guard — Notes REST routes.

Every tool invocation passes through ``app.gateway.call_tool``.  Route
handlers never access the filesystem directly; they only interpret the
gateway's structured response.

Endpoints
---------
GET  /api/notes           – list all note names (sorted)
GET  /api/notes/{name}    – read a single note
PUT  /api/notes/{name}    – create or overwrite a note  body: {"content": "..."}
GET  /api/mcp/info        – MCP Guard server metadata
"""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel, field_validator

from app.gateway import call_tool

# Also keep a thin import of api_mcp_info helpers for the /api/mcp/info endpoint
from app.mcp_server import mcp

router = APIRouter(prefix="/api")

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

#: Maximum note body size in bytes (100 KiB).
MAX_CONTENT_BYTES: int = 100 * 1024


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class NoteBody(BaseModel):
    content: str

    @field_validator("content")
    @classmethod
    def content_not_too_large(cls, v: str) -> str:
        if len(v.encode()) > MAX_CONTENT_BYTES:
            raise ValueError(
                f"Note content exceeds the {MAX_CONTENT_BYTES // 1024} KiB limit."
            )
        return v


class NoteItem(BaseModel):
    name: str


class NoteDetail(BaseModel):
    name: str
    content: str


class McpInfo(BaseModel):
    server_name: str
    transport: str
    mcp_endpoint: str
    tools: list[str]


# ---------------------------------------------------------------------------
# Notes endpoints
# ---------------------------------------------------------------------------


@router.get("/notes", response_model=list[str], summary="List all notes")
async def api_list_notes() -> list[str]:
    """Return sorted list of note names (without .md extension).

    All I/O is routed through the MCP Guard gateway.
    """
    payload = await call_tool("list_notes", {})
    result = payload["result"]
    # The tool returns a list; normalise in case the SDK wraps it.
    if isinstance(result, list):
        return result
    # Fallback: split a concatenated string (should not normally occur)
    if isinstance(result, str) and result.strip():
        return [n.strip() for n in result.split("\n") if n.strip()]
    return []


@router.get("/notes/{name}", response_model=NoteDetail, summary="Read a note")
async def api_read_note(name: str) -> NoteDetail:
    """Read the content of a single note by name.

    Returns 400 if *name* contains invalid characters or traversal sequences.
    Returns 404 if the note does not exist.
    All I/O is routed through the MCP Guard gateway.
    """
    payload = await call_tool("read_note", {"name": name})
    content = payload["result"]
    if not isinstance(content, str):
        content = str(content)
    return NoteDetail(name=name, content=content)


@router.put(
    "/notes/{name}", response_model=NoteDetail, summary="Create or update a note"
)
async def api_write_note(name: str, body: NoteBody) -> NoteDetail:
    """Create or overwrite a note with the supplied Markdown content.

    Body: ``{"content": "..."}``  (max 100 KiB).
    Returns 400 if *name* is invalid or *content* exceeds the size limit.
    All I/O is routed through the MCP Guard gateway.
    """
    await call_tool("write_note", {"name": name, "content": body.content})
    return NoteDetail(name=name, content=body.content)


# ---------------------------------------------------------------------------
# MCP info endpoint — live MCP Guard server metadata
# ---------------------------------------------------------------------------


@router.get("/mcp/info", response_model=McpInfo, summary="MCP Guard server metadata")
def api_mcp_info() -> McpInfo:
    """Return metadata about the running MCP Guard server and its registered tools.

    This endpoint is consumed by the frontend dashboard status badge.
    It does NOT pass through the gateway (it reads server metadata, not tool output).
    """
    try:
        tool_names = [t.name for t in mcp._tool_manager.list_tools()]
    except AttributeError:
        tool_names = ["list_notes", "read_note", "write_note"]

    return McpInfo(
        server_name=mcp.name,
        transport="streamable-http",
        mcp_endpoint="/mcp/",
        tools=tool_names,
    )
