"""Cryptographic signing and verification for A2A delegation grants.

Every manager-to-worker delegation is wrapped in an HMAC-SHA256 signed token
bound to:
- ``task_id`` — prevents cross-task replay
- ``manager_key_prefix`` and ``worker_key_prefix`` — binds both identities
- ``delegated_scopes`` — prevents scope tampering or escalation
- ``task_hash`` — SHA-256 hex digest of the exact task text delivered to the worker
- ``iat`` / ``exp`` — short-lived validity window (default 120 seconds)
- ``nonce`` — random 128-bit hex identifier per signed grant

Key resolution:
- Uses ``A2A_SIGNING_KEY`` (``SecretStr``) when configured.
- When unset, lazily generates an in-memory 32-byte random key using
  ``secrets.token_bytes(32)`` and emits a startup warning via
  ``init_a2a_signing_key()``.
- Neither the signing key nor the signed token is ever logged or included in
  error messages or audit rows.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import secrets
import time
from dataclasses import dataclass

from app.agents.a2a.delegation import DelegationContext
from app.config import settings

logger = logging.getLogger(__name__)

SIGNING_ALGORITHM = "HMAC-SHA256"
TOKEN_VERSION = 1
DEFAULT_TTL_S = 120
_MAX_CLOCK_SKEW_S = 30
_DOMAIN_PREFIX = b"mcpg-a2a-v1."

# Ephemeral per-process fallback key generated only when A2A_SIGNING_KEY is unset.
_ephemeral_key: bytes | None = None


class DelegationVerificationError(ValueError):
    """Raised when a signed A2A delegation token fails any verification check.

    ``reason_code`` is a short, audit-safe token (no secrets or raw tokens).
    """

    def __init__(self, reason_code: str, message: str) -> None:
        self.reason_code = reason_code
        super().__init__(message)


@dataclass(frozen=True, slots=True)
class VerifiedDelegation:
    """Verified claims extracted from an authentic A2A delegation token."""

    task_id: str
    manager_key_prefix: str
    worker_key_prefix: str
    delegated_scopes: frozenset[str]
    task_hash: str
    issued_at: int
    expires_at: int
    nonce: str


def is_signing_key_configured() -> bool:
    """Return True when A2A_SIGNING_KEY is explicitly configured."""
    secret = settings.a2a_signing_key
    return secret is not None and bool(secret.get_secret_value().strip())


def init_a2a_signing_key() -> None:
    """Initialize A2A signing key at startup and warn if using ephemeral fallback.

    Called from the FastAPI lifespan hook so module imports remain quiet.
    """
    if is_signing_key_configured():
        logger.info(
            "A2A delegation signing active algorithm=%s key_source=configured",
            SIGNING_ALGORITHM,
        )
        return

    _get_or_create_ephemeral_key()
    if settings.is_production_like or settings.multi_instance:
        logger.warning(
            "A2A_SIGNING_KEY is not set in a production or multi-instance "
            "environment; using an ephemeral per-process %s key. Set "
            "A2A_SIGNING_KEY so all replicas share the same signing key.",
            SIGNING_ALGORITHM,
        )
    else:
        logger.warning(
            "A2A_SIGNING_KEY is not set; using an ephemeral per-process %s key "
            "for this process lifetime.",
            SIGNING_ALGORITHM,
        )


def _get_or_create_ephemeral_key() -> bytes:
    global _ephemeral_key
    if _ephemeral_key is None:
        _ephemeral_key = secrets.token_bytes(32)
    return _ephemeral_key


def _resolve_signing_key() -> bytes:
    """Return raw HMAC key bytes from A2A_SIGNING_KEY or the ephemeral fallback."""
    secret = settings.a2a_signing_key
    if secret is not None:
        raw = secret.get_secret_value().strip()
        if raw:
            return raw.encode("utf-8")
    return _get_or_create_ephemeral_key()


def hash_task_input(task_input: str) -> str:
    """Return the SHA-256 hex digest of the task text."""
    return hashlib.sha256(task_input.encode("utf-8")).hexdigest()


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64url_decode(segment: str) -> bytes:
    if not segment:
        raise ValueError("empty segment")
    padding = "=" * (-len(segment) % 4)
    return base64.urlsafe_b64decode(segment + padding)


def _compute_signature(key: bytes, payload_b64: str) -> bytes:
    message = _DOMAIN_PREFIX + payload_b64.encode("ascii")
    return hmac.new(key, message, hashlib.sha256).digest()


def sign_delegation(
    *,
    task_id: str,
    task_input: str,
    delegation: DelegationContext,
    ttl_s: int = DEFAULT_TTL_S,
    now: int | None = None,
) -> str:
    """Create a signed HMAC-SHA256 delegation token for one manager-to-worker hop."""
    if not task_id or not task_id.strip():
        raise ValueError("task_id must be non-empty")
    if ttl_s <= 0:
        raise ValueError("ttl_s must be positive")

    issued_at = int(time.time()) if now is None else int(now)
    expires_at = issued_at + int(ttl_s)
    payload = {
        "v": TOKEN_VERSION,
        "alg": SIGNING_ALGORITHM,
        "task_id": task_id,
        "manager_key_prefix": delegation.manager_key_prefix,
        "worker_key_prefix": delegation.worker_key_prefix,
        "delegated_scopes": sorted(delegation.delegated_scopes),
        "task_hash": hash_task_input(task_input),
        "iat": issued_at,
        "exp": expires_at,
        "nonce": secrets.token_hex(16),
    }
    payload_bytes = json.dumps(
        payload,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    payload_b64 = _b64url_encode(payload_bytes)
    sig_bytes = _compute_signature(_resolve_signing_key(), payload_b64)
    sig_b64 = _b64url_encode(sig_bytes)
    return f"{payload_b64}.{sig_b64}"


def verify_delegation(
    token: str | None,
    *,
    expected_task_id: str,
    expected_task_input: str,
    expected_delegation: DelegationContext,
    now: int | None = None,
) -> VerifiedDelegation:
    """Verify a signed delegation token and its bindings. Fails closed on any error."""
    if not isinstance(token, str) or not token.strip():
        raise DelegationVerificationError(
            "missing_token",
            "Missing signed delegation token.",
        )

    parts = token.split(".")
    if len(parts) != 2 or not parts[0] or not parts[1]:
        raise DelegationVerificationError(
            "malformed_token",
            "Malformed delegation token.",
        )
    payload_b64, sig_b64 = parts

    try:
        payload_b64.encode("ascii")
        actual_sig = _b64url_decode(sig_b64)
    except (UnicodeEncodeError, ValueError):
        raise DelegationVerificationError(
            "malformed_token",
            "Malformed delegation token encoding.",
        ) from None

    # Verify HMAC signature in constant time before trusting or parsing claims.
    expected_sig = _compute_signature(_resolve_signing_key(), payload_b64)
    if not hmac.compare_digest(actual_sig, expected_sig):
        raise DelegationVerificationError(
            "invalid_signature",
            "Invalid delegation token signature.",
        )

    try:
        payload = json.loads(_b64url_decode(payload_b64).decode("utf-8"))
    except (UnicodeDecodeError, ValueError):
        raise DelegationVerificationError(
            "invalid_payload",
            "Invalid delegation token payload.",
        ) from None

    if not isinstance(payload, dict):
        raise DelegationVerificationError(
            "invalid_payload",
            "Invalid delegation token payload.",
        )

    if payload.get("v") != TOKEN_VERSION or payload.get("alg") != SIGNING_ALGORITHM:
        raise DelegationVerificationError(
            "unsupported_token",
            "Unsupported delegation token version or algorithm.",
        )

    task_id = payload.get("task_id")
    manager_prefix = payload.get("manager_key_prefix")
    worker_prefix = payload.get("worker_key_prefix")
    scopes_raw = payload.get("delegated_scopes")
    task_hash = payload.get("task_hash")
    iat = payload.get("iat")
    exp = payload.get("exp")
    nonce = payload.get("nonce")

    if (
        not isinstance(task_id, str)
        or not isinstance(manager_prefix, str)
        or not isinstance(worker_prefix, str)
        or not isinstance(scopes_raw, list)
        or not all(isinstance(s, str) for s in scopes_raw)
        or not isinstance(task_hash, str)
        or not isinstance(iat, int)
        or isinstance(iat, bool)
        or not isinstance(exp, int)
        or isinstance(exp, bool)
        or not isinstance(nonce, str)
        or not nonce
    ):
        raise DelegationVerificationError(
            "invalid_payload",
            "Delegation token claims are incomplete or invalid.",
        )

    if exp <= iat:
        raise DelegationVerificationError(
            "invalid_payload",
            "Delegation token validity window is invalid.",
        )

    current_ts = int(time.time()) if now is None else int(now)
    if current_ts > exp:
        raise DelegationVerificationError(
            "expired",
            "Delegation token has expired.",
        )
    if iat > current_ts + _MAX_CLOCK_SKEW_S:
        raise DelegationVerificationError(
            "not_yet_valid",
            "Delegation token is not yet valid.",
        )

    if task_id != expected_task_id:
        raise DelegationVerificationError(
            "task_id_mismatch",
            "Delegation token does not match task ID.",
        )

    if manager_prefix != expected_delegation.manager_key_prefix:
        raise DelegationVerificationError(
            "manager_mismatch",
            "Delegation token does not match manager identity.",
        )

    if worker_prefix != expected_delegation.worker_key_prefix:
        raise DelegationVerificationError(
            "worker_mismatch",
            "Delegation token does not match worker identity.",
        )

    token_scopes = frozenset(scopes_raw)
    if token_scopes != expected_delegation.delegated_scopes:
        raise DelegationVerificationError(
            "scopes_mismatch",
            "Delegation token scopes do not match attenuated scopes.",
        )

    expected_hash = hash_task_input(expected_task_input)
    if not hmac.compare_digest(task_hash, expected_hash):
        raise DelegationVerificationError(
            "task_hash_mismatch",
            "Delegation token does not match task payload.",
        )

    return VerifiedDelegation(
        task_id=task_id,
        manager_key_prefix=manager_prefix,
        worker_key_prefix=worker_prefix,
        delegated_scopes=token_scopes,
        task_hash=task_hash,
        issued_at=iat,
        expires_at=exp,
        nonce=nonce,
    )
