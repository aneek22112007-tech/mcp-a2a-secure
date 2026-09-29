"""Tests for the MCP Polaris notes tools.

All tests operate on a temporary, isolated notes directory so that they do
not create permanent files in the repository.  The module-level ``NOTES_DIR``
is monkey-patched via the ``isolated_notes`` fixture before any tool function
is called.

``@mcp.tool()`` registers the function with the server but leaves it as a
plain Python callable, so tools are exercised by calling them directly.
"""

import pytest


# ---------------------------------------------------------------------------
# Fixture – isolate the notes directory
# ---------------------------------------------------------------------------


@pytest.fixture()
def isolated_notes(tmp_path, monkeypatch):
    """Redirect NOTES_DIR to a temporary directory for the duration of a test.

    ``_safe()`` reads ``NOTES_DIR`` from the module at call time, so
    patching the attribute is sufficient to redirect all filesystem access.
    """
    import app.mcp_server as mcp_module

    tmp_notes = tmp_path / "notes"
    tmp_notes.mkdir()

    monkeypatch.setattr(mcp_module, "NOTES_DIR", tmp_notes)
    return tmp_notes


# ---------------------------------------------------------------------------
# Test 1 – write_note then read_note
# ---------------------------------------------------------------------------


def test_write_then_read(isolated_notes):
    """write_note creates a file; read_note returns its content."""
    from app.mcp_server import write_note, read_note

    result = write_note(name="hello", content="# Hello\nworld")
    assert result == "saved hello"

    content = read_note(name="hello")
    assert content == "# Hello\nworld"


# ---------------------------------------------------------------------------
# Test 2 – list_notes returns sorted names
# ---------------------------------------------------------------------------


def test_list_notes_sorted(isolated_notes):
    """list_notes returns names without .md extension, in lexicographic order."""
    from app.mcp_server import write_note, list_notes

    for note_name in ("zebra", "apple", "mango"):
        write_note(name=note_name, content=f"# {note_name}")

    names = list_notes()
    assert names == ["apple", "mango", "zebra"]


# ---------------------------------------------------------------------------
# Test 3 – read_note("../x") raises ValueError
# ---------------------------------------------------------------------------


def test_read_note_traversal_single_dot_dot(isolated_notes):
    """../x must be rejected before any filesystem access."""
    from app.mcp_server import read_note

    with pytest.raises(ValueError, match="invalid note name"):
        read_note(name="../x")


# ---------------------------------------------------------------------------
# Test 4 – ../../etc/passwd is rejected
# ---------------------------------------------------------------------------


def test_read_note_traversal_deep(isolated_notes):
    """../../etc/passwd traversal must be rejected."""
    from app.mcp_server import read_note

    with pytest.raises(ValueError, match="invalid note name"):
        read_note(name="../../etc/passwd")


# ---------------------------------------------------------------------------
# Test 5 – write_note overwrites existing note
# ---------------------------------------------------------------------------


def test_write_note_overwrite(isolated_notes):
    """A second write_note call replaces the original content."""
    from app.mcp_server import write_note, read_note

    write_note(name="draft", content="first version")
    write_note(name="draft", content="second version")

    content = read_note(name="draft")
    assert content == "second version"
