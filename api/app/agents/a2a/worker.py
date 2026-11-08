"""A2A worker: runs the notes agent with a restricted identity.

The worker uses a *separate, server-configured* API key
(``WORKER_NOTES_API_KEY``).  It is **not** the manager's key, and it is
**never** supplied by the caller.  Every tool call goes through
``/mcp/`` with that worker key; there is no direct fallback.

The worker's effective scopes are those delegated by the manager during
the ``attenuate()`` call.  The gateway enforces scope at the
MCP layer; this module trusts that enforcement and does not duplicate it.

Session design: ``McpGatewaySession`` is opened once per worker run (like
the existing notes agent does for NOTES_AGENT_API_KEY).  The worker passes
it as the ``gateway`` seam so ``run_notes_agent`` uses that session for all
tool calls instead of opening a new session with the manager's key.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

from app.agents.a2a.delegation import DelegationContext
from app.agents.gateway import (
    GatewayBlockedError,
    GatewayProtocolError,
    GatewayTransportError,
    McpGatewaySession,
)
from app.agents.notes_agent import NotesAgentOutcome, run_notes_agent
from app.config import settings

logger = logging.getLogger(__name__)


class WorkerNotConfiguredError(RuntimeError):
    """WORKER_NOTES_API_KEY is unset; the worker cannot call the gateway."""


@dataclass(frozen=True, slots=True)
class WorkerOutcome:
    task_id: str
    status: str  # "completed" | "failed" | "gateway_blocked"
    result: str
    tool_calls: list[dict[str, Any]]
    provider: str | None
    model: str | None
    worker_key_prefix: str | None


async def run_worker(
    task_id: str,
    task_input: str,
    delegation: DelegationContext,
    *,
    request_id: str | None = None,
) -> WorkerOutcome:
    """Execute the notes agent as the worker identity.

    The worker key is read from server config (``WORKER_NOTES_API_KEY``).
    The caller supplies the task text and the already-computed
    ``DelegationContext``; it must not supply raw credentials.

    ``request_id`` is the task_id propagated through so audit rows
    reference the same correlation anchor.
    """
    worker_secret = settings.worker_notes_api_key
    if worker_secret is None or not worker_secret.get_secret_value().strip():
        raise WorkerNotConfiguredError("WORKER_NOTES_API_KEY is not set.")

    raw_key = worker_secret.get_secret_value()
    worker_key_prefix = _extract_prefix(raw_key)

    logger.info(
        "a2a.worker.start task_id=%s worker_prefix=%s delegated_scopes=%s",
        task_id,
        worker_key_prefix or "-",
        ",".join(sorted(delegation.delegated_scopes)) or "(none)",
    )

    # Open one MCP session for this entire worker run using the worker key.
    # We propagate task_id via X-Request-ID so all MCP gateway and audit rows
    # correlate back to the task.
    # run_notes_agent receives the open session as a gateway seam and will
    # never open its own session (which would use the manager's key).
    try:
        async with McpGatewaySession(
            settings.mcp_self_url,
            raw_key,
            headers={"X-Request-ID": task_id},
        ) as session:
            outcome: NotesAgentOutcome = await run_notes_agent(
                task_input,
                request_id=request_id or task_id,
                # Attribution prefix for LLM recording
                key_prefix=worker_key_prefix,
                # Pass the open worker session so notes_agent never falls back
                # to settings.notes_agent_api_key (the manager key).
                gateway=session,
            )
    except (GatewayTransportError, GatewayProtocolError) as exc:
        logger.warning(
            "a2a.worker.gateway_unavailable task_id=%s type=%s",
            task_id,
            type(exc).__name__,
        )
        return WorkerOutcome(
            task_id=task_id,
            status="failed",
            result=f"MCP gateway unavailable: {exc.message}",
            tool_calls=[],
            provider=None,
            model=None,
            worker_key_prefix=worker_key_prefix,
        )
    except GatewayBlockedError as exc:
        logger.warning(
            "a2a.worker.blocked task_id=%s status=%s",
            task_id,
            exc.status_code,
        )
        return WorkerOutcome(
            task_id=task_id,
            status="blocked",
            result=f"Gateway blocked the worker ({exc.status_code}): {exc.message}",
            tool_calls=[],
            provider=None,
            model=None,
            worker_key_prefix=worker_key_prefix,
        )

    # Check if any tool call was denied or blocked (401, 403, 429, pin block, guard block, sandbox failure)
    denied_calls = [
        c
        for c in outcome.tool_calls
        if c.get("status") in {"401", "403", "429", "blocked"}
        or (
            isinstance(c.get("status"), str)
            and c["status"].isdigit()
            and int(c["status"]) >= 400
        )
    ]
    if denied_calls or outcome.result.startswith(
        "Stopped. The MCP Guard gateway returned"
    ):
        first_denied = denied_calls[0] if denied_calls else {}
        tool_name = first_denied.get("name") or "unknown"
        status_code = first_denied.get("status") or "blocked"
        error_msg = first_denied.get("error") or outcome.result
        return WorkerOutcome(
            task_id=task_id,
            status="blocked",
            result=f"Tool call {tool_name} was denied ({status_code}): {error_msg}",
            tool_calls=list(outcome.tool_calls),
            provider=outcome.provider,
            model=outcome.model,
            worker_key_prefix=worker_key_prefix,
        )

    failed_calls = [c for c in outcome.tool_calls if c.get("status") != "ok"]
    if failed_calls:
        first_failed = failed_calls[0]
        tool_name = first_failed.get("name") or "unknown"
        error_msg = first_failed.get("error") or outcome.result
        return WorkerOutcome(
            task_id=task_id,
            status="failed",
            result=f"Tool call {tool_name} failed: {error_msg}",
            tool_calls=list(outcome.tool_calls),
            provider=outcome.provider,
            model=outcome.model,
            worker_key_prefix=worker_key_prefix,
        )

    logger.info(
        "a2a.worker.done task_id=%s tool_calls=%d provider=%s",
        task_id,
        len(outcome.tool_calls),
        outcome.provider or "-",
    )

    return WorkerOutcome(
        task_id=task_id,
        status="completed",
        result=outcome.result,
        tool_calls=list(outcome.tool_calls),
        provider=outcome.provider,
        model=outcome.model,
        worker_key_prefix=worker_key_prefix,
    )


def _extract_prefix(raw_key: str) -> str | None:
    """Return the prefix portion of a mcpg_<prefix>_<secret> key."""
    from app.auth.bearer import API_KEY_TOKEN_PREFIX

    if not raw_key.startswith(API_KEY_TOKEN_PREFIX):
        return None
    without = raw_key[len(API_KEY_TOKEN_PREFIX) :]
    parts = without.split("_", 1)
    if len(parts) != 2:
        return None
    return parts[0]
