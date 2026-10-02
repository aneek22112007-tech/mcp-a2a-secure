import contextvars
import uuid

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp

request_id_context = contextvars.ContextVar("request_id", default="")


class RequestContextMiddleware(BaseHTTPMiddleware):
    def __init__(self, app: ASGIApp):
        super().__init__(app)

    async def dispatch(self, request: Request, call_next):
        # 1. Get or generate Request ID
        req_id = request.headers.get("X-Request-ID")
        if not req_id or len(req_id) > 64:
            req_id = str(uuid.uuid4())

        request_id_context.set(req_id)

        # We also put it in request.state for easy access
        request.state.request_id = req_id

        # 2. Process Request
        response: Response = await call_next(request)

        # 3. Add Request ID to response
        response.headers["X-Request-ID"] = req_id

        # 4. Add Security Headers
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "no-referrer"

        # Don't add Cache-Control: no-store globally as it breaks things,
        # but could be added for sensitive endpoints.

        return response
