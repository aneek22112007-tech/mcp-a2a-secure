"""GET /api/sandbox/runs and health."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Path, Query
from pydantic import BaseModel

from app import database
from app.auth.dependencies import authorize_route
from app.repos.sandbox_runs import get_run, list_runs_page
from app.sandbox.executor import get_executor
from app.sandbox.types import (
    RUN_STATUSES,
    SandboxHealth,
)

router = APIRouter(
    prefix="/api/sandbox",
    tags=["sandbox"],
    dependencies=[Depends(authorize_route)],
)


class SandboxRunOut(BaseModel):
    id: str
    status: str
    tool_name: str | None
    mode: str | None
    image: str | None
    transport: str | None
    client_id: str | None
    api_key_id: str | None
    key_prefix: str | None
    request_id: str | None
    audit_event_id: str | None
    args_hash: str | None
    exit_code: int | None
    error_type: str | None
    duration_ms: int | None
    output_bytes: int | None
    created_at: datetime
    started_at: datetime | None
    finished_at: datetime | None


class SandboxPage(BaseModel):
    items: list[SandboxRunOut]
    limit: int
    offset: int
    next_offset: int | None


@router.get("/runs", response_model=SandboxPage)
async def list_sandbox_runs(
    client_id: Annotated[str | None, Query(max_length=36)] = None,
    tool_name: Annotated[str | None, Query(max_length=100)] = None,
    status: str | None = None,
    transport: Literal["rest", "mcp"] | None = None,
    mode: Literal["docker", "inprocess"] | None = None,
    request_id: Annotated[str | None, Query(max_length=64)] = None,
    start: datetime | None = None,
    end: datetime | None = None,
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
) -> SandboxPage:
    if status is not None and status not in RUN_STATUSES and status != "pending":
        raise HTTPException(status_code=422, detail="Invalid status.")

    async with database.async_session_maker() as session:
        try:
            rows, has_more = await list_runs_page(
                session,
                client_id=client_id,
                tool_name=tool_name,
                status=status,
                transport=transport,
                mode=mode,
                request_id=request_id,
                start=start,
                end=end,
                limit=limit,
                offset=offset,
            )
        except (ValueError, TypeError):
            raise HTTPException(status_code=400, detail="Invalid query.") from None

        items = []
        for row in rows:
            items.append(
                SandboxRunOut(
                    id=row.id,
                    status=row.status,
                    tool_name=row.tool_name,
                    mode=row.mode,
                    image=row.image,
                    transport=row.transport,
                    client_id=row.client_id,
                    api_key_id=row.api_key_id,
                    key_prefix=row.key_prefix,
                    request_id=row.request_id,
                    audit_event_id=row.audit_event_id,
                    args_hash=row.args_hash,
                    exit_code=row.exit_code,
                    error_type=row.error_type,
                    duration_ms=row.duration_ms,
                    output_bytes=row.output_bytes,
                    created_at=row.created_at,
                    started_at=row.started_at,
                    finished_at=row.finished_at,
                )
            )

    return SandboxPage(
        items=items,
        limit=limit,
        offset=offset,
        next_offset=(offset + limit) if has_more else None,
    )


@router.get("/runs/{run_id}", response_model=SandboxRunOut)
async def get_sandbox_run(
    run_id: Annotated[str, Path(max_length=36)],
) -> SandboxRunOut:
    async with database.async_session_maker() as session:
        row = await get_run(session, run_id)
        if row is None:
            raise HTTPException(status_code=404, detail="Run not found.")
        return SandboxRunOut(
            id=row.id,
            status=row.status,
            tool_name=row.tool_name,
            mode=row.mode,
            image=row.image,
            transport=row.transport,
            client_id=row.client_id,
            api_key_id=row.api_key_id,
            key_prefix=row.key_prefix,
            request_id=row.request_id,
            audit_event_id=row.audit_event_id,
            args_hash=row.args_hash,
            exit_code=row.exit_code,
            error_type=row.error_type,
            duration_ms=row.duration_ms,
            output_bytes=row.output_bytes,
            created_at=row.created_at,
            started_at=row.started_at,
            finished_at=row.finished_at,
        )


@router.get("/health", response_model=SandboxHealth)
async def get_sandbox_health() -> SandboxHealth:
    executor = get_executor()
    health = await executor.health()
    return health
