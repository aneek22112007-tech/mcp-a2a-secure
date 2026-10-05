"""Filter MCP ``tools/list`` when pinning is enforced.

FastMCP registers ``list_tools`` while the server is constructed. Assigning
a new method later does not change that registration, so the wrapper is
registered with the low-level server as well. The HTTP response body is
left untouched.
"""

from __future__ import annotations

from app.config import settings
from app.pins.types import MODE_ENFORCE
from app.services.pins import visible_tool_names

_installed = False


def install_pinned_tool_list() -> None:
    """Wrap ``mcp.list_tools`` once so enforce mode hides unapproved tools."""

    global _installed
    if _installed:
        return
    _installed = True

    from app.mcp_server import mcp

    original = mcp.list_tools

    async def pinned_list_tools():
        tools = await original()
        if settings.tool_pinning_mode != MODE_ENFORCE:
            return tools
        allowed = set(await visible_tool_names([tool.name for tool in tools]))
        return [tool for tool in tools if tool.name in allowed]

    mcp.list_tools = pinned_list_tools  # type: ignore[method-assign]
    mcp._mcp_server.list_tools()(pinned_list_tools)
