import time

from app.config import settings
from app.rate_limit import TokenBucketRateLimiter


def test_rate_limiter_basics(monkeypatch):
    monkeypatch.setattr(settings, "rate_limit_capacity", 2)
    monkeypatch.setattr(settings, "rate_limit_refill_rate_per_sec", 10.0)

    limiter = TokenBucketRateLimiter()

    allowed, retry, _ = limiter.acquire("rest", "key1")
    assert allowed is True
    assert retry == 0.0

    allowed, retry, _ = limiter.acquire("rest", "key1")
    assert allowed is True
    assert retry == 0.0

    allowed, retry, should_audit = limiter.acquire("rest", "key1")
    assert allowed is False
    assert retry > 0.0
    assert should_audit is True


def test_rate_limiter_independent_buckets(monkeypatch):
    monkeypatch.setattr(settings, "rate_limit_capacity", 1)
    monkeypatch.setattr(settings, "rate_limit_refill_rate_per_sec", 10.0)

    limiter = TokenBucketRateLimiter()

    allowed, _, _ = limiter.acquire("rest", "key1")
    assert allowed is True

    allowed, _, _ = limiter.acquire("rest", "key1")
    assert allowed is False

    allowed, _, _ = limiter.acquire("rest", "key2")
    assert allowed is True

    allowed, _, _ = limiter.acquire("mcp", "key1")
    assert allowed is True


def test_rate_limiter_refill(monkeypatch):
    monkeypatch.setattr(settings, "rate_limit_capacity", 1)
    monkeypatch.setattr(settings, "rate_limit_refill_rate_per_sec", 10.0)

    limiter = TokenBucketRateLimiter()

    allowed, _, _ = limiter.acquire("rest", "key1")
    assert allowed is True

    allowed, retry, should_audit = limiter.acquire("rest", "key1")
    assert allowed is False
    assert retry > 0
    assert should_audit is True

    allowed, retry, should_audit = limiter.acquire("rest", "key1")
    assert allowed is False
    assert should_audit is False  # Throttled

    time.sleep(retry + 0.01)

    allowed, _, _ = limiter.acquire("rest", "key1")
    assert allowed is True
