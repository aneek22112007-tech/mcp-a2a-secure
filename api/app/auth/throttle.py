"""Failed-authentication throttle (per client IP, fixed window, in-process).

Maintains an OrderedDict LRU of at most ``settings.auth_failure_max_tracked_ips``
buckets.  Each bucket is a ``(window_start, count, audited)`` tuple.

Thread-safety: CPython GIL guarantees atomicity of dict operations on a single
thread; this is sufficient for asyncio (single-threaded) workloads.
"""

from __future__ import annotations

import math
import time
from collections import OrderedDict

from app.audit.events import ACTION_AUTH_DENY, STATUS_DENIED, AuditRecord
from app.audit.redaction import current_client_ip, current_request_id
from app.audit.sink import record_event
from app.config import settings
from app.models.audit_events import AUDIT_DECISION_DENIED


class AuthFailureThrottle:
    """Fixed-window per-IP authentication failure counter."""

    def __init__(self) -> None:
        # OrderedDict maintains insertion order for O(1) LRU eviction.
        # Value: (window_start: float, count: int, audited: bool)
        self._buckets: OrderedDict[str, tuple[float, int, bool]] = OrderedDict()

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _key(self, ip: str) -> str:
        """Normalise an arbitrary string to a safe key."""
        stripped = ip.strip()
        return stripped if stripped else "unknown"

    def _evict_if_full(self) -> None:
        max_ips = settings.auth_failure_max_tracked_ips
        while len(self._buckets) >= max_ips:
            self._buckets.popitem(last=False)

    def _current_window(self, key: str) -> tuple[float, int, bool]:
        """Return the bucket for ``key``, resetting it if the window expired."""
        now = time.monotonic()
        window_s = settings.auth_failure_window_s
        if key in self._buckets:
            window_start, count, audited = self._buckets[key]
            if now - window_start < window_s:
                return window_start, count, audited
        return now, 0, False

    # ------------------------------------------------------------------
    # Public API (no awaits — safe to call from sync context inside asyncio)
    # ------------------------------------------------------------------

    def retry_after(self, ip: str) -> int | None:
        """Return seconds until the window resets, or None if not blocked."""
        key = self._key(ip)
        if key not in self._buckets:
            return None
        window_start, count, _audited = self._buckets[key]
        now = time.monotonic()
        window_s = settings.auth_failure_window_s
        if now - window_start >= window_s:
            return None
        if count >= settings.auth_failure_limit:
            remaining = window_start + window_s - now
            return max(1, math.ceil(remaining))
        return None

    def record_failure(self, ip: str) -> None:
        """Record one failed auth attempt for ``ip``."""
        key = self._key(ip)
        window_start, count, audited = self._current_window(key)
        if key not in self._buckets:
            self._evict_if_full()
        # Move to end (most recently used).
        self._buckets[key] = (window_start, count + 1, audited)
        self._buckets.move_to_end(key)

    def should_audit(self, ip: str) -> bool:
        """Return True the first time an IP is throttled in this window."""
        key = self._key(ip)
        if key not in self._buckets:
            return False
        window_start, count, audited = self._buckets[key]
        now = time.monotonic()
        if now - window_start >= settings.auth_failure_window_s:
            return False
        if count >= settings.auth_failure_limit and not audited:
            self._buckets[key] = (window_start, count, True)
            return True
        return False

    def reset(self) -> None:
        """Clear all state (used in tests)."""
        self._buckets.clear()


#: Module-level singleton used by auth middleware.
auth_failure_throttle: AuthFailureThrottle = AuthFailureThrottle()


async def throttle_block(scope: dict) -> int | None:
    """Return Retry-After seconds when this client IP is throttled.

    The first block in a window writes a best-effort ``auth.deny`` row with
    reason ``auth_throttled``. Callers still build their own 429 response.
    Returns None when the request may continue.
    """

    client_ip = current_client_ip(scope) or ""
    wait = auth_failure_throttle.retry_after(client_ip)
    if wait is None:
        return None
    if auth_failure_throttle.should_audit(client_ip):
        await record_event(
            AuditRecord(
                action=ACTION_AUTH_DENY,
                decision=AUDIT_DECISION_DENIED,
                status=STATUS_DENIED,
                reason="auth_throttled",
                status_code=429,
                error_code="RATE_LIMITED",
                request_id=current_request_id(scope),
                client_ip=current_client_ip(scope),
            ),
            required=False,
        )
    return wait
