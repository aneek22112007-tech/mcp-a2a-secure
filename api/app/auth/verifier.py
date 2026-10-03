from typing import Protocol

from app.auth.principal import Principal


class ApiKeyVerifier(Protocol):
    """
    Contract for verifying API keys.

    The implementation opens its own DB session (app.database.async_session_maker)
    because it is also called from plain ASGI with no FastAPI DI. It returns None
    for unknown prefix, hash mismatch, revoked_at set, expires_at <= now, or client
    status != "active". It uses constant-time comparison, never logs the raw key
    or hash, and may raise on infrastructure failure.
    """

    async def verify(self, raw_key: str) -> Principal | None: ...


class DenyAllVerifier:
    async def verify(self, raw_key: str) -> Principal | None:
        return None


_current_verifier: ApiKeyVerifier = DenyAllVerifier()


def get_api_key_verifier() -> ApiKeyVerifier:
    return _current_verifier


def set_api_key_verifier(verifier: ApiKeyVerifier) -> None:
    global _current_verifier
    _current_verifier = verifier
