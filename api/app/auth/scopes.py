from fastapi import FastAPI
from fastapi.routing import APIRoute

NOTES_READ = "notes:read"
NOTES_WRITE = "notes:write"
AUDIT_READ = "audit:read"
METRICS_READ = "metrics:read"
AGENT_RUN = "agent:run"
ADMIN = "admin"

ALL_SCOPES = frozenset(
    {NOTES_READ, NOTES_WRITE, AUDIT_READ, METRICS_READ, AGENT_RUN, ADMIN}
)
MCP_REQUIRED_SCOPE = AGENT_RUN

ROUTE_SCOPES: dict[tuple[str, str], str | None] = {
    ("GET", "/api/notes"): NOTES_READ,
    ("GET", "/api/notes/{name}"): NOTES_READ,
    ("PUT", "/api/notes/{name}"): NOTES_WRITE,
    ("GET", "/api/audit"): AUDIT_READ,
    ("GET", "/api/audit/stream"): AUDIT_READ,
    ("GET", "/api/metrics"): METRICS_READ,
    ("GET", "/api/status"): None,
    ("GET", "/api/mcp/info"): None,
    ("GET", "/health"): None,
    ("POST", "/api/keys"): ADMIN,
    ("GET", "/api/keys"): ADMIN,
    ("DELETE", "/api/keys/{key_id}"): ADMIN,
}


def check_route_scope_coverage(app: FastAPI) -> None:
    import fastapi.routing

    for ctx in fastapi.routing.iter_route_contexts(app.routes):
        if isinstance(ctx.route, APIRoute):
            for method in ctx.route.methods:
                check_method = "GET" if method == "HEAD" else method
                if (check_method, ctx.route.path) not in ROUTE_SCOPES:
                    raise RuntimeError(
                        f"Unmapped route for authorization: {check_method} {ctx.route.path}"
                    )

    for scope in ROUTE_SCOPES.values():
        if scope is not None and scope not in ALL_SCOPES:
            raise RuntimeError(f"Mapped scope {scope} is not in ALL_SCOPES")
