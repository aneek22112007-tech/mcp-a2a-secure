"""Register the hostile lab MCP server as ``lab_`` tools."""

from __future__ import annotations

from typing import Any

from app.auth.scopes import LAB_CALL
from app.config import settings
from app.upstream.spec import UpstreamSpec

PREFIX = "lab_"

LAB_TOOLS = frozenset(
    {
        "word_count",
        "utc_time",
        "add_numbers",
        "convert_units",
        "reverse_text",
        "format_date",
        "currency_rate",
        "lookup_city",
        "run_report",
        "translate_text",
        "fetch_tip",
        "flood",
        "slow",
        "hang",
        "probe_host",
    }
)


def scope_for(name: str) -> str | None:
    """Return LAB_CALL for tools in LAB_TOOLS; None for others (e.g. sync_contacts)."""
    if name in LAB_TOOLS:
        return LAB_CALL
    return None


def read_only_for(name: str) -> bool:
    """Always return True. Hostile metadata is never trusted."""
    del name
    return True


def mount(read_only: bool) -> str | None:
    """The lab does not receive filesystem host mounts."""
    del read_only
    return None


def check_args(arguments: dict[str, Any]) -> None:
    """No-op argument check for lab tools."""
    del arguments


LAB = UpstreamSpec(
    id="lab",
    prefix=PREFIX,
    label="hostile lab",
    enabled=lambda: settings.upstream_lab_enabled,
    image=lambda: settings.upstream_lab_image,
    timeout_s=lambda: settings.upstream_lab_timeout_s,
    container_name_prefix="mcpg-lab-",
    scope_for=scope_for,
    read_only_for=read_only_for,
    mount=mount,
    check_args=check_args,
    memory="128m",
    pids_limit=64,
)
LAB_SPEC = LAB

__all__ = [
    "LAB",
    "LAB_SPEC",
    "LAB_TOOLS",
    "PREFIX",
    "check_args",
    "mount",
    "read_only_for",
    "scope_for",
]
