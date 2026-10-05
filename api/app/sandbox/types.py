"""Shared sandbox contract. Names here are part of the public surface."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any

RUN_STATUS_RUNNING = "running"
RUN_STATUS_SUCCEEDED = "succeeded"
RUN_STATUS_FAILED = "failed"
RUN_STATUS_TIMEOUT = "timeout"
RUN_STATUS_CANCELLED = "cancelled"
RUN_STATUS_UNAVAILABLE = "unavailable"
RUN_STATUS_REJECTED = "rejected"
RUN_STATUS_ABANDONED = "abandoned"

RUN_STATUSES = frozenset(
    {
        RUN_STATUS_RUNNING,
        RUN_STATUS_SUCCEEDED,
        RUN_STATUS_FAILED,
        RUN_STATUS_TIMEOUT,
        RUN_STATUS_CANCELLED,
        RUN_STATUS_UNAVAILABLE,
        RUN_STATUS_REJECTED,
        RUN_STATUS_ABANDONED,
    }
)

MODE_DOCKER = "docker"
MODE_INPROCESS = "inprocess"
TRANSPORT_REST = "rest"
TRANSPORT_MCP = "mcp"

ERROR_TOOL_INVALID_ARGUMENT = "tool_invalid_argument"
ERROR_TOOL_NOT_FOUND = "tool_not_found"
ERROR_TOOL_INTERNAL = "tool_internal"
ERROR_TIMEOUT = "timeout"
ERROR_CANCELLED = "cancelled"
ERROR_DOCKER_UNAVAILABLE = "docker_unavailable"
ERROR_IMAGE_MISSING = "image_missing"
ERROR_BUSY = "busy"
ERROR_OUTPUT_TOO_LARGE = "output_too_large"
ERROR_PROTOCOL_ERROR = "protocol_error"
ERROR_KILLED = "killed"


@dataclass(frozen=True, slots=True)
class SandboxRunStart:
    """Identity of a run, recorded before the tool body finishes."""

    run_id: str
    tool_name: str
    mode: str
    image: str | None
    transport: str
    args_hash: str | None
    request_id: str | None
    client_id: str | None
    api_key_id: str | None
    key_prefix: str | None
    audit_event_id: str | None
    started_at: datetime


@dataclass(frozen=True, slots=True)
class SandboxRunFinish:
    """Outcome of a run. ``error_type`` is a constant or None."""

    status: str
    exit_code: int | None
    duration_ms: int
    output_bytes: int
    error_type: str | None
    finished_at: datetime


@dataclass(frozen=True, slots=True)
class SandboxHealth:
    """Operator view of the sandbox.

    ``reason`` is a constant from this module, or None. It is never raw
    stderr, a filesystem path, or ``DOCKER_HOST``.
    """

    mode: str
    available: bool
    reason: str | None
    image: str
    image_present: bool
    docker_server_version: str | None
    active_runs: int
    max_concurrent: int
    limits: dict[str, Any]
