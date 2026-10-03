"""Async persistence helpers for sandbox runs."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.sandbox_runs import SandboxRun
from app.repos.common import normalize_page, require_text


async def add_run(
    session: AsyncSession,
    *,
    status: str = "pending",
    client_id: str | None = None,
    audit_event_id: str | None = None,
    exit_code: int | None = None,
    error_metadata: str | None = None,
) -> SandboxRun:
    if exit_code is not None and (
        isinstance(exit_code, bool) or not isinstance(exit_code, int)
    ):
        raise ValueError("exit_code must be an integer")
    run = SandboxRun(
        status=require_text(status, field="status", max_length=50),
        client_id=client_id,
        audit_event_id=audit_event_id,
        exit_code=exit_code,
        error_metadata=error_metadata,
    )
    session.add(run)
    await session.flush()
    return run


async def list_runs(
    session: AsyncSession,
    *,
    client_id: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[SandboxRun]:
    limit, offset = normalize_page(limit, offset)
    statement = select(SandboxRun).order_by(
        SandboxRun.created_at.asc(), SandboxRun.id.asc()
    )
    if client_id is not None:
        statement = statement.where(SandboxRun.client_id == client_id)
    statement = statement.limit(limit).offset(offset)
    result = await session.execute(statement)
    return list(result.scalars().all())
