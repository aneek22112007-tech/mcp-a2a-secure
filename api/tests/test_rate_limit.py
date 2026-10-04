import time

from app.config import settings
from app.rate_limit import TokenBucketRateLimiter


def test_rate_limiter_basics(monkeypatch):
    monkeypatch.setattr(settings, "rate_limit_capacity", 2)
    monkeypatch.setattr(settings, "rate_limit_refill_rate_per_sec", 10.0)

    limiter = TokenBucketRateLimiter()

    # Should allow 2 requests immediately
    allowed, retry = limiter.acquire("key1")
    assert allowed is True
    assert retry == 0.0

    allowed, retry = limiter.acquire("key1")
    assert allowed is True
    assert retry == 0.0

    # Third request should be blocked
    allowed, retry = limiter.acquire("key1")
    assert allowed is False
    assert retry > 0.0


def test_rate_limiter_independent_buckets(monkeypatch):
    monkeypatch.setattr(settings, "rate_limit_capacity", 1)
    monkeypatch.setattr(settings, "rate_limit_refill_rate_per_sec", 10.0)

    limiter = TokenBucketRateLimiter()

    allowed, _ = limiter.acquire("key1")
    assert allowed is True

    allowed, _ = limiter.acquire("key1")
    assert allowed is False

    # key2 should have its own bucket
    allowed, _ = limiter.acquire("key2")
    assert allowed is True


def test_rate_limiter_refill(monkeypatch):
    monkeypatch.setattr(settings, "rate_limit_capacity", 1)
    # Refill 10 tokens per second (0.1s per token)
    monkeypatch.setattr(settings, "rate_limit_refill_rate_per_sec", 10.0)

    limiter = TokenBucketRateLimiter()

    # Consume the only token
    allowed, _ = limiter.acquire("key1")
    assert allowed is True

    # Should be denied immediately
    allowed, retry = limiter.acquire("key1")
    assert allowed is False
    assert retry > 0

    # Wait for refill
    time.sleep(retry + 0.01)

    # Should be allowed now
    allowed, _ = limiter.acquire("key1")
    assert allowed is True
