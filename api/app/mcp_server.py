"""MCP server – Polaris notes tools.

Exposes three tools over stdio:
  - list_notes   : list all saved notes
  - read_note    : read a single note by name
  - write_note   : create or overwrite a note

Run with:
    uv run python -m app.mcp_server
"""

from pathlib import Path

from mcp.server.fastmcp import FastMCP

# ---------------------------------------------------------------------------
# Storage directory
# ---------------------------------------------------------------------------

NOTES_DIR = Path(__file__).parent.parent / "data" / "notes"
NOTES_DIR.mkdir(parents=True, exist_ok=True)

# ---------------------------------------------------------------------------
# Server
# ---------------------------------------------------------------------------

mcp = FastMCP("polaris")


# ---------------------------------------------------------------------------
# Security helper
# ---------------------------------------------------------------------------


def _safe(name: str) -> Path:
    """Return the resolved Path for *name*, or raise ValueError on traversal.

    The check resolves the candidate path and verifies that the resolved
    path still lives inside NOTES_DIR.  A simple ``".." in name`` test is
    **not** used because it can be bypassed with encoded or alternate forms.
    """
    candidate = (NOTES_DIR / f"{name}.md").resolve()
    if NOTES_DIR.resolve() not in candidate.parents:
        raise ValueError(f"invalid note name: {name!r}")
    return candidate


# ---------------------------------------------------------------------------
# Tools
# ---------------------------------------------------------------------------


@mcp.tool()
def list_notes() -> list[str]:
    """List saved notes.

    Returns the note names (without the ``.md`` suffix) sorted
    lexicographically.
    """
    return sorted(p.stem for p in NOTES_DIR.glob("*.md"))


@mcp.tool()
def read_note(name: str) -> str:
    """Read one note.

    Args:
        name: The note name (without ``.md``).

    Returns:
        The full text content of the note.

    Raises:
        ValueError: If *name* attempts a path-traversal attack.
        FileNotFoundError: If the note does not exist.
    """
    return _safe(name).read_text()


@mcp.tool()
def write_note(name: str, content: str) -> str:
    """Create or overwrite a note.

    Args:
        name: The note name (without ``.md``).
        content: The Markdown content to save.

    Returns:
        A confirmation string of the form ``"saved {name}"``.

    Raises:
        ValueError: If *name* attempts a path-traversal attack.
    """
    _safe(name).write_text(content)
    return f"saved {name}"


# ---------------------------------------------------------------------------
# Entry-point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    mcp.run()
