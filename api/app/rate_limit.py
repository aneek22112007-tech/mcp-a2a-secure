import threading
import time
from dataclasses import dataclass

from app.config import settings


@dataclass
class BucketState:
    tokens: float
    last_updated: float


class TokenBucketRateLimiter:
    """A thread-safe, in-memory token bucket rate limiter.

    NOTE: This implementation is process-local. In a multi-process deployment
    (e.g., Uvicorn with multiple workers), each process will have its own
    independent token bucket, meaning the effective rate limit will be
    capacity * number_of_workers.
    """

    def __init__(self) -> None:
        self._buckets: dict[str, BucketState] = {}
        self._lock = threading.Lock()

    def acquire(self, key_id: str) -> tuple[bool, float]:
        """Attempt to acquire 1 token.

        Returns (allowed: bool, retry_after_s: float).
        If allowed is False, retry_after_s indicates seconds until 1 token is available.
        """
        now = time.monotonic()
        capacity = settings.rate_limit_capacity
        refill_rate = settings.rate_limit_refill_rate_per_sec

        with self._lock:
            bucket = self._buckets.get(key_id)
            if not bucket:
                bucket = BucketState(tokens=float(capacity), last_updated=now)
                self._buckets[key_id] = bucket

            elapsed = now - bucket.last_updated
            new_tokens = min(float(capacity), bucket.tokens + elapsed * refill_rate)

            if new_tokens >= 1.0:
                bucket.tokens = new_tokens - 1.0
                bucket.last_updated = now
                return True, 0.0

            bucket.tokens = new_tokens
            bucket.last_updated = now
            retry_after = (1.0 - new_tokens) / refill_rate
            return False, max(0.0, retry_after)


limiter = TokenBucketRateLimiter()
