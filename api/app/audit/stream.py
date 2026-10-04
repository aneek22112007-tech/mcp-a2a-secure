"""In-process fan-out for the audit SSE stream.

Single-process only. Multi-worker fan-out (Postgres LISTEN/NOTIFY) is future work.
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from collections.abc import Mapping

from app.audit.events import AuditEventOut
from app.config import settings

logger = logging.getLogger(__name__)

_FILTER_FIELDS = ("decision", "action", "tool_name", "client_id")


class StreamFullError(Exception):
    """Raised when ``audit_stream_max_subscribers`` is already reached."""


class AuditSubscription:
    """One subscriber queue plus the filters it asked for."""

    def __init__(
        self,
        queue: asyncio.Queue[AuditEventOut],
        filters: dict[str, str],
    ) -> None:
        self.queue = queue
        self.filters = filters
        self.subscriber_id = uuid.uuid4().hex
        self.dropped = 0
        self._warned = False


class AuditBroadcaster:
    """Publish audit rows to matching subscribers without blocking the writer."""

    def __init__(self) -> None:
        self._subscribers: list[AuditSubscription] = []
        self.dropped = 0

    def subscribe(self, filters: Mapping[str, str | None]) -> AuditSubscription:
        """Register a subscriber. Raises ``StreamFullError`` at the cap."""

        if len(self._subscribers) >= settings.audit_stream_max_subscribers:
            raise StreamFullError("audit stream subscriber cap reached")
        selected = {
            key: value
            for key, value in filters.items()
            if key in _FILTER_FIELDS and value is not None
        }
        subscription = AuditSubscription(
            asyncio.Queue(maxsize=settings.audit_stream_queue_size),
            selected,
        )
        self._subscribers.append(subscription)
        return subscription

    def unsubscribe(self, subscription: AuditSubscription) -> None:
        """Remove a subscriber. A second call is a no-op."""

        try:
            self._subscribers.remove(subscription)
        except ValueError:
            return

    def publish(self, event: AuditEventOut) -> None:
        """Offer ``event`` to each matching subscriber.

        A full queue drops that event for that subscriber only. The drop is
        counted and logged once per subscriber.
        """

        for subscription in self._subscribers[:]:
            if not _matches(event, subscription.filters):
                continue
            try:
                subscription.queue.put_nowait(event)
            except asyncio.QueueFull:
                subscription.dropped += 1
                self.dropped += 1
                if not subscription._warned:
                    subscription._warned = True
                    logger.warning(
                        "[audit] stream subscriber queue full subscriber=%s",
                        subscription.subscriber_id,
                    )


def _matches(event: AuditEventOut, filters: Mapping[str, str]) -> bool:
    for key, expected in filters.items():
        if getattr(event, key, None) != expected:
            return False
    return True


audit_broadcaster = AuditBroadcaster()
