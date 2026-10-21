"""GET /api/llm-calls — admin-only listing of LLM calls, pagination, and metrics."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query

from app import database
from app.auth.dependencies import authorize_route
from app.repos.llm_calls import get_llm_metrics, list_llm_calls

router = APIRouter(
    prefix="/api/llm-calls",
    tags=["llm"],
    dependencies=[Depends(authorize_route)],
)


@router.get("")
async def get_llm_calls(
    provider: str | None = Query(None),
    status: str | None = Query(None),
    key_prefix: str | None = Query(None),
    key: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    page: int | None = Query(None, ge=1),
) -> dict[str, Any]:
    effective_prefix = key_prefix if key_prefix is not None else key
    if page is not None:
        offset = (page - 1) * limit

    async with database.async_session_maker() as session:
        items, total = await list_llm_calls(
            session,
            provider=provider,
            status=status,
            key_prefix=effective_prefix,
            limit=limit,
            offset=offset,
        )
        metrics = await get_llm_metrics(
            session,
            provider=provider,
            status=status,
            key_prefix=effective_prefix,
        )

    serialized_calls = [
        {
            "id": call.id,
            "model": call.model,
            "provider": call.provider,
            "purpose": call.purpose,
            "error": call.error,
            "input_tokens": call.input_tokens,
            "output_tokens": call.output_tokens,
            "latency": call.latency_ms,
            "latency_ms": call.latency_ms,
            "status": call.status,
            "fell_back": call.fell_back,
            "is_fallback": call.is_fallback,
            "key_prefix": call.key_prefix,
            "request_id": call.request_id,
            "created_at": call.created_at.isoformat() if call.created_at else None,
            "timestamp": call.created_at.isoformat() if call.created_at else None,
        }
        for call in items
    ]

    return {
        "items": serialized_calls,
        "calls": serialized_calls,
        "total": total,
        "limit": limit,
        "offset": offset,
        "metrics": metrics,
        "call_count": metrics["call_count"],
        "average_latency": metrics["average_latency"],
        "avg_latency_ms": metrics["avg_latency_ms"],
        "fallback_rate": metrics["fallback_rate"],
    }
