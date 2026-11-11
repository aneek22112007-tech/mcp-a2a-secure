"""Specification dataclass for containerized MCP upstreams.

Encapsulates upstream identification, configuration readers, execution
parameters, security scopes, and argument validators in an immutable
structure.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any


def _default_mount(read_only: bool) -> str | None:
    del read_only
    return None


def _default_check_args(arguments: dict[str, Any]) -> None:
    del arguments


@dataclass(frozen=True, slots=True)
class UpstreamSpec:
    """Immutable specification defining a containerized MCP upstream.

    Attributes:
        id: Unique identifier for the upstream (e.g., "filesystem", "lab").
        prefix: Public tool name prefix exposed on the gateway (e.g., "fs_", "lab_").
        label: Upstream label used in error messages and diagnostics.
        enabled: Zero-argument callable returning whether the upstream is enabled.
        image: Zero-argument callable returning the container image name.
        timeout_s: Zero-argument callable returning container execution timeout in seconds.
        container_name_prefix: Prefix used when generating ephemeral container names.
        scope_for: Callable mapping an upstream tool name to its required scope, or None.
        read_only_for: Callable determining whether a tool requires a read-only container mount.
        mount: Callable returning the Docker --mount argument string for read-only or writable
            mode, or None if no mount is required.
        check_args: Callable validating invocation arguments; raises ValueError with an
            'Upstream error:' message when invalid.
        memory: Container memory limit (e.g., "256m").
        pids_limit: Maximum number of processes allowed in the container.
    """

    id: str
    prefix: str
    label: str
    enabled: Callable[[], bool]
    image: Callable[[], str]
    timeout_s: Callable[[], float]
    container_name_prefix: str
    scope_for: Callable[[str], str | None]
    read_only_for: Callable[[str], bool]
    mount: Callable[[bool], str | None] = _default_mount
    check_args: Callable[[dict[str, Any]], None] = _default_check_args
    memory: str = "256m"
    pids_limit: int = 128
    command: tuple[str, ...] = ()

    def __post_init__(self) -> None:
        if not self.id or not self.id.strip():
            raise ValueError("Upstream id must not be empty")
        if not self.prefix or not self.prefix.strip():
            raise ValueError("Upstream prefix must not be empty")
        if not self.label or not self.label.strip():
            raise ValueError("Upstream label must not be empty")
        if not self.container_name_prefix or not self.container_name_prefix.strip():
            raise ValueError("Upstream container_name_prefix must not be empty")
        if not self.memory or not self.memory.strip():
            raise ValueError("Upstream memory must not be empty")
        if self.pids_limit <= 0:
            raise ValueError("Upstream pids_limit must be greater than 0")
