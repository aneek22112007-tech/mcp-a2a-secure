"""Async persistence helpers for API key metadata.

``create`` accepts a hash and a prefix. It never accepts or returns a raw key,
and it does not log the hash.
"""

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.api_keys import ApiKey
from app.repos.common import as_utc, normalize_page, require_text
from app.repos.errors import ApiKeyNotFoundError


async def create(
    session: AsyncSession,
    *,
    client_id: str,
    key_hash: str,
    key_prefix: str,
    name: str,
    scopes: list[str] | None = None,
    expires_at: datetime | None = None,
) -> ApiKey:
    if not isinstance(client_id, str) or not client_id.strip():
        raise ValueError("client_id is required")
    api_key = ApiKey(
        client_id=client_id.strip(),
        key_hash=require_text(key_hash, field="key_hash", max_length=255),
        key_prefix=require_text(key_prefix, field="key_prefix", max_length=20),
        name=require_text(name, field="name", max_length=255),
        scopes=_scopes(scopes),
        expires_at=_optional_utc(expires_at),
    )
    session.add(api_key)
    await session.flush()
    return api_key


async def get_by_prefix(session: AsyncSession, key_prefix: str) -> ApiKey | None:
    if not isinstance(key_prefix, str) or not key_prefix:
        return None
    statement = select(ApiKey).where(ApiKey.key_prefix == key_prefix)
    result = await session.execute(statement)
    return result.scalar_one_or_none()


async def list_for_client(
    session: AsyncSession,
    client_id: str,
    *,
    limit: int = 50,
    offset: int = 0,
) -> list[ApiKey]:
    if not isinstance(client_id, str) or not client_id.strip():
        raise ValueError("client_id is required")
    limit, offset = normalize_page(limit, offset)
    statement = (
        select(ApiKey)
        .where(ApiKey.client_id == client_id)
        .order_by(ApiKey.created_at.asc(), ApiKey.id.asc())
        .limit(limit)
        .offset(offset)
    )
    result = await session.execute(statement)
    return list(result.scalars().all())


async def revoke(session: AsyncSession, api_key_id: str) -> ApiKey:
    api_key = await session.get(ApiKey, api_key_id)
    if api_key is None:
        raise ApiKeyNotFoundError(api_key_id)
    if api_key.revoked_at is None:
        api_key.revoked_at = datetime.now(UTC)
        await session.flush()
    return api_key


async def mark_used(
    session: AsyncSession,
    api_key_id: str,
    *,
    when: datetime | None = None,
) -> ApiKey:
    api_key = await session.get(ApiKey, api_key_id)
    if api_key is None:
        raise ApiKeyNotFoundError(api_key_id)
    api_key.last_used_at = as_utc(when) if when is not None else datetime.now(UTC)
    await session.flush()
    return api_key


def _scopes(scopes: list[str] | None) -> list[str]:
    if scopes is None:
        return []
    if not isinstance(scopes, list) or any(
        not isinstance(item, str) or not item for item in scopes
    ):
        raise ValueError("scopes must be a list of non-empty strings")
    return list(scopes)


def _optional_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if not isinstance(value, datetime):
        raise TypeError("expires_at must be a datetime")
    return as_utc(value)
