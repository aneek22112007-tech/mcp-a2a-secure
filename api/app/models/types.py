"""Timezone-aware UTC datetime type for every persisted timestamp."""

from datetime import UTC, datetime

from sqlalchemy import DateTime
from sqlalchemy.types import TypeDecorator


class UTCDateTime(TypeDecorator):
    """Store datetimes as UTC and always return timezone-aware UTC values.

    Naive values are interpreted as UTC so existing UTC application data keeps
    its meaning. Aware values are converted with ``astimezone``; a non-UTC
    offset is never discarded and treated as if it were already UTC.

    SQLite has no timezone-aware datetime storage. Values are stored as naive
    UTC and reattached to UTC when read back.
    """

    impl = DateTime(timezone=True)
    cache_ok = True

    def process_bind_param(self, value: datetime | None, dialect) -> datetime | None:
        if value is None:
            return None
        if not isinstance(value, datetime):
            raise TypeError("UTCDateTime columns require a datetime value")
        normalized = _as_utc(value)
        if dialect.name == "sqlite":
            return normalized.replace(tzinfo=None)
        return normalized

    def process_result_value(self, value: datetime | None, dialect) -> datetime | None:
        if value is None:
            return None
        if not isinstance(value, datetime):
            raise TypeError("UTCDateTime columns must load as datetimes")
        return _as_utc(value)


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None or value.tzinfo.utcoffset(value) is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)
