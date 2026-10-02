import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.middleware import request_id_context

logger = logging.getLogger(__name__)


def register_error_handlers(app: FastAPI):

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(
        request: Request, exc: RequestValidationError
    ):
        req_id = request_id_context.get()
        return JSONResponse(
            status_code=422,
            content={
                "error": {
                    "code": "VALIDATION_ERROR",
                    "message": "The request could not be processed.",
                    "details": exc.errors(),
                    "request_id": req_id,
                }
            },
        )

    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(request: Request, exc: StarletteHTTPException):
        req_id = request_id_context.get()

        # Determine code based on status_code
        code = "HTTP_ERROR"
        if exc.status_code == 404:
            code = "NOT_FOUND"
        elif exc.status_code == 400:
            code = "BAD_REQUEST"
        elif exc.status_code == 403:
            code = "FORBIDDEN"
        elif exc.status_code == 413:
            code = "PAYLOAD_TOO_LARGE"
        elif exc.status_code == 504:
            code = "GATEWAY_TIMEOUT"
        elif exc.status_code == 500:
            code = "INTERNAL_SERVER_ERROR"

        return JSONResponse(
            status_code=exc.status_code,
            content={
                "error": {
                    "code": code,
                    "message": getattr(exc, "detail", "An error occurred."),
                    "details": None,
                    "request_id": req_id,
                }
            },
        )

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception):
        req_id = request_id_context.get()
        logger.exception(
            "Unhandled server exception for request %s: %s", req_id, str(exc)
        )
        return JSONResponse(
            status_code=500,
            content={
                "error": {
                    "code": "INTERNAL_SERVER_ERROR",
                    "message": "An unexpected error occurred.",
                    "details": None,
                    "request_id": req_id,
                }
            },
        )
