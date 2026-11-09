"""Tests for the 100 KiB note content limit (P8 B4).

Verifies that:
1. Exactly 100 KiB (102,400 bytes) content is accepted.
2. Content > 100 KiB is rejected.
3. The exact ValueError message 'note content exceeds 100 KiB' is raised.
4. Multibyte UTF-8 characters are counted by byte length, not character count.
5. REST route reuses MAX_NOTE_BYTES from app.tools.notes.
6. REST endpoint returns HTTP 413 for oversized content.
7. MCP tool / in-process execution rejects oversized content.
8. Docker runner entrypoint maps ValueError to 'invalid_argument'.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.routes.notes import MAX_CONTENT_BYTES
from app.tools.notes import MAX_NOTE_BYTES, write_note
from app.tools.runner import main as runner_main

pytestmark = pytest.mark.anyio


def test_write_note_exactly_max_bytes_accepted(tmp_path: Path) -> None:
    """1. Content exactly 100 * 1024 bytes is accepted."""
    content = "a" * MAX_NOTE_BYTES
    res = write_note(tmp_path, "exact_100k", content)
    assert res == "saved exact_100k"
    assert (tmp_path / "exact_100k.md").read_text() == content


def test_write_note_oversized_rejected(tmp_path: Path) -> None:
    """2 & 3. Content larger than 100 * 1024 bytes is rejected with exact ValueError."""
    content = "a" * (MAX_NOTE_BYTES + 1)
    with pytest.raises(ValueError, match=r"^note content exceeds 100 KiB$") as exc_info:
        write_note(tmp_path, "too_large", content)
    assert str(exc_info.value) == "note content exceeds 100 KiB"
    assert not (tmp_path / "too_large.md").exists()


def test_write_note_multibyte_utf8_counted_by_bytes(tmp_path: Path) -> None:
    """4. UTF-8 multibyte characters are counted by encoded byte length, not character count."""
    # '€' is 3 bytes in UTF-8
    # 34,133 * 3 = 102,399 bytes + 1 ASCII byte = 102,400 bytes (exactly 100 KiB)
    content_exact = "€" * 34133 + "x"
    assert len(content_exact) == 34134  # character count is well below 100,000
    assert len(content_exact.encode("utf-8")) == MAX_NOTE_BYTES

    res = write_note(tmp_path, "multibyte_ok", content_exact)
    assert res == "saved multibyte_ok"

    # 34,134 * 3 = 102,402 bytes (> 100 KiB = 102,400 bytes)
    content_oversized = "€" * 34134
    assert len(content_oversized) == 34134  # character count is only 34,134
    assert len(content_oversized.encode("utf-8")) == MAX_NOTE_BYTES + 2

    with pytest.raises(ValueError, match=r"^note content exceeds 100 KiB$"):
        write_note(tmp_path, "multibyte_toolarge", content_oversized)
    assert not (tmp_path / "multibyte_toolarge.md").exists()


def test_rest_reuses_max_note_bytes() -> None:
    """5. REST route uses the shared MAX_NOTE_BYTES value."""
    assert MAX_CONTENT_BYTES is MAX_NOTE_BYTES
    assert MAX_NOTE_BYTES == 100 * 1024


async def test_rest_oversized_returns_413() -> None:
    """6. REST oversized content continues to return HTTP 413."""
    transport = ASGITransport(app=app)
    headers = {"Authorization": "Bearer mcpg_admin"}
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Exactly 100 KiB is allowed by REST route
        ok_content = "a" * MAX_NOTE_BYTES
        resp_ok = await client.put(
            "/api/notes/rest_max", json={"content": ok_content}, headers=headers
        )
        assert resp_ok.status_code == 200

        # 100 KiB + 1 byte is rejected with HTTP 413
        oversized = "a" * (MAX_NOTE_BYTES + 1)
        resp = await client.put(
            "/api/notes/rest_oversized",
            json={"content": oversized},
            headers=headers,
        )
        assert resp.status_code == 413
        body = resp.json()
        detail = body.get("error", {}).get("message") or body.get("detail", "")
        assert "100 KiB" in detail or "limit" in detail


async def test_mcp_inprocess_rejects_oversized(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """7. MCP tool execution rejects oversized content."""
    import app.mcp_server as mcp_module
    from app.mcp_server import write_note as mcp_write_note

    tmp_notes = tmp_path / "notes"
    tmp_notes.mkdir()
    monkeypatch.setattr(mcp_module, "NOTES_DIR", tmp_notes)

    # Valid size succeeds
    res = await mcp_write_note(name="mcp_ok", content="a" * MAX_NOTE_BYTES)
    assert res == "saved mcp_ok"

    # Oversized content raises ValueError
    with pytest.raises(ValueError, match=r"^note content exceeds 100 KiB$"):
        await mcp_write_note(name="mcp_toolarge", content="a" * (MAX_NOTE_BYTES + 1))
    assert not (tmp_notes / "mcp_toolarge.md").exists()


def test_docker_runner_maps_value_error_to_invalid_argument(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """8. Docker runner maps the resulting ValueError to invalid_argument."""
    monkeypatch.setenv("MCPG_NOTES_DIR", str(tmp_path))

    oversized_payload = {
        "tool": "write_note",
        "args": {
            "name": "runner_test",
            "content": "a" * (MAX_NOTE_BYTES + 1),
        },
    }
    input_bytes = json.dumps(oversized_payload).encode("utf-8")
    emitted: list[dict[str, Any]] = []

    monkeypatch.setattr("app.tools.runner._read_stdin", lambda: input_bytes)
    monkeypatch.setattr("app.tools.runner._emit", emitted.append)

    exit_code = runner_main()
    assert exit_code == 0
    assert len(emitted) == 1
    output = emitted[0]
    assert output["ok"] is False
    assert output["error"]["type"] == "invalid_argument"
    assert output["error"]["message"] == "Invalid tool arguments."
    assert not (tmp_path / "runner_test.md").exists()
