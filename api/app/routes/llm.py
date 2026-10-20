"""GET /api/llm/health — LLM provider readiness. Admin scope."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.auth.dependencies import authorize_route
from app.llm.health import LLMHealth, check_health

router = APIRouter(
    prefix="/api/llm",
    tags=["llm"],
    dependencies=[Depends(authorize_route)],
)


@router.get("/health", response_model=LLMHealth)
async def llm_health() -> LLMHealth:
    """Report whether the LLM is enabled and which providers are ready.

    ``groq_configured`` is true or false. The Groq key is not returned.
    """

    return await check_health()
