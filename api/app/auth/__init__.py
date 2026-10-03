from app.auth.bearer import API_KEY_TOKEN_PREFIX
from app.auth.dependencies import authorize_route, get_principal, require_scopes
from app.auth.mcp_asgi import McpBearerAuthMiddleware
from app.auth.principal import Principal
from app.auth.scopes import (
    ADMIN,
    AGENT_RUN,
    ALL_SCOPES,
    AUDIT_READ,
    MCP_REQUIRED_SCOPE,
    NOTES_READ,
    NOTES_WRITE,
    ROUTE_SCOPES,
)
from app.auth.verifier import ApiKeyVerifier, get_api_key_verifier, set_api_key_verifier

__all__ = [
    "ADMIN",
    "AGENT_RUN",
    "ALL_SCOPES",
    "API_KEY_TOKEN_PREFIX",
    "AUDIT_READ",
    "MCP_REQUIRED_SCOPE",
    "NOTES_READ",
    "NOTES_WRITE",
    "ROUTE_SCOPES",
    "ApiKeyVerifier",
    "McpBearerAuthMiddleware",
    "Principal",
    "authorize_route",
    "get_api_key_verifier",
    "get_principal",
    "require_scopes",
    "set_api_key_verifier",
]
