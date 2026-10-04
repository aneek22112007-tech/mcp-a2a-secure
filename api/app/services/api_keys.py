import hashlib
import hmac
import logging
import secrets
from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.bearer import API_KEY_TOKEN_PREFIX
from app.auth.principal import Principal
from app.auth.verifier import ApiKeyVerifier
from app.config import settings
from app.database import async_session_maker
from app.models.api_keys import ApiKey
from app.models.clients import Client
from app.repos.api_keys import create, get_by_prefix, mark_used

logger = logging.getLogger(__name__)


def _get_pepper() -> bytes:
    if settings.api_key_pepper:
        pepper_str = settings.api_key_pepper.get_secret_value()
    else:
        logger.warning(
            "API_KEY_PEPPER is not set. Falling back to default insecure pepper."
        )
        pepper_str = "default_dev_pepper"
    return pepper_str.encode("utf-8")


def _hash_secret(secret: str) -> str:
    """Calculates HMAC-SHA256 hash of the secret using the configured pepper."""
    return hmac.new(
        _get_pepper(),
        secret.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


async def generate_api_key(
    session: AsyncSession,
    client_id: str,
    name: str,
    scopes: list[str] | None = None,
    expires_at: datetime | None = None,
) -> tuple[ApiKey, str]:
    """Generates a secure API key and persists its metadata.

    Returns a tuple of (ApiKey, plaintext_key).
    The plaintext key is returned exactly once and is never persisted.
    """
    if scopes is not None:
        from app.auth.scopes import ALL_SCOPES

        invalid_scopes = [s for s in scopes if s not in ALL_SCOPES]
        if invalid_scopes:
            raise ValueError(f"Invalid scopes: {', '.join(invalid_scopes)}")
        # Dedupe while preserving order (optional, but standard)
        scopes = list(dict.fromkeys(scopes))

    prefix = secrets.token_hex(4)  # 8 hex chars
    secret = secrets.token_urlsafe(32)  # 43 base64 url-safe chars

    raw_key = f"{API_KEY_TOKEN_PREFIX}{prefix}_{secret}"
    key_hash = _hash_secret(secret)

    api_key = await create(
        session=session,
        client_id=client_id,
        key_hash=key_hash,
        key_prefix=prefix,
        name=name,
        scopes=scopes,
        expires_at=expires_at,
    )

    return api_key, raw_key


class HmacApiKeyVerifier(ApiKeyVerifier):
    async def verify(self, raw_key: str) -> Principal | None:
        """Verifies the raw key and returns a Principal if valid."""
        if not raw_key.startswith(API_KEY_TOKEN_PREFIX):
            return None

        without_main_prefix = raw_key[len(API_KEY_TOKEN_PREFIX) :]
        parts = without_main_prefix.split("_", 1)
        if len(parts) != 2:
            return None

        prefix, secret = parts

        async with async_session_maker() as session:
            api_key = await get_by_prefix(session, prefix)
            if api_key is None:
                return None

            # Check client is active
            client = await session.get(Client, api_key.client_id)
            if not client or client.status != "active":
                return None

            # Check revoked
            if api_key.revoked_at is not None:
                return None

            # Check expired
            if api_key.expires_at is not None and api_key.expires_at <= datetime.now(
                UTC
            ):
                return None

            # Verify hash securely
            expected_hash = _hash_secret(secret)
            if not hmac.compare_digest(api_key.key_hash, expected_hash):
                return None

            # Update last_used_at safely
            await mark_used(session, api_key.id)
            await session.commit()

            return Principal(
                api_key_id=api_key.id,
                client_id=api_key.client_id,
                key_prefix=api_key.key_prefix,
                scopes=frozenset(api_key.scopes),
            )
