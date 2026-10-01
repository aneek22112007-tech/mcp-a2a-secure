"""MCP Guard — centralized tool invocation gateway.

Every REST route that invokes an MCP tool must call ``call_tool`` here.
Direct access to the underlying tool functions from route handlers is
intentionally avoided so that future cross-cutting concerns can be inserted
in a single place without modifying individual routes.

Day-3 hook:  Add authorization/scope check inside ``call_tool`` before the
             ``_dispatch`` call.  The ``actor`` parameter is reserved for that.
Day-4 hook:  Add audit persistence inside ``call_tool`` after ``_dispatch``
             returns (both allowed and denied attempts should be recorded).
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from typing import Any

logger = logging.getLogger(__name__)

from fastapi import HTTPException

# The single FastMCP instance that owns all registered tools.
from app.mcp_server import mcp

try:
    from mcp.server.fastmcp.exceptions import ToolError
except ImportError:  # SDK layout guard
    ToolError = Exception  # type: ignore[assignment,misc]

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

#: Maximum serialised byte-size of the ``args`` dict (128 KiB).
#: Must be larger than the 100 KiB note content limit so that a max-size
#: note write request is never rejected by the gateway before the route
#: validator has a chance to produce a meaningful 413 response.
MAX_ARG_BYTES: int = 128 * 1024

#: Maximum wall-clock seconds per tool invocation.
TOOL_TIMEOUT_SECONDS: float = 5.0

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
    actor: str | None = None,  # Day-3 hook: pass authenticated identity here
) -> dict[str, Any]:
    """Invoke an MCP tool through the centralized gateway.

    Parameters
    ----------
    name:
        The registered tool name.  Must be present in ``ALLOWED_TOOLS``.
    args:
        Keyword arguments forwarded to the tool.
    actor:
        Reserved for Day-3 authentication.  Pass the authenticated user or
        agent identity so that authorization and audit hooks can use it.

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
    HTTPException 504  – tool did not complete within ``TOOL_TIMEOUT_SECONDS``
    HTTPException 400  – invalid arguments rejected by the tool
    HTTPException 500  – unexpected internal failure (detail is generic;
                         original exception is logged to stderr, not leaked)
    """
    # ------------------------------------------------------------------
    # 1. Tool allowlist check
    # ------------------------------------------------------------------
    if name not in ALLOWED_TOOLS:
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
        raise HTTPException(
            status_code=400,
            detail=f"Arguments cannot be serialised: {exc}",
        ) from exc

    payload_bytes = serialised.encode()
    if len(payload_bytes) > MAX_ARG_BYTES:
        raise HTTPException(
            status_code=413,
            detail=(
                f"Arguments exceed the {MAX_ARG_BYTES // 1024} KiB gateway limit "
                f"({len(payload_bytes)} bytes received)."
            ),
        )

    # ------------------------------------------------------------------
    # Day-3 hook: authorization / scope check
    # ------------------------------------------------------------------
    # Example: await _authorize(actor=actor, tool=name)
    # A denied authorization should raise HTTPException(403).

    # ------------------------------------------------------------------
    # 3. Execute with timeout
    # ------------------------------------------------------------------
    t0 = time.monotonic()
    try:
        result_raw = await asyncio.wait_for(
            _dispatch(name, args),
            timeout=TOOL_TIMEOUT_SECONDS,
        )
    except TimeoutError:
        raise HTTPException(
            status_code=504,
            detail=(
                f"Tool '{name}' did not complete within "
                f"{TOOL_TIMEOUT_SECONDS:.0f} seconds."
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
        if isinstance(cause, OSError) or "Errno" in msg or "Permission denied" in msg or "Is a directory" in msg:
            logger.exception(
                "[gateway] OS error in tool %r: %r", name, cause or exc
            )
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

        logger.exception("[gateway] Unhandled tool error in tool %r: %r", name, exc)
        raise HTTPException(status_code=500, detail="Internal tool error.") from exc

    except (ValueError, TypeError, KeyError) as exc:
        # Tool-level validation errors that escape ToolError wrapping.
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Note not found.") from exc
    except OSError as exc:
        # Filesystem errors outside ToolError (e.g. bare read_text failures).
        logger.exception("[gateway] OS error in tool %r: %r", name, exc)
        raise HTTPException(status_code=500, detail="Internal tool error.") from exc
    except Exception as exc:
        # Unexpected failures: log internally, return a generic 500 so that
        # tracebacks, filesystem paths, and internal details are never leaked.
        logger.exception("[gateway] unhandled error in tool %r: %r", name, exc)
        raise HTTPException(
            status_code=500,
            detail="An internal error occurred.",
        ) from exc

    duration_ms = round((time.monotonic() - t0) * 1000, 2)

    # ------------------------------------------------------------------
    # Day-4 hook: audit logging
    # ------------------------------------------------------------------
    # Example: await _audit(actor=actor, tool=name, args=args,
    #                        result=result_raw, duration_ms=duration_ms)

    # ------------------------------------------------------------------
    # 4. Normalise result to a JSON-serialisable plain type
    # ------------------------------------------------------------------
    result = _normalise(result_raw)

    return {"ok": True, "result": result, "duration_ms": duration_ms}


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
