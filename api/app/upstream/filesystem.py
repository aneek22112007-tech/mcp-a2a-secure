"""Register the official filesystem server as ``fs_`` tools.

Startup asks a short-lived container for ``tools/list`` and copies each
tool's description and input schema onto the gateway. A container that
cannot start, a missing image, or a stopped Docker daemon leaves the
gateway with the notes tools only.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from app.auth.scopes import FILES_READ, FILES_WRITE
from app.config import settings
from app.sandbox.errors import SandboxUnavailableError
from app.upstream.spec import UpstreamSpec

PREFIX = "fs_"
MOUNT = "/projects"
UPSTREAM_ERROR_PREFIX = "Upstream error: "
CONTRACT_CHANGED = (
    f"{UPSTREAM_ERROR_PREFIX}Upstream tool contract changed since startup"
)

READ_ONLY_TOOLS = frozenset(
    {
        "read_file",
        "read_text_file",
        "read_media_file",
        "read_multiple_files",
        "list_directory",
        "list_directory_with_sizes",
        "directory_tree",
        "search_files",
        "get_file_info",
        "list_allowed_directories",
    }
)
WRITE_TOOLS = frozenset(
    {
        "write_file",
        "edit_file",
        "create_directory",
        "move_file",
        "append_file",
        "copy_file",
    }
)
_PATH_KEYS = ("path", "source", "destination")


def _scope_for(upstream_name: str) -> str | None:
    if upstream_name in READ_ONLY_TOOLS:
        return FILES_READ
    if upstream_name in WRITE_TOOLS:
        return FILES_WRITE
    return None


def _mount(read_only: bool) -> str | None:
    fs_source = settings.upstream_fs_source
    if fs_source is not None and fs_source.startswith("volume:"):
        volume = fs_source.split(":", 1)[1]
        if re.fullmatch(r"[A-Za-z0-9_.-]+", volume) is None:
            raise SandboxUnavailableError()
        mount = f"type=volume,source={volume},target={MOUNT}"
    else:
        source = ensure_shared_dir().resolve()
        if any(char in str(source) for char in (",", "=", "\n", "\r")):
            raise SandboxUnavailableError()
        mount = f"type=bind,source={source},target={MOUNT}"
    if read_only:
        mount += ",readonly"
    return mount


def ensure_shared_dir() -> Path:
    """Create the host directory mounted at ``/projects``. Settings does not."""
    path = settings.upstream_fs_dir
    if not path.exists():
        path.mkdir(parents=True, mode=0o755)
        path.chmod(0o755)
    return path


def check_paths(arguments: dict[str, Any]) -> None:
    """Refuse a path that leaves ``/projects`` or names a symlink."""
    raw_paths: list[str] = []
    for key in _PATH_KEYS:
        value = arguments.get(key)
        if isinstance(value, str):
            raw_paths.append(value)
    paths = arguments.get("paths")
    if isinstance(paths, list):
        raw_paths.extend(item for item in paths if isinstance(item, str))
    for raw in raw_paths:
        _check_one_path(raw)


def _check_one_path(raw: str) -> None:
    if raw == "" or "\x00" in raw:
        raise ValueError(f"{UPSTREAM_ERROR_PREFIX}Path is not allowed.")
    relative = _relative_to_mount(raw)
    root = settings.upstream_fs_dir.resolve()
    current = root
    for part in relative:
        if part in ("", "."):
            continue
        current = current / part
        if current.is_symlink():
            raise ValueError(f"{UPSTREAM_ERROR_PREFIX}Symlinks are not allowed.")
    if current.exists():
        resolved = current.resolve()
        if resolved != root and root not in resolved.parents:
            raise ValueError(
                f"{UPSTREAM_ERROR_PREFIX}Path is outside the allowed directory."
            )


def _relative_to_mount(raw: str) -> tuple[str, ...]:
    from pathlib import PurePosixPath

    pure = PurePosixPath(raw)
    if pure.is_absolute():
        mount = PurePosixPath(MOUNT)
        if ".." in pure.parts or not (
            pure == mount or str(pure).startswith(f"{MOUNT}/")
        ):
            raise ValueError(
                f"{UPSTREAM_ERROR_PREFIX}Path is outside the allowed directory."
            )
        return pure.relative_to(mount).parts
    if ".." in pure.parts or pure.parts[:1] == ("/",):
        raise ValueError(
            f"{UPSTREAM_ERROR_PREFIX}Path is outside the allowed directory."
        )
    return pure.parts


FILESYSTEM = UpstreamSpec(
    id="filesystem",
    prefix=PREFIX,
    label="filesystem",
    enabled=lambda: settings.upstream_fs_enabled,
    image=lambda: settings.upstream_fs_image,
    timeout_s=lambda: settings.upstream_fs_timeout_s,
    container_name_prefix="mcpg-fs-",
    scope_for=_scope_for,
    read_only_for=lambda name: name not in WRITE_TOOLS,
    mount=_mount,
    check_args=check_paths,
    memory="256m",
    pids_limit=128,
    command=("--confine-roots", MOUNT),
)
FILESYSTEM_SPEC = FILESYSTEM

from app.upstream.registry import (
    RegisteredTool,
    contract_fingerprint,
    register_spec,
    register_upstream,
    upstream_status,
    upstream_tool,
)

# Type alias for backwards compatibility
FilesystemTool = RegisteredTool

# Auto-register filesystem spec into global registry
register_spec(FILESYSTEM)


# Compatibility wrappers delegating to the generic registry
async def register_filesystem_upstream() -> None:
    """List the upstream tools and register them."""
    await register_upstream(FILESYSTEM)


def filesystem_status() -> dict[str, Any]:
    """Report the current registration status of the filesystem upstream."""
    return upstream_status(FILESYSTEM)


def is_filesystem_tool(tool_name: str) -> bool:
    """Return True if the tool name belongs to the filesystem upstream."""
    tool = upstream_tool(tool_name)
    return tool is not None and tool.spec_id == "filesystem"


def filesystem_tool(tool_name: str) -> FilesystemTool | None:
    """Retrieve the filesystem tool metadata if it belongs to the filesystem upstream."""
    tool = upstream_tool(tool_name)
    if tool is not None and tool.spec_id == "filesystem":
        return tool
    return None


__all__ = [
    "CONTRACT_CHANGED",
    "FILESYSTEM",
    "FILESYSTEM_SPEC",
    "MOUNT",
    "PREFIX",
    "READ_ONLY_TOOLS",
    "UPSTREAM_ERROR_PREFIX",
    "WRITE_TOOLS",
    "FilesystemTool",
    "check_paths",
    "contract_fingerprint",
    "ensure_shared_dir",
    "filesystem_status",
    "filesystem_tool",
    "is_filesystem_tool",
    "register_filesystem_upstream",
]
