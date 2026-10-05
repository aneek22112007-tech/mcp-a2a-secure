"""Async persistence helpers for sandbox runs."""

from datetime import datetime

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit.redaction import safe_tool_name
from app.models.base import utc_now
from app.models.sandbox_runs import SandboxRun
from app.repos.common import as_utc, normalize_page, require_text
from app.sandbox.types import (
    RUN_STATUS_FAILED,
    RUN_STATUS_RUNNING,
    RUN_STATUSES,
    SandboxRunFinish,
    SandboxRunStart,
)

STALE_RUN_ERROR_TYPE = "stale_run"


def _optional_text(value: str | None, *, field: str, max_length: int) -> str | None:
    if value is None:
        return None
    return require_text(value, field=field, max_length=max_length)


def _bound(value: datetime | None, *, field: str) -> datetime | None:
    if value is None:
        return None
    if not isinstance(value, datetime):
        raise TypeError(f"{field} must be a datetime")
    return as_utc(value)


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


async def start_run(session: AsyncSession, run: SandboxRunStart) -> None:
    statement = select(SandboxRun).where(SandboxRun.id == run.run_id)
    result = await session.execute(statement)
    if result.scalar_one_or_none() is not None:
        return
    row = SandboxRun(
        id=run.run_id,
        status=RUN_STATUS_RUNNING,
        tool_name=safe_tool_name(run.tool_name),
        mode=run.mode,
        image=run.image,
        transport=run.transport,
        args_hash=run.args_hash,
        request_id=run.request_id,
        client_id=run.client_id,
        api_key_id=run.api_key_id,
        key_prefix=run.key_prefix,
        audit_event_id=run.audit_event_id,
        started_at=as_utc(run.started_at),
    )
    session.add(row)
    await session.flush()


async def finish_run(
    session: AsyncSession, run_id: str, finish: SandboxRunFinish
) -> bool:
    if finish.status not in RUN_STATUSES:
        raise ValueError("invalid status")
    statement = (
        update(SandboxRun)
        .where(SandboxRun.id == run_id)
        .values(
            status=finish.status,
            exit_code=finish.exit_code,
            duration_ms=finish.duration_ms,
            output_bytes=finish.output_bytes,
            error_type=finish.error_type,
            finished_at=as_utc(finish.finished_at),
        )
    )
    result = await session.execute(statement)
    return result.rowcount > 0


async def insert_finished_run(
    session: AsyncSession,
    run_id: str,
    finish: SandboxRunFinish,
    start: SandboxRunStart | None,
) -> None:
    if finish.status not in RUN_STATUSES:
        raise ValueError("invalid status")
    statement = select(SandboxRun).where(SandboxRun.id == run_id)
    result = await session.execute(statement)
    if result.scalar_one_or_none() is not None:
        return

    if start is not None:
        row = SandboxRun(
            id=run_id,
            status=finish.status,
            tool_name=safe_tool_name(start.tool_name),
            mode=start.mode,
            image=start.image,
            transport=start.transport,
            args_hash=start.args_hash,
            request_id=start.request_id,
            client_id=start.client_id,
            api_key_id=start.api_key_id,
            key_prefix=start.key_prefix,
            audit_event_id=start.audit_event_id,
            started_at=as_utc(start.started_at),
            exit_code=finish.exit_code,
            duration_ms=finish.duration_ms,
            output_bytes=finish.output_bytes,
            error_type=finish.error_type,
            finished_at=as_utc(finish.finished_at),
        )
    else:
        row = SandboxRun(
            id=run_id,
            status=finish.status,
            exit_code=finish.exit_code,
            duration_ms=finish.duration_ms,
            output_bytes=finish.output_bytes,
            error_type=finish.error_type,
            finished_at=as_utc(finish.finished_at),
        )
    session.add(row)
    await session.flush()


async def get_run(session: AsyncSession, run_id: str) -> SandboxRun | None:
    statement = select(SandboxRun).where(SandboxRun.id == run_id)
    result = await session.execute(statement)
    return result.scalar_one_or_none()


def _filtered_runs(
    statement,
    *,
    client_id: str | None = None,
    tool_name: str | None = None,
    status: str | None = None,
    transport: str | None = None,
    mode: str | None = None,
    request_id: str | None = None,
    start: datetime | None = None,
    end: datetime | None = None,
):
    start_at = _bound(start, field="start")
    end_at = _bound(end, field="end")
    if start_at is not None and end_at is not None and start_at > end_at:
        raise ValueError("start must be earlier than or equal to end")

    if client_id is not None:
        statement = statement.where(
            SandboxRun.client_id
            == _optional_text(client_id, field="client_id", max_length=36)
        )
    if tool_name is not None:
        statement = statement.where(
            SandboxRun.tool_name
            == _optional_text(tool_name, field="tool_name", max_length=100)
        )
    if status is not None:
        if status not in RUN_STATUSES and status != "pending":
            raise ValueError("invalid status")
        statement = statement.where(SandboxRun.status == status)
    if transport is not None:
        statement = statement.where(
            SandboxRun.transport
            == _optional_text(transport, field="transport", max_length=8)
        )
    if mode is not None:
        statement = statement.where(
            SandboxRun.mode == _optional_text(mode, field="mode", max_length=16)
        )
    if request_id is not None:
        statement = statement.where(
            SandboxRun.request_id
            == _optional_text(request_id, field="request_id", max_length=64)
        )
    if start_at is not None:
        statement = statement.where(SandboxRun.created_at >= start_at)
    if end_at is not None:
        statement = statement.where(SandboxRun.created_at <= end_at)
    return statement


async def list_runs_page(
    session: AsyncSession,
    *,
    client_id: str | None = None,
    tool_name: str | None = None,
    status: str | None = None,
    transport: str | None = None,
    mode: str | None = None,
    request_id: str | None = None,
    start: datetime | None = None,
    end: datetime | None = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[SandboxRun], bool]:
    limit, offset = normalize_page(limit, offset)
    statement = _filtered_runs(
        select(SandboxRun),
        client_id=client_id,
        tool_name=tool_name,
        status=status,
        transport=transport,
        mode=mode,
        request_id=request_id,
        start=start,
        end=end,
    )
    statement = statement.order_by(SandboxRun.created_at.desc(), SandboxRun.id.desc())
    statement = statement.limit(limit + 1).offset(offset)
    result = await session.execute(statement)
    rows = list(result.scalars().all())
    has_more = len(rows) > limit
    return rows[:limit], has_more


async def count_runs(
    session: AsyncSession,
    *,
    end: datetime | None = None,
    status: str | None = None,
) -> int:
    statement = _filtered_runs(
        select(func.count()).select_from(SandboxRun),
        end=end,
        status=status,
    )
    result = await session.execute(statement)
    return int(result.scalar_one())


async def delete_runs_before(
    session: AsyncSession,
    *,
    cutoff: datetime,
    batch_size: int = 1000,
) -> int:
    if not isinstance(cutoff, datetime):
        raise TypeError("cutoff must be a datetime")
    if (
        isinstance(batch_size, bool)
        or not isinstance(batch_size, int)
        or batch_size < 1
    ):
        raise ValueError("batch_size must be a positive integer")
    cutoff_at = as_utc(cutoff)

    deleted = 0
    while True:
        id_query = (
            select(SandboxRun.id)
            .where(SandboxRun.created_at < cutoff_at)
            .order_by(SandboxRun.id.asc())
            .limit(batch_size)
        )
        id_result = await session.execute(id_query)
        ids = list(id_result.scalars().all())
        if not ids:
            return deleted
        await session.execute(delete(SandboxRun).where(SandboxRun.id.in_(ids)))
        deleted += len(ids)
        if len(ids) < batch_size:
            return deleted


async def mark_stale_runs(session: AsyncSession, older_than: datetime) -> None:
    statement = (
        update(SandboxRun)
        .where(
            SandboxRun.status.in_((RUN_STATUS_RUNNING, "pending")),
            SandboxRun.created_at < as_utc(older_than),
        )
        .values(
            status=RUN_STATUS_FAILED,
            error_type=STALE_RUN_ERROR_TYPE,
            finished_at=utc_now(),
        )
    )
    await session.execute(statement)
