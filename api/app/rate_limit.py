import math
import threading
import time
from dataclasses import dataclass

from fastapi import Depends, HTTPException, Request

from app.audit.events import AuditRecord
from app.audit.redaction import current_request_id
from app.audit.sink import record_event
from app.auth.dependencies import authorize_route
from app.auth.principal import Principal
from app.config import settings


@dataclass
class BucketState:
    tokens: float
    last_updated: float
    last_denied: float = 0.0


class TokenBucketRateLimiter:
    """A thread-safe, in-memory token bucket rate limiter.

    NOTE: This implementation is process-local. In a multi-process deployment
    (e.g., Uvicorn with multiple workers), each process will have its own
    independent token bucket, meaning the effective rate limit will be
    capacity * number_of_workers.
    """

    def __init__(self) -> None:
        self._buckets: dict[tuple[str, str], BucketState] = {}
        self._lock = threading.Lock()

    def acquire(self, surface: str, key_id: str) -> tuple[bool, float, bool]:
        """Attempt to acquire 1 token.

        Returns (allowed: bool, retry_after_s: float, should_audit: bool).
        """
        now = time.monotonic()
        capacity = settings.rate_limit_capacity
        refill_rate = settings.rate_limit_refill_rate_per_sec

        key = (surface, key_id)

        with self._lock:
            bucket = self._buckets.get(key)
            if not bucket:
                bucket = BucketState(tokens=float(capacity), last_updated=now)
                self._buckets[key] = bucket

            elapsed = now - bucket.last_updated
            new_tokens = min(float(capacity), bucket.tokens + elapsed * refill_rate)

            if new_tokens >= 1.0:
                bucket.tokens = new_tokens - 1.0
                bucket.last_updated = now
                bucket.last_denied = 0.0
                return True, 0.0, False

            bucket.tokens = new_tokens
            bucket.last_updated = now
            retry_after = (1.0 - new_tokens) / refill_rate

            window = 1.0 / refill_rate if refill_rate > 0 else 1.0
            should_audit = False
            if now - bucket.last_denied >= window:
                should_audit = True
                bucket.last_denied = now

            return False, max(0.0, retry_after), should_audit


limiter = TokenBucketRateLimiter()


async def rate_limit_dependency(
    request: Request,
    principal: Principal | None = Depends(authorize_route),  # noqa: B008
) -> None:
    if not principal or not principal.api_key_id:
        return

    allowed, retry_after, should_audit = limiter.acquire("rest", principal.api_key_id)
    if not allowed:
        if should_audit:
            await record_event(
                AuditRecord(
                    action="rate_limit.deny",
                    decision="denied",
                    status="denied",
                    reason="rate_limit_exceeded",
                    status_code=429,
                    error_code="RATE_LIMITED",
                    request_id=current_request_id(request.scope),
                    **AuditRecord.actor_fields(principal),
                ),
                required=False,
            )

        raise HTTPException(
            status_code=429,
            detail="Too Many Requests",
            headers={"Retry-After": str(math.ceil(retry_after))},
        )


class McpRateLimitMiddleware:
    """Rate limits MCP requests before they reach the execution path."""

    def __init__(self, app) -> None:
        self.app = app

    async def __call__(self, scope, receive, send) -> None:
        from app.middleware import _send_error

        if scope["type"] not in ("http", "websocket"):
            await self.app(scope, receive, send)
            return

        principal = scope.get("mcp_guard.principal")
        if not principal or not principal.api_key_id:
            await self.app(scope, receive, send)
            return

        allowed, retry_after, should_audit = limiter.acquire(
            "mcp", principal.api_key_id
        )
        if not allowed:
            if should_audit:
                await record_event(
                    AuditRecord(
                        action="rate_limit.deny",
                        decision="denied",
                        status="denied",
                        reason="rate_limit_exceeded",
                        status_code=429,
                        error_code="RATE_LIMITED",
                        request_id=current_request_id(scope),
                        **AuditRecord.actor_fields(principal),
                    ),
                    required=False,
                )

            await _send_error(
                send,
                None,
                429,
                "RATE_LIMITED",
                "Too Many Requests",
                extra_headers=[
                    (b"retry-after", str(math.ceil(retry_after)).encode("ascii"))
                ],
            )
            return

        await self.app(scope, receive, send)
