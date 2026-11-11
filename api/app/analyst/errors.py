"""Errors the analyst returns with a fixed code.

HTTPException cannot carry these. The HTTP handler hides 5xx details and has
no 502 code, and the generic Exception handler would turn these into 500.
"""

from __future__ import annotations


class AnalystError(Exception):
    """One analyst failure, rendered by the analyst error handler."""

    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        details: dict[str, object] | None = None,
        headers: dict[str, str] | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.details = details
        self.headers = headers


class AnalystUnavailableError(AnalystError):
    """The model is disabled or cannot be reached. No explanation text."""

    def __init__(self, reason: str) -> None:
        super().__init__(
            503,
            "ANALYST_UNAVAILABLE",
            "Analyst unavailable.",
            details={"reason": reason},
        )
        self.reason = reason


class AnalystBusyError(AnalystError):
    """Another explanation is running. This call is not queued."""

    def __init__(self) -> None:
        super().__init__(
            503,
            "ANALYST_BUSY",
            "The analyst is already running an explanation.",
            details={"reason": "busy"},
            headers={"Retry-After": "5"},
        )


class AnalystOutputError(AnalystError):
    """The reply failed a check. The raw reply is not included."""

    def __init__(self, reason: str) -> None:
        super().__init__(
            502,
            "ANALYST_OUTPUT_REJECTED",
            "The analyst reply was rejected.",
            details={"reason": reason},
        )
        self.reason = reason
