from datetime import UTC, datetime

MAX_PAGE_LIMIT = 100


def normalize_page(limit: int, offset: int) -> tuple[int, int]:
    if isinstance(limit, bool) or not isinstance(limit, int):
        raise TypeError("limit must be an integer between 1 and 100")
    if isinstance(offset, bool) or not isinstance(offset, int):
        raise TypeError("offset must be a non-negative integer")
    if limit < 1 or limit > MAX_PAGE_LIMIT:
        raise ValueError("limit must be an integer between 1 and 100")
    if offset < 0:
        raise ValueError("offset must be a non-negative integer")
    return limit, offset


def as_utc(value: datetime) -> datetime:
    """Normalize a datetime to UTC.

    Naive values are interpreted as UTC. Aware values are converted, so an
    explicit non-UTC offset is not stored as if it were already UTC.
    """

    if value.tzinfo is None or value.tzinfo.utcoffset(value) is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def require_text(value: object, *, field: str, max_length: int) -> str:
    if not isinstance(value, str):
        raise TypeError(f"{field} must be a string")
    cleaned = value.strip()
    if not cleaned:
        raise ValueError(f"{field} is required")
    if len(cleaned) > max_length:
        raise ValueError(f"{field} must be at most {max_length} characters")
    return cleaned
