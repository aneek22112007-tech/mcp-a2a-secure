"""Async persistence helpers for A2A task rows.

All helpers flush but do not commit; the caller owns the transaction.
The exception is ``finish``, which is called from background async code
and commits itself via its own session.
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.a2a_tasks import (
    A2A_STATUS_BLOCKED,
    A2A_STATUS_CANCELLED,
    A2A_STATUS_COMPLETED,
    A2A_STATUS_FAILED,
    A2A_STATUS_PENDING,
    A2A_STATUS_RUNNING,
    A2A_VALID_STATUSES,
    A2ATask,
)


async def create_task(
    session: AsyncSession,
    *,
    task_input: str,
    manager_client_id: str | None = None,
    manager_key_prefix: str | None = None,
    worker_key_prefix: str | None = None,
    delegated_scopes: list[str] | None = None,
    manager_request_id: str | None = None,
) -> A2ATask:
    task = A2ATask(
        status=A2A_STATUS_PENDING,
        task_input=_clip(task_input, 8_000),
        manager_client_id=manager_client_id,
        manager_key_prefix=manager_key_prefix,
        worker_key_prefix=worker_key_prefix,
        delegated_scopes=",".join(delegated_scopes) if delegated_scopes else None,
        manager_request_id=manager_request_id,
    )
    session.add(task)
    await session.flush()
    return task


async def mark_running(session: AsyncSession, task_id: str) -> A2ATask:
    task = await _get_or_raise(session, task_id)
    task.status = A2A_STATUS_RUNNING
    task.started_at = datetime.now(UTC)
    await session.flush()
    return task


async def mark_completed(
    session: AsyncSession, task_id: str, *, result: str
) -> A2ATask:
    task = await _get_or_raise(session, task_id)
    task.status = A2A_STATUS_COMPLETED
    task.result = _clip(result, 10_000)
    task.finished_at = datetime.now(UTC)
    await session.flush()
    return task


async def mark_failed(session: AsyncSession, task_id: str, *, error: str) -> A2ATask:
    task = await _get_or_raise(session, task_id)
    task.status = A2A_STATUS_FAILED
    task.error = _clip(error, 2_000)
    task.finished_at = datetime.now(UTC)
    await session.flush()
    return task


async def mark_blocked(session: AsyncSession, task_id: str, *, error: str) -> A2ATask:
    task = await _get_or_raise(session, task_id)
    task.status = A2A_STATUS_BLOCKED
    task.error = _clip(error, 2_000)
    task.finished_at = datetime.now(UTC)
    await session.flush()
    return task


async def mark_cancelled(session: AsyncSession, task_id: str) -> A2ATask:
    task = await _get_or_raise(session, task_id)
    task.status = A2A_STATUS_CANCELLED
    task.finished_at = datetime.now(UTC)
    await session.flush()
    return task


async def get_task(session: AsyncSession, task_id: str) -> A2ATask | None:
    return await session.get(A2ATask, task_id)


async def list_tasks(
    session: AsyncSession,
    *,
    manager_client_id: str | None = None,
    status: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[A2ATask]:
    stmt = select(A2ATask)
    if manager_client_id is not None:
        stmt = stmt.where(A2ATask.manager_client_id == manager_client_id)
    if status is not None:
        if status not in A2A_VALID_STATUSES:
            raise ValueError(f"Unknown status: {status!r}")
        stmt = stmt.where(A2ATask.status == status)
    stmt = (
        stmt.order_by(A2ATask.created_at.desc(), A2ATask.id.desc())
        .limit(min(max(1, limit), 200))
        .offset(max(0, offset))
    )
    result = await session.execute(stmt)
    return list(result.scalars().all())


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _get_or_raise(session: AsyncSession, task_id: str) -> A2ATask:
    task = await session.get(A2ATask, task_id)
    if task is None:
        raise KeyError(f"A2ATask {task_id!r} not found")
    return task


def _clip(text: str | None, max_len: int) -> str | None:
    if text is None:
        return None
    if len(text) <= max_len:
        return text
    return text[:max_len] + " [truncated]"
