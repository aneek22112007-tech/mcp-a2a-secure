"""Who a sandbox run belongs to.

The gateway binds a context before ``_dispatch``. An MCP ``tools/call`` has
no gateway context, so the tool reads the ASGI scope off the FastMCP request.
That scope object is the same dict the bearer middleware wrote
``mcp_guard.principal`` onto: Starlette stores the scope by reference, and
the streamable HTTP transport builds ``Request(scope)`` from it.
"""

from __future__ import annotations

from contextvars import ContextVar, Token
from dataclasses import dataclass

from app.audit.redaction import current_request_id
from app.auth.principal import Principal
from app.sandbox.types import TRANSPORT_MCP

_execution_context: ContextVar[ExecutionContext | None] = ContextVar(
    "mcp_guard_execution_context",
    default=None,
)


@dataclass(frozen=True, slots=True)
class ExecutionContext:
    transport: str
    request_id: str | None
    client_id: str | None
    api_key_id: str | None
    key_prefix: str | None
    audit_event_id: str | None


def bind_execution_context(context: ExecutionContext) -> Token[ExecutionContext | None]:
    return _execution_context.set(context)


def reset_execution_context(token: Token[ExecutionContext | None]) -> None:
    _execution_context.reset(token)


def current_execution_context() -> ExecutionContext | None:
    return _execution_context.get()


def _empty_mcp_context() -> ExecutionContext:
    return ExecutionContext(
        transport=TRANSPORT_MCP,
        request_id=None,
        client_id=None,
        api_key_id=None,
        key_prefix=None,
        audit_event_id=None,
    )


def resolve_execution_context(mcp_ctx: object | None) -> ExecutionContext:
    """Gateway context, then the MCP request scope, then an empty MCP context.

    ``ctx.request_context`` raises ``ValueError`` when the gateway calls
    ``mcp.call_tool`` outside an MCP request. That error is ignored so the
    bound gateway context, or an empty MCP context, is used instead.
    """

    bound = _execution_context.get()
    if bound is not None:
        return bound
    if mcp_ctx is None:
        return _empty_mcp_context()
    try:
        request_context = mcp_ctx.request_context  # type: ignore[attr-defined]
        request = request_context.request
        scope = request.scope
    except (ValueError, AttributeError):
        return _empty_mcp_context()
    if not isinstance(scope, dict):
        return _empty_mcp_context()

    principal = scope.get("mcp_guard.principal")
    client_id = None
    api_key_id = None
    key_prefix = None
    if isinstance(principal, Principal):
        client_id = principal.client_id
        api_key_id = principal.api_key_id
        key_prefix = principal.key_prefix

    audit_event_id = None
    audit_ids = scope.get("mcp_guard.tools_call_audit_ids")
    if isinstance(audit_ids, dict):
        try:
            jsonrpc_id = str(mcp_ctx.request_id)  # type: ignore[attr-defined]
        except (ValueError, AttributeError):
            jsonrpc_id = ""
        found = audit_ids.get(jsonrpc_id)
        if isinstance(found, str):
            audit_event_id = found

    return ExecutionContext(
        transport=TRANSPORT_MCP,
        request_id=current_request_id(scope),
        client_id=client_id,
        api_key_id=api_key_id,
        key_prefix=key_prefix,
        audit_event_id=audit_event_id,
    )
