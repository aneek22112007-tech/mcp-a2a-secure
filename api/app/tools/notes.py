"""Notes on disk. Standard library only, so the sandbox image can run it."""

from __future__ import annotations

import re
from pathlib import Path


class NoteNameError(ValueError):
    """A note name failed the allowlist or the resolved-path check."""


def validate_note_name(name: str) -> None:
    """Reject anything that is not ``[A-Za-z0-9_-]{1,64}``."""

    if isinstance(name, str) and re.fullmatch(r"[A-Za-z0-9_-]{1,64}", name):
        return
    raise NoteNameError(f"invalid note name: {name!r}")


def resolve_note_path(notes_dir: Path, name: str) -> Path:
    """Return ``notes_dir/name.md`` or raise ``NoteNameError``.

    The candidate is resolved and must stay inside the resolved notes
    directory. A substring check for ``..`` is not used.
    """

    validate_note_name(name)
    root = Path(notes_dir).resolve()
    candidate = (root / f"{name}.md").resolve()
    if root not in candidate.parents:
        raise NoteNameError(f"invalid note name: {name!r}")
    return candidate


def list_notes(notes_dir: Path) -> list[str]:
    """Sorted note stems. A missing directory is an empty list."""

    root = Path(notes_dir)
    return sorted(path.stem for path in root.glob("*.md") if path.is_file())


def read_note(notes_dir: Path, name: str) -> str:
    """Return the note text. Missing notes raise ``FileNotFoundError``."""

    path = resolve_note_path(notes_dir, name)
    try:
        return path.read_text()
    except FileNotFoundError:
        raise FileNotFoundError("Note not found.") from None


def write_note(notes_dir: Path, name: str, content: str) -> str:
    """Create or overwrite a note and return ``saved {name}``."""

    path = resolve_note_path(notes_dir, name)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content)
    return f"saved {name}"
