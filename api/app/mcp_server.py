"""MCP Guard — core notes tools.

Exposes three tools over stdio and streamable HTTP:
  - list_notes   : list all saved notes
  - read_note    : read a single note by name
  - write_note   : create or overwrite a note

Run with:
    uv run python -m app.mcp_server
"""

import re
from pathlib import Path

import anyio
from mcp.server.fastmcp import FastMCP

from app.config import settings

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
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,64}", name):
        raise ValueError(f"invalid note name: {name!r}")

    candidate = (NOTES_DIR / f"{name}.md").resolve()
    if NOTES_DIR.resolve() not in candidate.parents:
        raise ValueError(f"invalid note name: {name!r}")
    return candidate


# ---------------------------------------------------------------------------
# Tools  (async so the gateway's asyncio.wait_for can cancel slow calls)
# ---------------------------------------------------------------------------


@mcp.tool()
async def list_notes() -> list[str]:
    """List saved notes.

    Returns the note names (without the ``.md`` suffix) sorted
    lexicographically.
    """

    def _read() -> list[str]:
        return sorted(p.stem for p in NOTES_DIR.glob("*.md") if p.is_file())

    return await anyio.to_thread.run_sync(_read)


@mcp.tool()
async def read_note(name: str) -> str:
    """Read one note.

    Args:
        name: The note name (without ``.md``).

    Returns:
        The full text content of the note.

    Raises:
        ValueError: If *name* attempts a path-traversal attack.
        FileNotFoundError: If the note does not exist.
    """
    path = _safe(name)  # raises ValueError synchronously — fine before I/O
    return await anyio.to_thread.run_sync(path.read_text)


@mcp.tool()
async def write_note(name: str, content: str) -> str:
    """Create or overwrite a note.

    Args:
        name: The note name (without ``.md``).
        content: The Markdown content to save.

    Returns:
        A confirmation string of the form ``"saved {name}"``.

    Raises:
        ValueError: If *name* attempts a path-traversal attack.
    """
    path = _safe(name)  # raises ValueError synchronously — fine before I/O
    ensure_notes_dir()

    def _write() -> None:
        path.write_text(content)

    await anyio.to_thread.run_sync(_write)
    return f"saved {name}"


# ---------------------------------------------------------------------------
# Entry-point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    ensure_notes_dir()
    mcp.run()
