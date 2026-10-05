"""Per-tool mount policy. Unknown tools are refused by the executor."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class ToolPolicy:
    """``notes_mount`` is ``ro`` or ``rw``."""

    notes_mount: str


TOOL_POLICIES: dict[str, ToolPolicy] = {
    "list_notes": ToolPolicy(notes_mount="ro"),
    "read_note": ToolPolicy(notes_mount="ro"),
    "write_note": ToolPolicy(notes_mount="rw"),
}
