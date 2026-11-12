import math
import threading
import time
from collections.abc import Callable
from dataclasses import dataclass

from fastapi import Depends, HTTPException, Request

from app.audit.events import AuditRecord
from app.audit.redaction import current_request_id
from app.audit.sink import record_event
from app.auth.dependencies import authorize_route
from app.auth.principal import Principal
from app.config import settings

SHARED_SURFACE = "key"


@dataclass
class BucketState:
    tokens: float
    last_updated: float
    last_denied: float = 0.0


class TokenBucketRateLimiter:
    """A thread-safe, in-memory token bucket rate limiter.

    REST and MCP request surfaces share a single token bucket per API key
    (keyed by SHARED_SURFACE and api_key_id), preventing clients from doubling
    their allowed request rate across surfaces.

    NOTE: This implementation is process-local. In a multi-process deployment
    (e.g., Uvicorn with multiple workers), each process will have its own
    independent token bucket, meaning the effective rate limit will be
    capacity * number_of_workers.
    """

    def __init__(
        self,
        capacity: Callable[[], int] | None = None,
        refill_per_sec: Callable[[], float] | None = None,
    ) -> None:
        self._capacity = capacity
        self._refill = refill_per_sec
        self._buckets: dict[tuple[str, str], BucketState] = {}
        self._lock = threading.Lock()
        self.rejected_total = 0

    def acquire(self, surface: str, key_id: str) -> tuple[bool, float, bool]:
        """Attempt to acquire 1 token.

        Returns (allowed: bool, retry_after_s: float, should_audit: bool).
        """
        now = time.monotonic()
        capacity = self._capacity() if self._capacity else settings.rate_limit_capacity
        refill_rate = (
            self._refill() if self._refill else settings.rate_limit_refill_rate_per_sec
        )

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

            self.rejected_total += 1
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

ANALYST_SURFACE = "analyst"
analyst_limiter = TokenBucketRateLimiter(
    capacity=lambda: settings.analyst_rate_limit_capacity,
    refill_per_sec=lambda: settings.analyst_rate_limit_per_minute / 60.0,
)


async def analyst_rate_limit(request: Request) -> None:
    """One small bucket for POST /api/analyst/explain, separate from the shared bucket."""

    principal = getattr(request.state, "principal", None)
    if principal is None or not principal.api_key_id:
        raise HTTPException(status_code=401, detail="Authentication required.")

    allowed, retry_after, should_audit = analyst_limiter.acquire(
        ANALYST_SURFACE, principal.api_key_id
    )
    if allowed:
        return
    if should_audit:
        await record_event(
            AuditRecord(
                action="rate_limit.deny",
                decision="denied",
                status="denied",
                reason="rate_limit_exceeded surface=analyst",
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


async def rate_limit_dependency(
    request: Request,
    principal: Principal | None = Depends(authorize_route),  # noqa: B008
) -> None:
    if not principal or not principal.api_key_id:
        return

    allowed, retry_after, should_audit = limiter.acquire(
        SHARED_SURFACE, principal.api_key_id
    )
    if not allowed:
        if should_audit:
            await record_event(
                AuditRecord(
                    action="rate_limit.deny",
                    decision="denied",
                    status="denied",
                    reason="rate_limit_exceeded surface=rest",
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
            SHARED_SURFACE, principal.api_key_id
        )
        if not allowed:
            if should_audit:
                await record_event(
                    AuditRecord(
                        action="rate_limit.deny",
                        decision="denied",
                        status="denied",
                        reason="rate_limit_exceeded surface=mcp",
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
