"""A2A routes: task execution, task status, and agent card discovery.

Security contract
-----------------
- The request body contains only the task text; no credentials,
  upstream URLs, or scope grants are accepted from the caller.
- Worker identity and delegated scopes are resolved from server
  configuration only.
- Excess delegation requests return 403 FORBIDDEN.
- Empty delegated scopes return 403 FORBIDDEN.
- Results never include secrets, key material, or internal paths.
- GET /api/a2a/tasks/{id} returns only tasks created by the caller.
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field, field_validator

from app.agents.a2a.delegation import (
    DelegationScopeError,
    EmptyDelegationScopeError,
)
from app.agents.a2a.manager import (
    ManagerNotConfiguredError,
    ManagerOutcome,
    run_manager,
)
from app.agents.a2a.protocol import A2A_SDK_VERSION, a2a_task_dict, agent_card_dict
from app.agents.a2a.worker import WorkerNotConfiguredError
from app.agents.notes_agent import MAX_TASK_CHARS, TaskError
from app.audit.redaction import current_request_id
from app.auth.dependencies import authorize_route, get_principal
from app.auth.principal import Principal
from app.database import async_session_maker
from app.repos.a2a_tasks import get_task

router = APIRouter(
    prefix="/api/a2a",
    tags=["a2a"],
    dependencies=[Depends(authorize_route)],
)


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------


class A2ATaskRequest(BaseModel):
    """Body for POST /api/a2a/tasks/run.

    Only the task text is accepted. Credentials, upstream URLs, worker
    identities, and scope grants must never appear here.
    """

    task: str = Field(min_length=1, max_length=MAX_TASK_CHARS)

    @field_validator("task")
    @classmethod
    def strip_task(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("task must not be empty")
        return stripped


class ToolCallOut(BaseModel):
    name: str
    arguments: dict[str, Any]
    status: str
    output: str | None = None
    error: str | None = None


class A2ATaskCapabilities(BaseModel):
    """Discovery envelope for the delegated notes worker.

    ``a2a_sdk`` is the installed a2a-sdk version used for the task and
    agent-card shapes.
    """

    agent_name: str = "mcp-guard-notes-worker"
    a2a_sdk: str = Field(default_factory=lambda: A2A_SDK_VERSION)
    max_hops: int = 1
    allowed_tools: list[str] = ["list_notes", "read_note", "write_note"]
    max_task_chars: int = MAX_TASK_CHARS
    agent_card: dict[str, Any] = Field(default_factory=agent_card_dict)


class A2ATaskResponse(BaseModel):
    """Full response for a completed, blocked, or failed A2A task."""

    # Task identification and status
    task_id: str
    status: str  # "completed" | "failed" | "blocked" | "cancelled"
    result: str
    error: str | None = None

    # Tool call trace — real audit events exist under task_id as request_id
    tool_calls: list[ToolCallOut]

    # Model attribution
    provider: str | None
    model: str | None

    # Correlation IDs — no secrets, only prefixes
    manager_request_id: str | None
    manager_key_prefix: str | None
    worker_key_prefix: str | None
    delegated_scopes: list[str]

    # Agent discovery envelope
    capabilities: A2ATaskCapabilities


class A2ATaskDetailResponse(BaseModel):
    """Task status record returned by GET /api/a2a/tasks/{id}."""

    task_id: str
    status: str
    task_input: str
    result: str | None = None
    error: str | None = None
    manager_key_prefix: str | None = None
    worker_key_prefix: str | None = None
    delegated_scopes: list[str] = Field(default_factory=list)
    created_at: datetime
    started_at: datetime | None = None
    finished_at: datetime | None = None
    a2a_task: dict[str, Any] | None = None


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.post("/tasks/run", response_model=A2ATaskResponse)
async def run_a2a_task(
    body: A2ATaskRequest,
    request: Request,
    principal: Annotated[Principal, Depends(get_principal)],
) -> A2ATaskResponse:
    """Delegate a notes task from manager to worker through MCP Guard.

    The manager identity is the authenticated caller. The worker identity
    and its delegated scopes are resolved from server configuration.
    No credentials may be passed in the request body.

    Returns 403 when the requested delegation exceeds manager permissions
    or delegated scopes are empty. If the gateway or LLM is unavailable during
    execution, the task lifecycle transitions truthfully to "failed" and returns
    HTTP 200 with status "failed".
    """
    request_id = current_request_id(request.scope)

    try:
        outcome: ManagerOutcome = await run_manager(
            body.task,
            manager_principal=principal,
            manager_request_id=request_id,
        )
    except (DelegationScopeError, EmptyDelegationScopeError) as exc:
        raise HTTPException(
            status_code=403,
            detail=str(exc),
        ) from None
    except (WorkerNotConfiguredError, ManagerNotConfiguredError):
        raise HTTPException(
            status_code=503,
            detail="A2A worker is not configured. Set WORKER_NOTES_API_KEY.",
        ) from None
    except TaskError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from None

    return A2ATaskResponse(
        task_id=outcome.task_id,
        status=outcome.status,
        result=outcome.result,
        error=None if outcome.status == "completed" else outcome.result,
        tool_calls=[_tool_call_out(c) for c in outcome.tool_calls],
        provider=outcome.provider,
        model=outcome.model,
        manager_request_id=outcome.manager_request_id,
        manager_key_prefix=outcome.manager_key_prefix,
        worker_key_prefix=outcome.worker_key_prefix,
        delegated_scopes=sorted(outcome.delegated_scopes),
        capabilities=A2ATaskCapabilities(),
    )


@router.get("/tasks/{id}", response_model=A2ATaskDetailResponse)
async def get_a2a_task_by_id(
    id: str,
    principal: Annotated[Principal, Depends(get_principal)],
) -> A2ATaskDetailResponse:
    """Retrieve an A2A task by ID.

    Returns only tasks created by the caller's key.
    """
    async with async_session_maker() as session:
        task = await get_task(session, id)
        if task is None:
            raise HTTPException(status_code=404, detail="Task not found.")

        # Enforce caller key ownership
        is_owner = (
            task.manager_key_prefix is not None
            and task.manager_key_prefix == principal.key_prefix
        )
        if not is_owner:
            raise HTTPException(status_code=404, detail="Task not found.")

        scopes = task.delegated_scopes.split(",") if task.delegated_scopes else []
        return A2ATaskDetailResponse(
            task_id=task.id,
            status=task.status,
            task_input=task.task_input or "",
            result=task.result,
            error=task.error,
            manager_key_prefix=task.manager_key_prefix,
            worker_key_prefix=task.worker_key_prefix,
            delegated_scopes=sorted(scopes),
            created_at=task.created_at,
            started_at=task.started_at,
            finished_at=task.finished_at,
            a2a_task=a2a_task_dict(task),
        )


@router.get("/capabilities", response_model=A2ATaskCapabilities)
async def get_capabilities() -> A2ATaskCapabilities:
    """Return agent capabilities and discovery metadata."""
    return A2ATaskCapabilities()


@router.get("/agent-card")
async def get_agent_card() -> dict[str, Any]:
    """Return the official A2A AgentCard for worker agent discovery."""
    return agent_card_dict()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _tool_call_out(call: dict[str, Any]) -> ToolCallOut:
    arguments = call.get("arguments")
    if not isinstance(arguments, dict):
        arguments = {}
    output = call.get("output")
    error = call.get("error")
    return ToolCallOut(
        name=str(call.get("name") or ""),
        arguments=arguments,
        status=str(call.get("status") or ""),
        output=output if isinstance(output, str) else None,
        error=error if isinstance(error, str) else None,
    )
