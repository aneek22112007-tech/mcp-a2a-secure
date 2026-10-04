import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.middleware import request_id_context

logger = logging.getLogger(__name__)

_ERROR_CODES = {
    400: "BAD_REQUEST",
    401: "UNAUTHORIZED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    405: "METHOD_NOT_ALLOWED",
    413: "PAYLOAD_TOO_LARGE",
    422: "VALIDATION_ERROR",
    429: "RATE_LIMITED",
    500: "INTERNAL_SERVER_ERROR",
    503: "SERVICE_UNAVAILABLE",
    504: "GATEWAY_TIMEOUT",
}


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(
        request: Request, exc: RequestValidationError
    ):
        return JSONResponse(
            status_code=422,
            content={
                "error": {
                    "code": "VALIDATION_ERROR",
                    "message": "The request could not be processed.",
                    "details": _public_validation_errors(exc),
                    "request_id": _request_id(request),
                }
            },
        )

    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(request: Request, exc: StarletteHTTPException):
        return JSONResponse(
            status_code=exc.status_code,
            headers=getattr(exc, "headers", None),
            content={
                "error": {
                    "code": _ERROR_CODES.get(exc.status_code, "HTTP_ERROR"),
                    "message": _public_http_message(exc),
                    "details": None,
                    "request_id": _request_id(request),
                }
            },
        )

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception):
        # Log the type and traceback for operators. The client message stays generic
        # and does not include the exception text, paths, or SQL.
        request_id = _request_id(request)
        logger.exception(
            "Unhandled server exception type=%s request_id=%s",
            type(exc).__name__,
            request_id,
        )
        return JSONResponse(
            status_code=500,
            content={
                "error": {
                    "code": "INTERNAL_SERVER_ERROR",
                    "message": "An unexpected error occurred.",
                    "details": None,
                    "request_id": request_id,
                }
            },
        )


def _public_validation_errors(exc: RequestValidationError) -> list[dict[str, object]]:
    public: list[dict[str, object]] = []
    for error in exc.errors():
        public.append(
            {
                "loc": error.get("loc"),
                "msg": error.get("msg"),
                "type": error.get("type"),
            }
        )
    return public


def _public_http_message(exc: StarletteHTTPException) -> str:
    if exc.status_code >= 500 and exc.status_code not in (503, 504):
        return "An unexpected error occurred."
    if isinstance(exc.detail, str) and exc.detail:
        return exc.detail
    return "An error occurred."


def _request_id(request: Request | None = None) -> str | None:
    current = request_id_context.get()
    if current:
        return current
    # The scope keeps a copy for callers that run after the context variable is cleared.
    if request is not None:
        stored = request.scope.get("mcp_guard.request_id")
        if isinstance(stored, str) and stored:
            return stored
    return None
