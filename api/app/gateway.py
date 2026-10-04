"""MCP Guard — centralized tool invocation gateway.

Every REST route that invokes an MCP tool must call ``call_tool`` here.
Direct access to the underlying tool functions from route handlers is
intentionally avoided so that cross-cutting concerns stay in one place.

Authentication runs at the route layer and on ``/mcp``. ``actor`` is the
authenticated principal and is copied onto the audit row.

``call_tool`` writes exactly one ``tool.call`` audit row. The success path
is fail-closed: the tool result is returned only after that row is stored.
Allowlist rejections, argument rejections, and tool errors are recorded
best-effort, then the original HTTP error is re-raised.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
import time
from typing import TYPE_CHECKING, Any

from fastapi import HTTPException

from app.audit.events import (
    ACTION_TOOL_CALL,
    STATUS_DENIED,
    STATUS_ERROR,
    STATUS_OK,
    AuditRecord,
)
from app.audit.redaction import args_fingerprint, current_request_id, safe_tool_name
from app.audit.sink import AuditUnavailableError, record_event
from app.config import settings
from app.errors import _ERROR_CODES
from app.models.audit_events import AUDIT_DECISION_ALLOWED, AUDIT_DECISION_DENIED

if TYPE_CHECKING:
    from app.auth import Principal

# The single FastMCP instance that owns all registered tools.
from app.mcp_server import mcp

try:
    from mcp.server.fastmcp.exceptions import ToolError
except ImportError:  # SDK layout guard
    ToolError = Exception  # type: ignore[assignment,misc]

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

#: Maximum serialised byte-size of the ``args`` dict (128 KiB).
#: Must be larger than the 100 KiB note content limit so that a max-size
#: note write request is never rejected by the gateway before the route
#: validator has a chance to produce a meaningful 413 response.
MAX_ARG_BYTES: int = 128 * 1024

# ---------------------------------------------------------------------------
# Registered tool allowlist
# ---------------------------------------------------------------------------
# Only tools present in this set may be invoked through the gateway.
# Adding a new tool to mcp_server.py does NOT automatically make it callable
# here; it must also be added to this allowlist.  This is intentional: it
# forces an explicit security review before every new tool is exposed.

ALLOWED_TOOLS: frozenset[str] = frozenset(
    {
        "list_notes",
        "read_note",
        "write_note",
    }
)


# ---------------------------------------------------------------------------
# Internal dispatch
# ---------------------------------------------------------------------------


async def _dispatch(name: str, args: dict[str, Any]) -> Any:
    """Invoke ``name`` through the FastMCP server's call_tool interface.

    ``mcp.call_tool`` is a coroutine in MCP SDK ≥ 1.x.  We await it and
    return its raw result; the caller is responsible for interpretation.
    """
    result = await mcp.call_tool(name, args)
    return result


# ---------------------------------------------------------------------------
# Public gateway entry point
# ---------------------------------------------------------------------------


async def call_tool(
    name: str,
    args: dict[str, Any],
    *,
    actor: Principal | None = None,
) -> dict[str, Any]:
    """Invoke an MCP tool through the centralized gateway.

    Parameters
    ----------
    name:
        The registered tool name.  Must be present in ``ALLOWED_TOOLS``.
    args:
        Keyword arguments forwarded to the tool.
    actor:
        Authenticated principal. Authorization is enforced at the route
        layer; this value is copied onto the audit row.

    Returns
    -------
    dict with keys:
        ``ok``          – always True on success
        ``result``      – the tool's return value (serialised to a plain type)
        ``duration_ms`` – wall-clock execution time measured via monotonic clock

    Raises
    ------
    HTTPException 404  – unknown or unregistered tool
    HTTPException 413  – serialised argument size exceeds ``MAX_ARG_BYTES``
    HTTPException 504  – tool did not complete within ``settings.tool_timeout_s``
    HTTPException 400  – invalid arguments rejected by the tool
    HTTPException 500  – unexpected internal failure (detail is generic;
                         original exception is logged to stderr, not leaked)
    HTTPException 503  – the success audit row could not be stored
    """
    started = time.monotonic()
    audit_base = {
        "action": ACTION_TOOL_CALL,
        "tool_name": safe_tool_name(name),
        "args_hash": args_fingerprint(args),
        "request_id": current_request_id(),
        **AuditRecord.actor_fields(actor),
    }
    denial_reason: str | None = None
    result_raw: Any = None
    duration_ms = 0.0

    try:
        # ------------------------------------------------------------------
        # 1. Tool allowlist check
        # ------------------------------------------------------------------
        if name not in ALLOWED_TOOLS:
            denial_reason = "tool_not_allowed"
            raise HTTPException(
                status_code=404,
                detail=f"Tool '{name}' is not registered in the gateway.",
            )

        # ------------------------------------------------------------------
        # 2. Argument size guard
        #    Use deterministic JSON serialisation (sorted keys, no trailing
        #    whitespace) so the byte count is stable and reproducible.
        # ------------------------------------------------------------------
        try:
            # ensure_ascii=False: non-ASCII chars must not be escape-expanded
            # before byte-counting, or a 24 KiB Cyrillic note would be counted
            # as ~72 KiB of \uXXXX sequences and rejected incorrectly.
            serialised = json.dumps(
                args, sort_keys=True, separators=(",", ":"), ensure_ascii=False
            )
        except (TypeError, ValueError) as exc:
            denial_reason = "args_unserialisable"
            raise HTTPException(
                status_code=400,
                detail=f"Arguments cannot be serialised: {exc}",
            ) from exc

        payload_bytes = serialised.encode()
        if len(payload_bytes) > MAX_ARG_BYTES:
            denial_reason = "args_too_large"
            raise HTTPException(
                status_code=413,
                detail=(
                    f"Arguments exceed the {MAX_ARG_BYTES // 1024} KiB gateway limit "
                    f"({len(payload_bytes)} bytes received)."
                ),
            )

        denial_reason = None

        # ------------------------------------------------------------------
        # 3. Execute with timeout
        # ------------------------------------------------------------------
        # Read on each call so tests can monkeypatch settings.tool_timeout_s.
        timeout_s = settings.tool_timeout_s
        t0 = time.monotonic()
        try:
            result_raw = await asyncio.wait_for(
                _dispatch(name, args),
                timeout=timeout_s,
            )
        except TimeoutError:
            raise HTTPException(
                status_code=504,
                detail=(
                    f"Tool '{name}' did not complete within {timeout_s:g} seconds."
                ),
            )
        except ToolError as exc:
            # The MCP SDK wraps tool-raised exceptions in ToolError.
            # Inspect the original cause to map to the right HTTP status.
            cause = exc.__cause__
            msg = str(exc)

            if isinstance(cause, FileNotFoundError) or "No such file" in msg:
                raise HTTPException(status_code=404, detail="Note not found.") from exc

            # OS-level errors (PermissionError, IsADirectoryError, etc.) must
            # never leak filesystem paths to the client.  Log the details and
            # return a generic 500.
            if (
                isinstance(cause, OSError)
                or "Errno" in msg
                or "Permission denied" in msg
                or "Is a directory" in msg
            ):
                logger.exception("[gateway] OS error in tool %r", name)
                raise HTTPException(
                    status_code=500, detail="Internal tool error."
                ) from exc

            if isinstance(cause, ValueError):
                raise HTTPException(status_code=400, detail=str(cause)) from exc

            # Other ToolError that looks like validation.
            if "invalid note name" in msg:
                match = re.search(r"invalid note name: [^\n\r]+", msg)
                detail = match.group(0) if match else "invalid note name"
                raise HTTPException(status_code=400, detail=detail) from exc

            logger.exception("[gateway] Unhandled tool error in tool %r", name)
            raise HTTPException(status_code=500, detail="Internal tool error.") from exc

        except (ValueError, TypeError, KeyError) as exc:
            # Tool-level validation errors that escape ToolError wrapping.
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail="Note not found.") from exc
        except OSError as exc:
            # Filesystem errors outside ToolError (e.g. bare read_text failures).
            logger.exception("[gateway] OS error in tool %r", name)
            raise HTTPException(status_code=500, detail="Internal tool error.") from exc
        except Exception as exc:
            # Unexpected failures: log internally, return a generic 500 so that
            # tracebacks, filesystem paths, and internal details are never leaked.
            logger.exception("[gateway] unhandled error in tool %r", name)
            raise HTTPException(
                status_code=500,
                detail="An internal error occurred.",
            ) from exc

        duration_ms = round((time.monotonic() - t0) * 1000, 2)
        result_raw = _normalise(result_raw)
    except HTTPException as exc:
        await _write_tool_audit(
            audit_base,
            decision=(
                AUDIT_DECISION_DENIED
                if denial_reason is not None
                else AUDIT_DECISION_ALLOWED
            ),
            status=STATUS_DENIED if denial_reason is not None else STATUS_ERROR,
            started=started,
            required=False,
            reason=denial_reason,
            status_code=exc.status_code,
            error_code=_ERROR_CODES.get(exc.status_code, "HTTP_ERROR"),
        )
        raise

    await _write_tool_audit(
        audit_base,
        decision=AUDIT_DECISION_ALLOWED,
        status=STATUS_OK,
        started=started,
        required=True,
        status_code=200,
    )
    return {"ok": True, "result": result_raw, "duration_ms": duration_ms}


async def _write_tool_audit(
    audit_base: dict[str, Any],
    *,
    decision: str,
    status: str,
    started: float,
    required: bool,
    reason: str | None = None,
    status_code: int | None = None,
    error_code: str | None = None,
) -> None:
    """Write the single tool.call row for this invocation."""

    duration_ms = round((time.monotonic() - started) * 1000, 2)
    record = AuditRecord(
        decision=decision,
        status=status,
        reason=reason,
        status_code=status_code,
        error_code=error_code,
        duration_ms=duration_ms if duration_ms >= 0 else 0.0,
        **audit_base,
    )
    if not required:
        await record_event(record, required=False)
        return
    try:
        await record_event(record, required=True)
    except AuditUnavailableError:
        raise HTTPException(status_code=503, detail="Audit log unavailable.") from None


# ---------------------------------------------------------------------------
# Result normalisation
# ---------------------------------------------------------------------------


def _normalise(raw: Any) -> Any:
    """Convert the MCP SDK result into a JSON-serialisable plain value.

    ``mcp.call_tool`` (SDK ≥ 1.x) returns a **tuple**:
        ``(list[ContentBlock], dict)``
    where ``dict`` has the shape ``{"result": <tool_return_value>}``.

    We extract ``dict["result"]`` as the authoritative structured value and
    use the ContentBlock list only as a fallback for plain-text responses.
    """
    # Primary path: SDK returns (content_list, structured_dict)
    if isinstance(raw, tuple) and len(raw) == 2:
        _, structured = raw
        if isinstance(structured, dict) and "result" in structured:
            return structured["result"]

    # Fallback — plain dict (some SDK versions)
    if isinstance(raw, dict):
        return raw.get("result", raw)

    if isinstance(raw, str):
        return raw

    # ContentBlock list without a structured dict
    if isinstance(raw, list):
        parts = []
        for block in raw:
            if hasattr(block, "text"):
                parts.append(block.text)
            elif isinstance(block, str):
                parts.append(block)
            elif isinstance(block, dict) and "text" in block:
                parts.append(block["text"])
        if parts:
            return "\n".join(parts) if len(parts) > 1 else parts[0]

    return raw
