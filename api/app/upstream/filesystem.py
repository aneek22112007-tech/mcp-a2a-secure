"""Register the official filesystem server as ``fs_`` tools.

Startup asks a short-lived container for ``tools/list`` and copies each
tool's description and input schema onto the gateway. A container that
cannot start, a missing image, or a stopped Docker daemon leaves the
gateway with the notes tools only.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from mcp.server.fastmcp import Context
from mcp.server.fastmcp.tools.base import Tool
from mcp.server.fastmcp.utilities.func_metadata import ArgModelBase, FuncMetadata
from mcp.types import CallToolResult, TextContent
from pydantic import ConfigDict

from app.auth.scopes import FILES_READ, FILES_WRITE, TOOL_SCOPES
from app.config import settings
from app.mcp_server import mcp
from app.sandbox.errors import (
    SandboxBusyError,
    SandboxOutputError,
    SandboxTimeoutError,
    SandboxToolError,
    SandboxUnavailableError,
)
from app.tools.catalog import (
    ToolDefinition,
    fingerprint_tool,
    get_tool_definition,
)

logger = logging.getLogger(__name__)

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


class _PassthroughArgs(ArgModelBase):
    """Accept the arguments the published schema already validated."""

    model_config = ConfigDict(extra="allow")

    def model_dump_one_level(self) -> dict[str, Any]:
        extra = self.__pydantic_extra__ or {}
        return dict(extra)


@dataclass(frozen=True, slots=True)
class FilesystemTool:
    upstream_name: str
    public_name: str
    read_only: bool
    fingerprint: str


_tools: dict[str, FilesystemTool] = {}
_available = False
_detail = "disabled"


def is_filesystem_tool(tool_name: str) -> bool:
    return tool_name in _tools


def filesystem_tool(tool_name: str) -> FilesystemTool | None:
    return _tools.get(tool_name)


def filesystem_status() -> dict[str, Any]:
    names = sorted(_tools)
    return {
        "id": "filesystem",
        "enabled": settings.upstream_fs_enabled,
        "image": settings.upstream_fs_image,
        "available": _available,
        "tool_count": len(names),
        "tools": names,
        "detail": _detail,
    }


def ensure_shared_dir() -> Path:
    """Create the host directory mounted at ``/projects``. Settings does not."""

    path = settings.upstream_fs_dir
    path.mkdir(parents=True, exist_ok=True)
    # The container user is the sandbox uid, which is not the host user.
    path.chmod(0o777)
    readme = path / "readme.txt"
    if not readme.exists():
        readme.write_text(
            "Shared directory for the MCP Guard filesystem upstream.\n",
            encoding="utf-8",
        )
        readme.chmod(0o644)
    return path


async def register_filesystem_upstream() -> None:
    """List the upstream tools and register them. Failures are logged and ignored."""

    global _available, _detail
    _tools.clear()
    _available = False
    if not settings.upstream_fs_enabled:
        _detail = "disabled"
        return
    _detail = "unavailable"
    try:
        from app.upstream.runner import discover_filesystem_tools

        listed = await discover_filesystem_tools()
    except SandboxUnavailableError:
        logger.warning(
            "filesystem upstream did not start; fs_ tools are not registered"
        )
        _detail = "unavailable"
        return
    except Exception:
        logger.warning(
            "filesystem upstream did not start; fs_ tools are not registered",
            exc_info=True,
        )
        _detail = "unavailable"
        return
    if not listed:
        logger.warning("filesystem upstream returned no tools")
        return
    for spec in listed:
        _register_one(spec)
    for public_name in list(_tools):
        definition = get_tool_definition(public_name)
        if definition is None:
            _tools.pop(public_name, None)
            TOOL_SCOPES.pop(public_name, None)
            continue
        current = _tools[public_name]
        _tools[public_name] = FilesystemTool(
            upstream_name=current.upstream_name,
            public_name=public_name,
            read_only=current.read_only,
            fingerprint=fingerprint_tool(definition),
        )
    if _tools:
        _available = True
        _detail = "ok"
        logger.info("registered %s filesystem tools", len(_tools))


def _register_one(spec: dict[str, Any]) -> None:
    upstream_name = spec.get("name")
    if not isinstance(upstream_name, str) or not upstream_name.isidentifier():
        return
    if upstream_name.startswith("_"):
        return
    public_name = f"{PREFIX}{upstream_name}"
    description = spec.get("description")
    schema = spec.get("inputSchema")
    if not isinstance(description, str) or not isinstance(schema, dict):
        return
    schema = json.loads(json.dumps(schema))
    scope = _scope_for(upstream_name)
    # Unknown names stay registered and unmapped. A read-only mount is the
    # safe default if a call ever reaches the container.
    read_only = upstream_name not in WRITE_TOOLS

    if mcp._tool_manager.get_tool(public_name) is not None:
        mcp._tool_manager.remove_tool(public_name)
    # Built directly so the published schema stays the upstream document.
    # FastMCP would replace it with a schema inferred from the Python function.
    tool = Tool(
        fn=_make_handler(public_name),
        name=public_name,
        description=description,
        parameters=schema,
        fn_metadata=FuncMetadata(arg_model=_PassthroughArgs, output_schema=None),
        is_async=True,
        context_kwarg="ctx",
    )
    mcp._tool_manager._tools[public_name] = tool
    if scope is None:
        TOOL_SCOPES.pop(public_name, None)
    else:
        TOOL_SCOPES[public_name] = scope
    _tools[public_name] = FilesystemTool(
        upstream_name=upstream_name,
        public_name=public_name,
        read_only=read_only,
        fingerprint="",
    )


def _scope_for(upstream_name: str) -> str | None:
    if upstream_name in READ_ONLY_TOOLS:
        return FILES_READ
    if upstream_name in WRITE_TOOLS:
        return FILES_WRITE
    return None


def _make_handler(public_name: str):
    async def _call(ctx: Context | None = None, **arguments: Any) -> Any:
        arguments.pop("ctx", None)
        return await _invoke(public_name, arguments, ctx)

    _call.__name__ = public_name
    return _call


async def _invoke(public_name: str, arguments: dict[str, Any], ctx: Any) -> Any:
    from app.sandbox.executor import run_tool

    try:
        return await run_tool(public_name, arguments, mcp_context=ctx)
    except ValueError as exc:
        return _error_result(_guard_message(public_name, str(exc), ctx))
    except SandboxTimeoutError:
        return _error_result(
            _guard_message(
                public_name,
                f"{UPSTREAM_ERROR_PREFIX}The filesystem tool timed out.",
                ctx,
            )
        )
    except SandboxOutputError:
        return _error_result(
            _guard_message(
                public_name,
                f"{UPSTREAM_ERROR_PREFIX}The filesystem tool output is too large.",
                ctx,
            )
        )
    except SandboxBusyError:
        return _error_result(
            _guard_message(
                public_name,
                f"{UPSTREAM_ERROR_PREFIX}The filesystem tool is busy.",
                ctx,
            )
        )
    except SandboxUnavailableError:
        return _error_result(
            _guard_message(
                public_name,
                f"{UPSTREAM_ERROR_PREFIX}The filesystem upstream is unavailable.",
                ctx,
            )
        )
    except SandboxToolError:
        return _error_result(
            _guard_message(
                public_name,
                f"{UPSTREAM_ERROR_PREFIX}The filesystem tool failed.",
                ctx,
            )
        )


def _guard_message(public_name: str, message: str, ctx: Any) -> str:
    from app.guard import check_tool_output
    from app.sandbox.context import resolve_execution_context

    if not message.startswith(UPSTREAM_ERROR_PREFIX):
        message = f"{UPSTREAM_ERROR_PREFIX}{message}"
    context = resolve_execution_context(ctx)
    return check_tool_output(
        message,
        tool_name=public_name,
        key_prefix=context.key_prefix,
        request_id=context.request_id,
        client_id=context.client_id,
        api_key_id=context.api_key_id,
    ).text


def _error_result(message: str) -> CallToolResult:
    return CallToolResult(
        content=[TextContent(type="text", text=message)],
        isError=True,
    )


def contract_fingerprint(
    public_name: str, description: str, schema: dict[str, Any]
) -> str:
    """Fingerprint one live upstream tool the same way pinning does.

    Output schema and annotations are not part of the hash.
    """

    return fingerprint_tool(
        ToolDefinition(
            name=public_name,
            description=description,
            input_schema=schema,
            output_schema=None,
        )
    )


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
