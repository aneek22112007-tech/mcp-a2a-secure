"""POST /api/agents/notes/run — run the notes agent."""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field, field_validator

from app.agents.gateway import GatewayProtocolError, GatewayTransportError
from app.agents.notes_agent import (
    MAX_TASK_CHARS,
    AgentNotConfiguredError,
    TaskError,
    run_notes_agent,
)
from app.audit.redaction import current_request_id
from app.auth.dependencies import authorize_route, get_principal
from app.auth.principal import Principal
from app.config import settings
from app.llm.backend import LLMDisabledError, LLMUnavailableError

router = APIRouter(
    prefix="/api/agents",
    tags=["agents"],
    dependencies=[Depends(authorize_route)],
)


class NotesRunRequest(BaseModel):
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


class NotesRunResponse(BaseModel):
    result: str
    tool_calls: list[ToolCallOut]
    provider: str | None
    model: str | None
    request_id: str | None


@router.post("/notes/run", response_model=NotesRunResponse)
async def run_notes(
    body: NotesRunRequest,
    request: Request,
    principal: Annotated[Principal, Depends(get_principal)],
) -> NotesRunResponse:
    """Plan a notes task and call tools through /mcp/.

    Returns 503 when the LLM is disabled or cannot be reached. A gateway
    block is reported in the result. The model does not skip gateway checks.
    """

    if not settings.llm_enabled:
        raise HTTPException(status_code=503, detail="LLM is disabled.")
    try:
        outcome = await run_notes_agent(
            body.task,
            request_id=current_request_id(request.scope),
            key_prefix=principal.key_prefix,
        )
    except LLMDisabledError:
        raise HTTPException(status_code=503, detail="LLM is disabled.") from None
    except AgentNotConfiguredError:
        raise HTTPException(
            status_code=503,
            detail="Notes agent is not configured.",
        ) from None
    except TaskError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from None
    except LLMUnavailableError:
        raise HTTPException(status_code=503, detail="LLM is unavailable.") from None
    except (GatewayTransportError, GatewayProtocolError):
        raise HTTPException(
            status_code=503,
            detail="MCP gateway is unavailable.",
        ) from None
    return NotesRunResponse(
        result=outcome.result,
        tool_calls=[_tool_call_out(call) for call in outcome.tool_calls],
        provider=outcome.provider,
        model=outcome.model,
        request_id=current_request_id(request.scope),
    )


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
