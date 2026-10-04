"""Redaction helpers. Audit rows store fingerprints and constant reasons only."""

from __future__ import annotations

import hashlib
import json
import re

from app.middleware import request_id_context

_MCPG_RE = re.compile(r"mcpg_\S+")
_BEARER_RE = re.compile(r"(?i)bearer\s+\S+")
_CONTROL_RE = re.compile(r"[\x00-\x1f\x7f]")
_TOOL_NAME_RE = re.compile(r"^[A-Za-z0-9_.-]{1,100}$")


def args_fingerprint(args: object) -> str | None:
    """Correlation fingerprint, not encryption; values are never stored.

    The canonical JSON matches the gateway size check: sorted keys, no extra
    whitespace, and non-ASCII characters left unescaped. Returns None when
    ``args`` cannot be serialised.
    """

    try:
        canonical = json.dumps(
            args, sort_keys=True, separators=(",", ":"), ensure_ascii=False
        )
    except (TypeError, ValueError):
        return None
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def safe_reason(text: str | None, max_len: int = 300) -> str | None:
    """Return a bounded reason with key material and control characters removed."""

    if text is None:
        return None
    if not isinstance(text, str):
        return None
    cleaned = _MCPG_RE.sub("mcpg_[redacted]", text)
    cleaned = _BEARER_RE.sub("Bearer [redacted]", cleaned)
    cleaned = _CONTROL_RE.sub("", cleaned)
    cleaned = cleaned[:max_len]
    if not cleaned:
        return None
    return cleaned


def safe_tool_name(name: object) -> str | None:
    """Keep a short tool-name token, or the constant ``invalid``."""

    if name is None:
        return None
    if isinstance(name, str) and _TOOL_NAME_RE.fullmatch(name):
        return name
    return "invalid"


def current_request_id(scope: dict | None = None) -> str | None:
    """Return the request id from the middleware context, then the ASGI scope."""

    current = request_id_context.get()
    if current:
        return current
    if scope is None:
        return None
    stored = scope.get("mcp_guard.request_id")
    if isinstance(stored, str) and stored:
        return stored
    return None
