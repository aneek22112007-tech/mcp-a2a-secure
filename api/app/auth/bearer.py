import logging
from collections.abc import Iterable

from app.auth.principal import Principal
from app.auth.verifier import get_api_key_verifier

logger = logging.getLogger(__name__)

API_KEY_TOKEN_PREFIX = "mcpg_"
MAX_API_KEY_LENGTH = 128


class AuthenticationError(Exception):
    pass


AUTH_FAILURE_REASONS = frozenset({"missing", "duplicate", "malformed", "rejected"})


def authentication_reason(exc: AuthenticationError) -> str:
    if (
        exc.args
        and isinstance(exc.args[0], str)
        and exc.args[0] in AUTH_FAILURE_REASONS
    ):
        return exc.args[0]
    return "rejected"


def bearer_challenge() -> str:
    return "Bearer"


def insufficient_scope_challenge(scope: str) -> str:
    return f'Bearer error="insufficient_scope", scope="{scope}"'


def extract_bearer_token(raw_headers: Iterable[tuple[bytes, bytes]]) -> str:
    auth_header = None
    for name, value in raw_headers:
        if name.lower() == b"authorization":
            if auth_header is not None:
                raise AuthenticationError("duplicate")
            auth_header = value

    if auth_header is None:
        raise AuthenticationError("missing")

    try:
        auth_str = auth_header.decode("ascii")
    except UnicodeDecodeError:
        raise AuthenticationError("malformed")

    parts = auth_str.split(" ", 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise AuthenticationError("malformed")

    token = parts[1]
    if " " in token:
        raise AuthenticationError("malformed")
    if not token.startswith(API_KEY_TOKEN_PREFIX):
        raise AuthenticationError("rejected")
    if not (1 <= len(token) <= MAX_API_KEY_LENGTH):
        raise AuthenticationError("rejected")

    return token


async def authenticate(raw_headers: Iterable[tuple[bytes, bytes]]) -> Principal:
    try:
        token = extract_bearer_token(raw_headers)
    except AuthenticationError as exc:
        logger.warning("[auth] Request denied reason=%s", exc.args[0])
        raise

    principal = await get_api_key_verifier().verify(token)
    if principal is None:
        logger.warning("[auth] Request denied reason=rejected")
        raise AuthenticationError("rejected")

    logger.info("[auth] Request authenticated key_prefix=%s", principal.key_prefix)
    return principal
