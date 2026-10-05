"""Sandbox failures. Messages are fixed strings so MCP clients cannot see internals.

FastMCP turns a tool exception into ``str(exc)``. These types are not
``OSError`` subclasses, so a path inside an OS error cannot be reported as a
sandbox failure by accident.
"""

from __future__ import annotations

from app.sandbox.types import (
    ERROR_DOCKER_UNAVAILABLE,
    ERROR_OUTPUT_TOO_LARGE,
    ERROR_TIMEOUT,
    ERROR_TOOL_INTERNAL,
)


class SandboxError(Exception):
    """Base sandbox failure. ``error_type`` is a constant, not free text."""

    error_type = ERROR_TOOL_INTERNAL

    def __init__(
        self,
        message: str,
        *,
        error_type: str | None = None,
        exit_code: int | None = None,
        output_bytes: int | None = None,
    ) -> None:
        super().__init__(message)
        if error_type is not None:
            self.error_type = error_type
        self.exit_code = exit_code
        self.output_bytes = output_bytes


class SandboxUnavailableError(SandboxError):
    error_type = ERROR_DOCKER_UNAVAILABLE

    def __init__(
        self,
        *,
        error_type: str | None = None,
        exit_code: int | None = None,
    ) -> None:
        super().__init__(
            "Sandbox unavailable.",
            error_type=error_type,
            exit_code=exit_code,
        )


class SandboxBusyError(SandboxError):
    def __init__(self) -> None:
        super().__init__("Sandbox unavailable.")


class SandboxTimeoutError(SandboxError):
    error_type = ERROR_TIMEOUT

    def __init__(self, *, exit_code: int | None = None) -> None:
        super().__init__("Tool execution timed out.", exit_code=exit_code)


class SandboxOutputError(SandboxError):
    error_type = ERROR_OUTPUT_TOO_LARGE

    def __init__(self, *, output_bytes: int | None = None) -> None:
        super().__init__("Sandbox output too large.", output_bytes=output_bytes)


class SandboxToolError(SandboxError):
    def __init__(
        self,
        error_type: str = ERROR_TOOL_INTERNAL,
        *,
        exit_code: int | None = None,
        output_bytes: int | None = None,
    ) -> None:
        super().__init__(
            "Internal tool error.",
            error_type=error_type,
            exit_code=exit_code,
            output_bytes=output_bytes,
        )
