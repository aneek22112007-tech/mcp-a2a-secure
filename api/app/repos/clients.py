"""Async persistence helpers for clients.

Functions flush so generated ids are available, and they do not commit.
The caller owns the transaction.
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.clients import CLIENT_STATUS_ACTIVE, CLIENT_STATUS_INACTIVE, Client
from app.repos.common import normalize_page, require_text
from app.repos.errors import ClientNotFoundError


async def create(
    session: AsyncSession,
    *,
    name: str,
    status: str = CLIENT_STATUS_ACTIVE,
) -> Client:
    client = Client(
        name=require_text(name, field="name", max_length=255), status=_status(status)
    )
    session.add(client)
    await session.flush()
    return client


async def get(session: AsyncSession, client_id: str) -> Client | None:
    if not client_id:
        return None
    return await session.get(Client, client_id)


async def list(
    session: AsyncSession,
    *,
    status: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[Client]:
    limit, offset = normalize_page(limit, offset)
    statement = select(Client).order_by(Client.created_at.asc(), Client.id.asc())
    if status is not None:
        statement = statement.where(Client.status == _status(status))
    statement = statement.limit(limit).offset(offset)
    result = await session.execute(statement)
    return result.scalars().all()


async def deactivate(session: AsyncSession, client_id: str) -> Client:
    """Mark a client inactive. The row is not deleted."""

    client = await session.get(Client, client_id)
    if client is None:
        raise ClientNotFoundError(client_id)
    client.status = CLIENT_STATUS_INACTIVE
    await session.flush()
    return client


def _status(status: str) -> str:
    return require_text(status, field="status", max_length=50)
