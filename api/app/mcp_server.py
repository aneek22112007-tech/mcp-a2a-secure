"""MCP Guard — core notes tools.

Exposes three tools over stdio and streamable HTTP:
  - list_notes   : list all saved notes
  - read_note    : read a single note by name
  - write_note   : create or overwrite a note

Run with:
    uv run python -m app.mcp_server
"""

from pathlib import Path

from mcp.server.fastmcp import Context, FastMCP

from app.config import settings
from app.sandbox.executor import run_tool
from app.tools.notes import resolve_note_path

# ---------------------------------------------------------------------------
# Storage directory
# ---------------------------------------------------------------------------

NOTES_DIR = settings.notes_dir


def ensure_notes_dir() -> Path:
    """Create the notes directory when storage is first used.

    Settings construction does not create directories.
    """

    NOTES_DIR.mkdir(parents=True, exist_ok=True)
    return NOTES_DIR


# ---------------------------------------------------------------------------
# Server
# ---------------------------------------------------------------------------

mcp = FastMCP("mcp-guard")
mcp.settings.streamable_http_path = "/"


# ---------------------------------------------------------------------------
# Security helper
# ---------------------------------------------------------------------------


def _safe(name: str) -> Path:
    """Return the resolved Path for *name*, or raise ValueError on traversal.

    The check resolves the candidate path and verifies that the resolved
    path still lives inside NOTES_DIR.  A simple ``"..\" in name`` test is
    **not** used because it can be bypassed with encoded or alternate forms.
    """
    return resolve_note_path(NOTES_DIR, name)


# ---------------------------------------------------------------------------
# Tools  (async so the gateway's asyncio.wait_for can cancel slow calls)
# ---------------------------------------------------------------------------


@mcp.tool()
async def list_notes(ctx: Context | None = None) -> list[str]:
    """List saved notes.

    Returns the note names (without the ``.md`` suffix) sorted
    lexicographically.
    """
    return await run_tool("list_notes", {}, mcp_context=ctx)


@mcp.tool()
async def read_note(name: str, ctx: Context | None = None) -> str:
    """Read one note.

    Args:
        name: The note name (without ``.md``).

    Returns:
        The full text content of the note.

    Raises:
        ValueError: If *name* attempts a path-traversal attack.
        FileNotFoundError: If the note does not exist.
    """
    return await run_tool("read_note", {"name": name}, mcp_context=ctx)


@mcp.tool()
async def write_note(name: str, content: str, ctx: Context | None = None) -> str:
    """Create or overwrite a note.

    Args:
        name: The note name (without ``.md``).
        content: The Markdown content to save.

    Returns:
        A confirmation string of the form ``"saved {name}"``.

    Raises:
        ValueError: If *name* attempts a path-traversal attack.
    """
    return await run_tool(
        "write_note",
        {"name": name, "content": content},
        mcp_context=ctx,
    )


# ---------------------------------------------------------------------------
# Entry-point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    ensure_notes_dir()
    mcp.run()
