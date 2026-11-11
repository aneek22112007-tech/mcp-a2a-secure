"""Generic registry and lifecycle management for containerized MCP upstreams.

Discovers, registers, fingerprints, and dispatches tool calls across
registered UpstreamSpec configurations while enforcing application-controlled
security boundaries.
"""

from __future__ import annotations

import json
import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any

from mcp.server.fastmcp import Context
from mcp.server.fastmcp.tools.base import Tool
from mcp.server.fastmcp.utilities.func_metadata import ArgModelBase, FuncMetadata
from mcp.types import CallToolResult, TextContent
from pydantic import ConfigDict

from app.auth.scopes import TOOL_SCOPES
from app.mcp_server import mcp
from app.sandbox.errors import (
    SandboxBusyError,
    SandboxOutputError,
    SandboxTimeoutError,
    SandboxToolError,
    SandboxUnavailableError,
    SandboxUpstreamError,
)
from app.tools.catalog import (
    ToolDefinition,
    fingerprint_tool,
    get_tool_definition,
)
from app.upstream.spec import UpstreamSpec

logger = logging.getLogger(__name__)

UPSTREAM_ERROR_PREFIX = "Upstream error: "


class _PassthroughArgs(ArgModelBase):
    """Accept the arguments the published schema already validated."""

    model_config = ConfigDict(extra="allow")

    def model_dump_one_level(self) -> dict[str, Any]:
        extra = self.__pydantic_extra__ or {}
        return dict(extra)


@dataclass(frozen=True, slots=True)
class RegisteredTool:
    """Metadata for an active upstream tool registered on the gateway."""

    spec_id: str
    upstream_name: str
    public_name: str
    read_only: bool
    fingerprint: str


_tools: dict[str, RegisteredTool] = {}
_specs: dict[str, UpstreamSpec] = {}
_spec_availability: dict[str, bool] = {}
_spec_details: dict[str, str] = {}


def register_spec(spec: UpstreamSpec) -> None:
    """Register an UpstreamSpec in the global registry."""
    _specs[spec.id] = spec


def get_spec(spec_id: str) -> UpstreamSpec | None:
    """Retrieve an UpstreamSpec by its identifier."""
    return _specs.get(spec_id)


def all_specs() -> list[UpstreamSpec]:
    """Return all currently registered UpstreamSpecs."""
    for spec in SPECS:
        if spec.id not in _specs:
            register_spec(spec)
    return list(_specs.values())


def upstream_tool(public_name: str) -> RegisteredTool | None:
    """Look up a registered upstream tool by its gateway name."""
    return _tools.get(public_name)


def is_upstream_tool(public_name: str) -> bool:
    """Return True if the given tool name is registered to any upstream."""
    return public_name in _tools


def spec_for(public_name: str) -> UpstreamSpec | None:
    """Return the UpstreamSpec responsible for a public tool name."""
    tool = _tools.get(public_name)
    if tool is not None and tool.spec_id in _specs:
        return _specs[tool.spec_id]
    for spec in _specs.values():
        if public_name.startswith(spec.prefix):
            return spec
    return None


def upstream_status(spec: UpstreamSpec) -> dict[str, Any]:
    """Report the current registration status of an upstream."""
    names = sorted(
        [tool.public_name for tool in _tools.values() if tool.spec_id == spec.id]
    )
    available = _spec_availability.get(spec.id, False)
    detail = _spec_details.get(spec.id, "disabled")
    return {
        "id": spec.id,
        "enabled": spec.enabled(),
        "image": spec.image(),
        "available": available,
        "tool_count": len(names),
        "tools": names,
        "detail": detail,
    }


async def register_upstreams() -> None:
    """Iterate through all registered specs and discover/register tools."""
    for spec in SPECS:
        if spec.id not in _specs:
            register_spec(spec)
    for spec in list(_specs.values()):
        await register_upstream(spec)


async def register_upstream(
    spec: UpstreamSpec,
    discover_fn: Callable[[], Awaitable[list[dict[str, Any]]]] | None = None,
) -> None:
    """List tools from an upstream container and register them on the gateway."""
    register_spec(spec)
    _spec_availability[spec.id] = False

    # Remove any existing tools for this spec
    existing_tools = [k for k, t in _tools.items() if t.spec_id == spec.id]
    for public_name in existing_tools:
        _tools.pop(public_name, None)
        TOOL_SCOPES.pop(public_name, None)
        if mcp._tool_manager.get_tool(public_name) is not None:
            mcp._tool_manager.remove_tool(public_name)

    if not spec.enabled():
        _spec_details[spec.id] = "disabled"
        return

    _spec_details[spec.id] = "unavailable"
    try:
        if discover_fn is not None:
            listed = await discover_fn()
        else:
            from app.upstream.runner import discover_tools

            listed = await discover_tools(spec)
    except SandboxUnavailableError:
        logger.warning(
            "%s upstream did not start; %s tools are not registered",
            spec.label,
            spec.prefix,
        )
        _spec_details[spec.id] = "unavailable"
        return
    except Exception:
        logger.warning(
            "%s upstream did not start; %s tools are not registered",
            spec.label,
            spec.prefix,
            exc_info=True,
        )
        _spec_details[spec.id] = "unavailable"
        return

    if not listed:
        logger.warning("%s upstream returned no tools", spec.label)
        return

    for item in listed:
        _register_one(spec, item)

    # Compute live fingerprints and clean up unmapped tool definitions
    spec_tools = [k for k, t in list(_tools.items()) if t.spec_id == spec.id]
    for public_name in spec_tools:
        definition = get_tool_definition(public_name)
        if definition is None:
            _tools.pop(public_name, None)
            TOOL_SCOPES.pop(public_name, None)
            if mcp._tool_manager.get_tool(public_name) is not None:
                mcp._tool_manager.remove_tool(public_name)
            continue
        current = _tools[public_name]
        _tools[public_name] = RegisteredTool(
            spec_id=spec.id,
            upstream_name=current.upstream_name,
            public_name=public_name,
            read_only=current.read_only,
            fingerprint=fingerprint_tool(definition),
        )

    if any(t.spec_id == spec.id for t in _tools.values()):
        _spec_availability[spec.id] = True
        _spec_details[spec.id] = "ok"
        count = sum(1 for t in _tools.values() if t.spec_id == spec.id)
        logger.info("registered %s %s tools", count, spec.label)


def _register_one(spec: UpstreamSpec, item: dict[str, Any]) -> None:
    if not isinstance(item, dict):
        return
    upstream_name = item.get("name")
    if not isinstance(upstream_name, str) or not upstream_name.isidentifier():
        return
    if upstream_name.startswith("_"):
        return
    public_name = f"{spec.prefix}{upstream_name}"
    description = item.get("description")
    schema = item.get("inputSchema")
    if not isinstance(description, str) or not isinstance(schema, dict):
        return
    schema = json.loads(json.dumps(schema))

    # Authority: scopes and read-only decisions are determined strictly
    # by the application-controlled UpstreamSpec. Upstream annotations or
    # descriptions are never trusted for authorization.
    scope = spec.scope_for(upstream_name)
    read_only = spec.read_only_for(upstream_name)

    if mcp._tool_manager.get_tool(public_name) is not None:
        mcp._tool_manager.remove_tool(public_name)

    tool = Tool(
        fn=_make_handler(spec, public_name),
        name=public_name,
        description=description,
        parameters=schema,
        fn_metadata=FuncMetadata(arg_model=_PassthroughArgs, output_schema=None),
        is_async=True,
        context_kwarg="ctx",
    )
    mcp._tool_manager._tools[public_name] = tool
    if scope is not None:
        TOOL_SCOPES[public_name] = scope

    _tools[public_name] = RegisteredTool(
        spec_id=spec.id,
        upstream_name=upstream_name,
        public_name=public_name,
        read_only=read_only,
        fingerprint="",
    )


def _make_handler(spec: UpstreamSpec, public_name: str):
    async def _call(ctx: Context | None = None, **arguments: Any) -> Any:
        arguments.pop("ctx", None)
        return await _invoke(spec, public_name, arguments, ctx)

    _call.__name__ = public_name
    return _call


async def _invoke(
    spec: UpstreamSpec, public_name: str, arguments: dict[str, Any], ctx: Any
) -> Any:
    from app.sandbox.executor import run_tool

    try:
        return await run_tool(public_name, arguments, mcp_context=ctx)
    except SandboxUpstreamError as exc:
        return _error_result(_guard_message(public_name, str(exc), ctx))
    except ValueError as exc:
        return _error_result(_guard_message(public_name, str(exc), ctx))
    except SandboxTimeoutError:
        return _error_result(
            _guard_message(
                public_name,
                f"{UPSTREAM_ERROR_PREFIX}The {spec.label} tool timed out.",
                ctx,
            )
        )
    except SandboxOutputError:
        return _error_result(
            _guard_message(
                public_name,
                f"{UPSTREAM_ERROR_PREFIX}The {spec.label} tool output is too large.",
                ctx,
            )
        )
    except SandboxBusyError:
        return _error_result(
            _guard_message(
                public_name,
                f"{UPSTREAM_ERROR_PREFIX}The {spec.label} tool is busy.",
                ctx,
            )
        )
    except SandboxUnavailableError:
        return _error_result(
            _guard_message(
                public_name,
                f"{UPSTREAM_ERROR_PREFIX}The {spec.label} upstream is unavailable.",
                ctx,
            )
        )
    except SandboxToolError:
        return _error_result(
            _guard_message(
                public_name,
                f"{UPSTREAM_ERROR_PREFIX}The {spec.label} tool failed.",
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


def reset_registry() -> None:
    """Clear all registered tools and specs. Used for test isolation."""
    for public_name in list(_tools.keys()):
        TOOL_SCOPES.pop(public_name, None)
        if mcp._tool_manager.get_tool(public_name) is not None:
            mcp._tool_manager.remove_tool(public_name)
    _tools.clear()
    _specs.clear()
    _spec_availability.clear()
    _spec_details.clear()


# Static upstream specifications known to the gateway
from app.upstream.filesystem import FILESYSTEM
from app.upstream.lab import LAB

SPECS: list[UpstreamSpec] = [FILESYSTEM, LAB]
for _initial_spec in SPECS:
    register_spec(_initial_spec)
