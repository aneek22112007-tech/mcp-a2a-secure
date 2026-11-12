"""One Valkey client for state shared by API replicas.

When REDIS_URL is unset, start() does nothing and every helper reports off.
"""

from __future__ import annotations

import logging
import math
import time
from typing import TYPE_CHECKING, Literal

from redis.asyncio import Redis

from app.config import settings

if TYPE_CHECKING:
    from redis.commands.core import AsyncScript

    from app.rate_limit import TokenBucketRateLimiter

logger = logging.getLogger(__name__)

Status = Literal["off", "ok", "unavailable"]

_RATE_LIMIT_LUA = """
local t = redis.call('TIME')
local now = tonumber(t[1]) + tonumber(t[2]) / 1000000
local cap = tonumber(ARGV[1])
local rate = tonumber(ARGV[2])
local b = redis.call('HMGET', KEYS[1], 'tokens', 'ts', 'denied')
local tokens = tonumber(b[1]) or cap
local ts = tonumber(b[2]) or now
local denied = tonumber(b[3]) or 0
tokens = math.min(cap, tokens + math.max(0, now - ts) * rate)
local allowed, retry, audit = 0, 0, 0
if tokens >= 1 then
  tokens = tokens - 1
  allowed = 1
  denied = 0
else
  retry = (1 - tokens) / rate
  if now - denied >= 1 / rate then
    audit = 1
    denied = now
  end
end
redis.call('HSET', KEYS[1], 'tokens', tostring(tokens), 'ts', tostring(now), 'denied', tostring(denied))
redis.call('PEXPIRE', KEYS[1], ARGV[3])
return {allowed, tostring(retry), audit}
"""

_client: Redis | None = None
_status: Status = "off"
_last_warn_at = 0.0
_rate_script: AsyncScript | None = None
_rate_script_client: Redis | None = None


def status() -> Status:
    return _status


def client() -> Redis | None:
    """Return the client only while the last check says it is usable."""

    if _status != "ok":
        return None
    return _client


def note_failure(exc: BaseException) -> None:
    """Remember that Valkey is down and log the exception type at most once a minute."""

    global _status, _last_warn_at
    if _status == "off":
        return
    _status = "unavailable"
    now = time.monotonic()
    if now - _last_warn_at < 60:
        return
    _last_warn_at = now
    logger.warning("shared state operation failed: %s", type(exc).__name__)


def note_ok() -> None:
    global _status
    if _client is not None:
        _status = "ok"


async def start() -> None:
    """Open the client. A missing URL leaves the helpers off."""

    global _client, _status
    if settings.redis_url is None:
        _client = None
        _status = "off"
        return
    opened: Redis | None = None
    try:
        opened = Redis.from_url(
            settings.redis_url.get_secret_value(),
            socket_timeout=0.25,
            socket_connect_timeout=0.5,
            health_check_interval=15,
            decode_responses=False,
        )
        await opened.ping()
    except Exception as exc:  # noqa: BLE001 - Valkey down must not stop the API
        if opened is not None:
            try:
                await opened.aclose()
            except Exception:  # noqa: BLE001, S110 - close is best-effort
                pass
        _client = None
        _status = "unavailable"
        note_failure(exc)
        return
    _client = opened
    _status = "ok"


def _script_for(opened: Redis) -> AsyncScript:
    global _rate_script, _rate_script_client
    if _rate_script is None or _rate_script_client is not opened:
        _rate_script = opened.register_script(_RATE_LIMIT_LUA)
        _rate_script_client = opened
    return _rate_script


async def acquire_shared(
    surface: str,
    key_id: str,
    local: TokenBucketRateLimiter,
    capacity: float,
    refill: float,
) -> tuple[bool, float, bool]:
    """Take one token from the shared bucket, or from the process bucket if Valkey is down."""

    opened = client()
    if opened is None or refill <= 0:
        return local.acquire(surface, key_id)
    ttl_ms = int(math.ceil(capacity / refill) * 1000) + 60000
    try:
        result = await _script_for(opened)(
            keys=[f"mcpg:rl:{surface}:{key_id}"],
            args=[capacity, refill, ttl_ms],
        )
    except Exception as exc:  # noqa: BLE001 - fall back to the process bucket
        note_failure(exc)
        return local.acquire(surface, key_id)
    note_ok()
    allowed = int(result[0]) == 1
    retry = float(result[1])
    if not allowed:
        local.rejected_total += 1
    return allowed, retry, int(result[2]) == 1


async def stop() -> None:
    """Close the client. Later helpers report off only when no URL is configured."""

    global _client, _status, _rate_script, _rate_script_client
    opened = _client
    _client = None
    _rate_script = None
    _rate_script_client = None
    _status = "off" if settings.redis_url is None else "unavailable"
    if opened is None:
        return
    try:
        await opened.aclose()
    except Exception as exc:  # noqa: BLE001 - close is best-effort
        note_failure(exc)
