"""POST /api/guard/check — prompt-injection guard testing endpoint."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field

from app.audit.redaction import current_request_id
from app.auth.dependencies import authorize_route
from app.auth.principal import Principal
from app.guard.engine import check_tool_output
from app.guard.models import GuardResult

router = APIRouter(
    prefix="/api/guard",
    tags=["guard"],
    dependencies=[Depends(authorize_route)],
)


class GuardCheckRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=100_000)
    tool_name: str = "test_tool"
    key_prefix: str | None = None
    request_id: str | None = None


@router.post("/check", response_model=GuardResult)
async def check_guard(
    payload: GuardCheckRequest,
    request: Request,
) -> GuardResult:
    """Evaluate candidate tool output text against prompt injection guard rules G1–G6."""

    principal: Principal | None = getattr(request.state, "principal", None)
    key_prefix = payload.key_prefix
    if not key_prefix and principal:
        key_prefix = principal.key_prefix

    request_id = payload.request_id
    if not request_id:
        request_id = current_request_id(request.scope)

    result = check_tool_output(
        payload.text,
        tool_name=payload.tool_name,
        key_prefix=key_prefix,
        request_id=request_id,
    )
    task = getattr(result, "_audit_task", None)
    if task is not None:
        try:
            await task
        except Exception:  # noqa: BLE001, S110
            pass
    return result
