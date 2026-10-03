import logging

from starlette.types import ASGIApp, Receive, Scope, Send

from app.auth.bearer import AuthenticationError, authenticate
from app.auth.scopes import MCP_REQUIRED_SCOPE
from app.middleware import _send_error

logger = logging.getLogger(__name__)


class McpBearerAuthMiddleware:
    def __init__(self, app: ASGIApp, required_scope: str = MCP_REQUIRED_SCOPE) -> None:
        self.app = app
        self.required_scope = required_scope

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        try:
            principal = await authenticate(scope["headers"])
        except AuthenticationError:
            await _send_error(
                send,
                None,
                401,
                "UNAUTHORIZED",
                "Authentication required.",
                extra_headers=[(b"www-authenticate", b"Bearer")],
            )
            return
        except Exception as exc:
            logger.exception("Verifier exception type=%s", type(exc).__name__)
            await _send_error(
                send,
                None,
                500,
                "INTERNAL_SERVER_ERROR",
                "An unexpected error occurred.",
            )
            return

        if not principal.has_scope(self.required_scope):
            await _send_error(
                send,
                None,
                403,
                "FORBIDDEN",
                f"Missing required scope: {self.required_scope}.",
                extra_headers=[
                    (
                        b"www-authenticate",
                        f'Bearer error="insufficient_scope", scope="{self.required_scope}"'.encode(
                            "ascii"
                        ),
                    )
                ],
            )
            return

        scope["mcp_guard.principal"] = principal
        scope.setdefault("state", {})["principal"] = principal
        await self.app(scope, receive, send)
