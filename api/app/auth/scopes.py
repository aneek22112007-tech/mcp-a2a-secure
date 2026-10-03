from fastapi import FastAPI
from fastapi.routing import APIRoute

NOTES_READ = "notes:read"
NOTES_WRITE = "notes:write"
AUDIT_READ = "audit:read"
AGENT_RUN = "agent:run"
ADMIN = "admin"

ALL_SCOPES = frozenset({NOTES_READ, NOTES_WRITE, AUDIT_READ, AGENT_RUN, ADMIN})
MCP_REQUIRED_SCOPE = AGENT_RUN

ROUTE_SCOPES: dict[tuple[str, str], str | None] = {
    ("GET", "/api/notes"): NOTES_READ,
    ("GET", "/api/notes/{name}"): NOTES_READ,
    ("PUT", "/api/notes/{name}"): NOTES_WRITE,
    ("GET", "/api/status"): None,
    ("GET", "/api/mcp/info"): None,
    ("GET", "/health"): None,
}

def check_route_scope_coverage(app: FastAPI) -> None:
    for route in app.routes:
        if isinstance(route, APIRoute):
            for method in route.methods:
                check_method = "GET" if method == "HEAD" else method
                if (check_method, route.path) not in ROUTE_SCOPES:
                    raise RuntimeError(f"Unmapped route for authorization: {check_method} {route.path}")
    
    for scope in ROUTE_SCOPES.values():
        if scope is not None and scope not in ALL_SCOPES:
            raise RuntimeError(f"Mapped scope {scope} is not in ALL_SCOPES")
