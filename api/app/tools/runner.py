"""Sandbox entrypoint. Run as ``python -I -m app.tools.runner``.

Reads one JSON object from stdin and writes one JSON line to stdout.
Stderr stays empty: no tracebacks, paths, or note content.
"""

from __future__ import annotations

import json
import os
import signal
import sys
from pathlib import Path

from app.tools.notes import (
    NoteNameError,
    list_notes,
    read_note,
    write_note,
)

STDIN_CAP = 256 * 1024
_INVALID_ARGUMENTS = "Invalid tool arguments."
_NOTE_NOT_FOUND = "Note not found."
_INTERNAL = "Internal tool error."


def _arm_deadline() -> None:
    raw = os.environ.get("MCPG_DEADLINE_S")
    if raw is None or raw == "":
        return
    try:
        seconds = int(raw)
    except ValueError:
        os._exit(2)
    if seconds <= 0:
        os._exit(2)
    signal.signal(signal.SIGALRM, lambda _signum, _frame: os._exit(124))
    signal.alarm(seconds)


def _read_stdin() -> bytes | None:
    data = sys.stdin.buffer.read(STDIN_CAP + 1)
    if len(data) > STDIN_CAP:
        return None
    return data


def _emit(payload: dict[str, object]) -> None:
    sys.stdout.write(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n"
    )
    sys.stdout.flush()


def _emit_error(error_type: str, message: str) -> None:
    _emit({"ok": False, "error": {"type": error_type, "message": message}})


def _invalid_message(exc: NoteNameError) -> str:
    message = str(exc)
    if "\n" in message or "\r" in message or len(message) > 300:
        return _INVALID_ARGUMENTS
    if message.startswith("invalid note name: "):
        return message
    return _INVALID_ARGUMENTS


def _dispatch(tool: str, args: dict[str, object], notes_dir: Path) -> object:
    if tool == "list_notes":
        if args:
            raise ValueError(_INVALID_ARGUMENTS)
        return list_notes(notes_dir)
    if tool == "read_note":
        if set(args) != {"name"}:
            raise ValueError(_INVALID_ARGUMENTS)
        return read_note(notes_dir, args["name"])  # type: ignore[arg-type]
    if tool == "write_note":
        if set(args) != {"name", "content"} or not isinstance(args.get("content"), str):
            raise ValueError(_INVALID_ARGUMENTS)
        return write_note(notes_dir, args["name"], args["content"])  # type: ignore[arg-type]
    raise KeyError(tool)


def main() -> int:
    _arm_deadline()
    raw = _read_stdin()
    if raw is None:
        return 2
    try:
        payload = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        return 2
    if not isinstance(payload, dict):
        return 2
    tool = payload.get("tool")
    args = payload.get("args")
    if not isinstance(tool, str) or not isinstance(args, dict):
        return 2

    notes_dir = Path(os.environ.get("MCPG_NOTES_DIR") or "/notes")
    try:
        result = _dispatch(tool, args, notes_dir)
    except NoteNameError as exc:
        _emit_error("invalid_argument", _invalid_message(exc))
        return 0
    except FileNotFoundError:
        _emit_error("not_found", _NOTE_NOT_FOUND)
        return 0
    except ValueError:
        _emit_error("invalid_argument", _INVALID_ARGUMENTS)
        return 0
    except KeyError:
        _emit_error("internal", _INTERNAL)
        return 0
    except Exception:  # noqa: BLE001
        _emit_error("internal", _INTERNAL)
        return 0

    _emit({"ok": True, "result": result})
    return 0


if __name__ == "__main__":
    sys.exit(main())
