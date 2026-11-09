"""A2A manager: delegates a notes task to the worker using LangGraph.

The manager:
1. Loads the server-configured worker key to resolve its scopes.
2. Runs scope attenuation (intersection of manager ∩ worker ∩ notes-tool scopes).
3. Persists the task lifecycle (pending → running → completed/failed/blocked/cancelled).
4. Records delegation, worker.start, and completion/failure audit events linked by task_id.
5. Executes a LangGraph graph (plan -> delegate -> collect) using the existing LLMBackend.
   The plan text is passed to the worker together with the task.
6. The worker opens an authenticated session against ``/mcp/`` with the worker key.

The manager does **not** call any tool directly. It delegates and waits.

Audit events
------------
- ``a2a.delegate``     — delegation grant recorded before the worker starts
- ``a2a.worker.start`` — worker execution started (linked by task_id)
- ``a2a.complete``     — terminal successful state
- ``a2a.failed``       — terminal failed state
- ``a2a.cancelled``    — cancelled state
- ``a2a.denied``       — delegation policy rejection

All events share ``request_id = task_id`` so they can be correlated in the audit log.
"""

from __future__ import annotations

import asyncio
import logging
import re
from dataclasses import dataclass
from typing import Any, TypedDict

from langgraph.graph import END, START, StateGraph

from app.agents.a2a.delegation import (
    DelegationContext,
    DelegationScopeError,
    EmptyDelegationScopeError,
    attenuate,
)
from app.agents.a2a.worker import (
    WorkerNotConfiguredError,
    WorkerOutcome,
    run_worker,
)
from app.agents.notes_agent import MAX_TASK_CHARS
from app.audit.events import AUDIT_DECISION_ALLOWED, AUDIT_DECISION_DENIED, AuditRecord
from app.audit.sink import record_event
from app.auth.principal import Principal
from app.config import settings
from app.database import async_session_maker
from app.llm.backend import (
    LLMBackend,
    LLMDisabledError,
    LLMUnavailableError,
)
from app.models.a2a_tasks import (
    A2A_STATUS_PENDING,
    A2A_STATUS_RUNNING,
)
from app.repos.a2a_tasks import (
    create_task,
    get_task,
    mark_blocked,
    mark_cancelled,
    mark_completed,
    mark_failed,
    mark_running,
)

logger = logging.getLogger(__name__)

# Custom audit action constants for A2A
ACTION_A2A_DELEGATE = "a2a.delegate"
ACTION_A2A_WORKER_START = "a2a.worker.start"
ACTION_A2A_COMPLETE = "a2a.complete"
ACTION_A2A_FAILED = "a2a.failed"
ACTION_A2A_CANCELLED = "a2a.cancelled"
ACTION_A2A_DENIED = "a2a.denied"

# Hard deadline for the whole A2A task (manager + worker combined)
_TASK_DEADLINE_S = 120.0

# Limits for the manager plan passed to the worker
_MAX_PLAN_CHARS = 2_000
_MIN_PLAN_CHARS = 40
_THINK_RE = re.compile(r"<think>.*?</think>", re.DOTALL | re.IGNORECASE)


class ManagerNotConfiguredError(RuntimeError):
    """WORKER_NOTES_API_KEY is unset; the manager cannot delegate."""


@dataclass(frozen=True, slots=True)
class ManagerOutcome:
    task_id: str
    status: str
    result: str
    tool_calls: list[dict[str, Any]]
    provider: str | None
    model: str | None
    manager_key_prefix: str | None
    worker_key_prefix: str | None
    delegated_scopes: list[str]
    manager_request_id: str | None


class ManagerGraphState(TypedDict):
    task_id: str
    task_input: str
    delegation: DelegationContext
    request_id: str
    key_prefix: str | None
    plan: str | None
    worker_outcome: WorkerOutcome | None
    result: str | None
    status: str | None


def _compile_manager_graph(backend: LLMBackend):
    """Build the manager LangGraph graph: plan -> delegate -> collect."""

    async def plan(state: ManagerGraphState) -> dict[str, Any]:
        prompt = (
            "You are an A2A Manager Agent coordinating a notes management task. "
            f"Formulate a brief execution plan for the worker: {state['task_input']}"
        )
        response = await backend.invoke(
            [{"role": "user", "content": prompt}],
            purpose="a2a_manager_plan",
            key_prefix=state.get("key_prefix"),
            request_id=state.get("request_id"),
        )
        return {"plan": response.text.strip()}

    async def delegate(state: ManagerGraphState) -> dict[str, Any]:
        worker_outcome = await run_worker(
            state["task_id"],
            _worker_instruction(state["task_input"], state.get("plan")),
            state["delegation"],
            request_id=state["task_id"],
        )
        return {"worker_outcome": worker_outcome}

    async def collect(state: ManagerGraphState) -> dict[str, Any]:
        outcome = state.get("worker_outcome")
        if outcome is None:
            return {
                "status": "failed",
                "result": "Worker execution returned no outcome.",
            }
        return {
            "status": outcome.status,
            "result": outcome.result,
        }

    graph = StateGraph(ManagerGraphState)
    graph.add_node("plan", plan)
    graph.add_node("delegate", delegate)
    graph.add_node("collect", collect)
    graph.add_edge(START, "plan")
    graph.add_edge("plan", "delegate")
    graph.add_edge("delegate", "collect")
    graph.add_edge("collect", END)
    return graph.compile()


def _worker_instruction(task_input: str, plan: str | None) -> str:
    """Combine the user's task with the manager's plan for the worker.

    The plan is clipped so the whole instruction stays within the worker's
    MAX_TASK_CHARS limit. If there is no room or no plan, the task is sent
    unchanged. The user's task stays authoritative; the plan is guidance.
    """
    cleaned_plan = _THINK_RE.sub("", plan or "").strip()
    if not cleaned_plan:
        return task_input
    header = "Task:\n"
    middle = "\n\nManager plan (guidance only; follow the task above):\n"
    budget = min(
        _MAX_PLAN_CHARS,
        MAX_TASK_CHARS - len(header) - len(task_input) - len(middle),
    )
    if budget < _MIN_PLAN_CHARS:
        return task_input
    if len(cleaned_plan) > budget:
        cleaned_plan = cleaned_plan[: budget - 3].rstrip() + "..."
    return f"{header}{task_input}{middle}{cleaned_plan}"


async def run_manager(
    task_input: str,
    *,
    manager_principal: Principal,
    manager_request_id: str | None = None,
) -> ManagerOutcome:
    """Orchestrate one manager-to-worker delegation.

    Parameters
    ----------
    task_input:
        The user's task description.
    manager_principal:
        The authenticated identity of the caller.
    manager_request_id:
        The HTTP request_id from the route, used as the initial correlation anchor.
    """
    # 1. Resolve worker key and scopes from server config
    try:
        worker_key_prefix, worker_scopes = await _resolve_worker_identity()
    except WorkerNotConfiguredError as exc:
        logger.error("a2a.manager.worker_not_configured: %s", exc)
        await _audit(
            action=ACTION_A2A_FAILED,
            decision=AUDIT_DECISION_DENIED,
            status="error",
            request_id=manager_request_id,
            principal=manager_principal,
            reason=str(exc),
            status_code=503,
            error_code="SERVICE_UNAVAILABLE",
        )
        raise ManagerNotConfiguredError(str(exc)) from exc

    # 2. Scope attenuation — raises DelegationScopeError or EmptyDelegationScopeError
    try:
        delegation = attenuate(
            manager_key_prefix=manager_principal.key_prefix,
            manager_scopes=manager_principal.scopes,
            worker_key_prefix=worker_key_prefix,
            worker_scopes=worker_scopes,
        )
    except (DelegationScopeError, EmptyDelegationScopeError) as exc:
        logger.warning(
            "a2a.manager.delegation_denied manager=%s reason=%s",
            manager_principal.key_prefix,
            str(exc),
        )
        await _audit(
            action=ACTION_A2A_DENIED,
            decision=AUDIT_DECISION_DENIED,
            status="denied",
            request_id=manager_request_id,
            principal=manager_principal,
            reason=str(exc),
            status_code=403,
            error_code="FORBIDDEN",
        )
        raise

    # 3. Create the task row (pending)
    async with async_session_maker() as session:
        task = await create_task(
            session,
            task_input=task_input,
            manager_client_id=manager_principal.client_id,
            manager_key_prefix=manager_principal.key_prefix,
            worker_key_prefix=worker_key_prefix,
            delegated_scopes=list(delegation.delegated_scopes),
            manager_request_id=manager_request_id,
        )
        await session.commit()
        task_id = task.id

    # 4. Record delegation grant
    await _audit(
        action=ACTION_A2A_DELEGATE,
        decision=AUDIT_DECISION_ALLOWED,
        status="delegated",
        request_id=task_id,
        principal=manager_principal,
        reason=(
            f"task_id={task_id} "
            f"worker_prefix={worker_key_prefix} "
            f"scopes={','.join(sorted(delegation.delegated_scopes))}"
        ),
    )

    # 5. Mark running
    async with async_session_maker() as session:
        await mark_running(session, task_id)
        await session.commit()

    task_terminal = False
    try:
        if not settings.llm_enabled:
            raise LLMDisabledError("LLM is disabled.")

        # Actually write the a2a.worker.start audit event
        await _audit(
            action=ACTION_A2A_WORKER_START,
            decision=AUDIT_DECISION_ALLOWED,
            status="started",
            request_id=task_id,
            principal=manager_principal,
            reason=f"task_id={task_id} worker_prefix={worker_key_prefix}",
        )

        backend = LLMBackend()
        graph = _compile_manager_graph(backend)

        initial_state: ManagerGraphState = {
            "task_id": task_id,
            "task_input": task_input,
            "delegation": delegation,
            "request_id": task_id,
            "key_prefix": manager_principal.key_prefix,
            "plan": None,
            "worker_outcome": None,
            "result": None,
            "status": None,
        }

        final_state = await asyncio.wait_for(
            graph.ainvoke(initial_state),
            timeout=_TASK_DEADLINE_S,
        )
        worker_outcome: WorkerOutcome | None = final_state.get("worker_outcome")
        if worker_outcome is None:
            worker_outcome = WorkerOutcome(
                task_id=task_id,
                status="failed",
                result="No worker outcome received.",
                tool_calls=[],
                provider=None,
                model=None,
                worker_key_prefix=worker_key_prefix,
            )

        # 6. Persist final state
        is_success = worker_outcome.status == "completed"
        is_blocked = worker_outcome.status in ("blocked", "gateway_blocked")
        async with async_session_maker() as session:
            if is_success:
                await mark_completed(session, task_id, result=worker_outcome.result)
            elif is_blocked:
                await mark_blocked(session, task_id, error=worker_outcome.result)
            else:
                await mark_failed(session, task_id, error=worker_outcome.result)
            await session.commit()
        task_terminal = True

        # 7. Final audit
        await _audit(
            action=ACTION_A2A_COMPLETE if is_success else ACTION_A2A_FAILED,
            decision=AUDIT_DECISION_ALLOWED,
            status=worker_outcome.status,
            request_id=task_id,
            principal=manager_principal,
            reason=(
                f"task_id={task_id} "
                f"tool_calls={len(worker_outcome.tool_calls)} "
                f"provider={worker_outcome.provider or '-'}"
            ),
        )

        return ManagerOutcome(
            task_id=task_id,
            status=worker_outcome.status,
            result=worker_outcome.result,
            tool_calls=worker_outcome.tool_calls,
            provider=worker_outcome.provider,
            model=worker_outcome.model,
            manager_key_prefix=manager_principal.key_prefix,
            worker_key_prefix=worker_key_prefix,
            delegated_scopes=list(delegation.delegated_scopes),
            manager_request_id=manager_request_id,
        )

    except asyncio.CancelledError:
        logger.warning("a2a.manager.cancelled task_id=%s", task_id)
        async with async_session_maker() as session:
            await mark_cancelled(session, task_id)
            await session.commit()
        task_terminal = True
        await _audit(
            action=ACTION_A2A_CANCELLED,
            decision=AUDIT_DECISION_ALLOWED,
            status="cancelled",
            request_id=task_id,
            principal=manager_principal,
            reason=f"task_id={task_id} cancelled",
        )
        raise

    except TimeoutError:
        logger.warning("a2a.manager.timeout task_id=%s", task_id)
        error_msg = "Task deadline exceeded."
        async with async_session_maker() as session:
            await mark_failed(session, task_id, error=error_msg)
            await session.commit()
        task_terminal = True
        await _audit(
            action=ACTION_A2A_FAILED,
            decision=AUDIT_DECISION_ALLOWED,
            status="timeout",
            request_id=task_id,
            principal=manager_principal,
            reason=f"task_id={task_id} deadline_s={_TASK_DEADLINE_S}",
        )
        return ManagerOutcome(
            task_id=task_id,
            status="failed",
            result=error_msg,
            tool_calls=[],
            provider=None,
            model=None,
            manager_key_prefix=manager_principal.key_prefix,
            worker_key_prefix=worker_key_prefix,
            delegated_scopes=list(delegation.delegated_scopes),
            manager_request_id=manager_request_id,
        )

    except (
        LLMDisabledError,
        LLMUnavailableError,
        Exception,  # noqa: BLE001 - catch-all to guarantee every task ends in terminal state
    ) as exc:
        safe_msg = (
            str(exc)
            if isinstance(exc, (LLMDisabledError, LLMUnavailableError))
            else "A2A execution error."
        )
        logger.error("a2a.manager.error task_id=%s: %s", task_id, exc)
        async with async_session_maker() as session:
            await mark_failed(session, task_id, error=safe_msg)
            await session.commit()
        task_terminal = True
        await _audit(
            action=ACTION_A2A_FAILED,
            decision=AUDIT_DECISION_ALLOWED,
            status="failed",
            request_id=task_id,
            principal=manager_principal,
            reason=f"task_id={task_id} {safe_msg}",
        )
        return ManagerOutcome(
            task_id=task_id,
            status="failed",
            result=safe_msg,
            tool_calls=[],
            provider=None,
            model=None,
            manager_key_prefix=manager_principal.key_prefix,
            worker_key_prefix=worker_key_prefix,
            delegated_scopes=list(delegation.delegated_scopes),
            manager_request_id=manager_request_id,
        )

    finally:
        if not task_terminal:
            try:
                async with async_session_maker() as session:
                    t = await get_task(session, task_id)
                    if t is not None and t.status in (
                        A2A_STATUS_PENDING,
                        A2A_STATUS_RUNNING,
                    ):
                        await mark_failed(
                            session, task_id, error="Task ended in non-terminal state."
                        )
                        await session.commit()
            except Exception as finally_exc:  # noqa: BLE001 - best-effort cleanup
                logger.error(
                    "a2a.manager.finally_cleanup_failed task_id=%s: %s",
                    task_id,
                    finally_exc,
                )


async def _resolve_worker_identity() -> tuple[str, frozenset[str]]:
    """Return (worker_key_prefix, worker_scopes) from server config.

    The worker key is verified against the database to get its real scopes.
    Raises ``WorkerNotConfiguredError`` when unconfigured or invalid.
    """
    worker_secret = settings.worker_notes_api_key
    if worker_secret is None or not worker_secret.get_secret_value().strip():
        raise WorkerNotConfiguredError("WORKER_NOTES_API_KEY is not set.")

    from app.auth.verifier import get_api_key_verifier

    principal = await get_api_key_verifier().verify(worker_secret.get_secret_value())
    if principal is None:
        raise WorkerNotConfiguredError(
            "WORKER_NOTES_API_KEY is not a valid key (revoked or not found)."
        )

    return principal.key_prefix, principal.scopes


async def _audit(
    *,
    action: str,
    decision: str,
    status: str,
    request_id: str | None,
    principal: Principal,
    reason: str | None = None,
    status_code: int | None = None,
    error_code: str | None = None,
) -> None:
    """Write a best-effort audit row. Failures are logged but not raised."""
    from app.audit.redaction import safe_reason

    await record_event(
        AuditRecord(
            action=action,
            decision=decision,
            status=status,
            request_id=request_id,
            reason=safe_reason(reason),
            status_code=status_code,
            error_code=error_code,
            **AuditRecord.actor_fields(principal),
        ),
        required=False,
    )
