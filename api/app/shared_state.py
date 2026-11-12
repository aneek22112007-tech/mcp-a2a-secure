"""One Valkey client for state shared by API replicas.

When REDIS_URL is unset, start() does nothing and every helper reports off.
"""

from __future__ import annotations

import logging
import time
from typing import Literal

from redis.asyncio import Redis

from app.config import settings

logger = logging.getLogger(__name__)

Status = Literal["off", "ok", "unavailable"]

_client: Redis | None = None
_status: Status = "off"
_last_warn_at = 0.0


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


async def stop() -> None:
    """Close the client. Later helpers report off only when no URL is configured."""

    global _client, _status
    opened = _client
    _client = None
    _status = "off" if settings.redis_url is None else "unavailable"
    if opened is None:
        return
    try:
        await opened.aclose()
    except Exception as exc:  # noqa: BLE001 - close is best-effort
        note_failure(exc)
