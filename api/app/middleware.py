"""Plain ASGI middleware for request limits, request ids, and security headers."""

from __future__ import annotations

import contextvars
import json
import logging
import re
import uuid

from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.config import settings

request_id_context: contextvars.ContextVar[str] = contextvars.ContextVar(
    "request_id",
    default="",
)

_REQUEST_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$")
_CONTENT_LENGTH_RE = re.compile(rb"[0-9]+")
# Longer digit strings are rejected before int() so a huge header cannot stall the process.
_MAX_CONTENT_LENGTH_DIGITS = 18

STRICT_CSP = "default-src 'none'; frame-ancestors 'none'"
# Swagger UI loads scripts and styles from the FastAPI CDN and calls
# back to this origin for the OpenAPI document. Every other route stays strict.
DOCS_CSP = (
    "default-src 'none'; "
    "connect-src 'self'; "
    "script-src 'unsafe-inline' https://cdn.jsdelivr.net; "
    "style-src 'unsafe-inline' https://cdn.jsdelivr.net; "
    "img-src 'self' data: https://fastapi.tiangolo.com; "
    "frame-ancestors 'none'"
)

_SECURITY_HEADER_NAMES = (
    b"x-content-type-options",
    b"x-frame-options",
    b"referrer-policy",
    b"content-security-policy",
)


class RequestIdLogFilter(logging.Filter):
    """Attach the current request id to log records.

    Startup and third-party records have no request context. They receive a
    stable placeholder so format strings that include ``request_id`` do not fail.
    """

    def filter(self, record: logging.LogRecord) -> bool:
        current = request_id_context.get()
        record.request_id = current if current else "-"
        return True


_logging_installed = False


def install_request_id_logging() -> None:
    """Install the request-id filter once per process."""

    global _logging_installed
    if _logging_installed:
        return
    _logging_installed = True

    previous_factory = logging.getLogRecordFactory()

    def record_factory(*args, **kwargs):
        record = previous_factory(*args, **kwargs)
        current = request_id_context.get()
        record.request_id = current if current else "-"
        return record

    logging.setLogRecordFactory(record_factory)

    request_filter = RequestIdLogFilter()
    root = logging.getLogger()
    for handler in root.handlers:
        if not any(isinstance(item, RequestIdLogFilter) for item in handler.filters):
            handler.addFilter(request_filter)


class RequestContextMiddleware:
    """Accept a safe client request id, or replace it with a generated one."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        request_id = _accepted_request_id(scope)
        if request_id is None:
            request_id = str(uuid.uuid4())
        _replace_header(scope, b"x-request-id", request_id.encode("ascii"))
        state = scope.setdefault("state", {})
        if isinstance(state, dict):
            state["request_id"] = request_id

        scope["mcp_guard.request_id"] = request_id
        token = request_id_context.set(request_id)
        try:

            async def send_with_request_id(message: Message) -> None:
                if message["type"] == "http.response.start":
                    headers = _without(message.get("headers", []), b"x-request-id")
                    headers.append((b"x-request-id", request_id.encode("ascii")))
                    message = {**message, "headers": headers}
                await send(message)

            await self.app(scope, receive, send_with_request_id)
        finally:
            request_id_context.reset(token)


class SecurityHeadersMiddleware:
    """Add security headers to every HTTP response, including errors and preflight."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        csp = _csp_for_path(scope.get("path", "")).encode("ascii")

        async def send_with_security_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = _without(message.get("headers", []), *_SECURITY_HEADER_NAMES)
                headers.extend(
                    (
                        (b"x-content-type-options", b"nosniff"),
                        (b"x-frame-options", b"DENY"),
                        (b"referrer-policy", b"no-referrer"),
                        (b"content-security-policy", csp),
                    )
                )
                if not _has_header(headers, b"x-request-id"):
                    current = _request_id_for_scope(scope)
                    if current:
                        headers.append((b"x-request-id", current.encode("ascii")))
                message = {**message, "headers": headers}
            await send(message)

        await self.app(scope, receive, send_with_security_headers)


class _ResponseGate:
    def __init__(self) -> None:
        self.started = False


class BodySizeLimitMiddleware:
    """Reject oversized bodies before they reach the application.

    A valid ``Content-Length`` above the limit is rejected without reading the
    body. Otherwise the body is counted as it arrives. At most ``max_body_bytes``
    are retained, and an oversized request is not forwarded downstream.
    """

    def __init__(self, app: ASGIApp, max_body_bytes: int | None = None) -> None:
        self.app = app
        self._max_body_bytes = max_body_bytes

    def _limit(self) -> int:
        if self._max_body_bytes is not None:
            return self._max_body_bytes
        return settings.max_body_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        gate = _ResponseGate()

        async def tracked_send(message: Message) -> None:
            if message["type"] == "http.response.start":
                gate.started = True
            await send(message)

        limit = self._limit()
        lengths = _header_values(scope, b"content-length")
        if len(lengths) > 1:
            await _send_error(
                send,
                gate,
                400,
                "BAD_REQUEST",
                "Content-Length must be a single non-negative integer.",
            )
            return
        if lengths:
            raw_length = lengths[0]
            if not _CONTENT_LENGTH_RE.fullmatch(raw_length):
                await _send_error(
                    send,
                    gate,
                    400,
                    "BAD_REQUEST",
                    "Content-Length must be a non-negative integer.",
                )
                return
            # Digit length is checked first so int() is never called on a huge header.
            if len(raw_length) > _MAX_CONTENT_LENGTH_DIGITS or int(raw_length) > limit:
                await _send_error(
                    send,
                    gate,
                    413,
                    "PAYLOAD_TOO_LARGE",
                    "Request body exceeds the configured limit.",
                )
                return

        buffered: list[Message] = []
        total = 0
        while True:
            message = await receive()
            kind = message["type"]
            if kind == "http.disconnect":
                return
            if kind != "http.request":
                buffered.append(message)
                break
            body = message.get("body", b"") or b""
            if not isinstance(body, (bytes, bytearray)):
                await _send_error(
                    send,
                    gate,
                    400,
                    "BAD_REQUEST",
                    "Request body must be bytes.",
                )
                return
            if total + len(body) > limit:
                await _send_error(
                    send,
                    gate,
                    413,
                    "PAYLOAD_TOO_LARGE",
                    "Request body exceeds the configured limit.",
                )
                return
            total += len(body)
            buffered.append(message)
            if not message.get("more_body", False):
                break

        index = 0

        async def replay() -> Message:
            nonlocal index
            if index < len(buffered):
                message = buffered[index]
                index += 1
                return message
            # Further reads belong to the real client. Synthesizing empty body
            # messages here busy-loops transports that read until disconnect.
            return await receive()

        await self.app(scope, replay, tracked_send)


def _request_id_for_scope(scope: Scope) -> str:
    """Return the request id even after the context variable has been reset."""

    current = request_id_context.get()
    if current:
        return current
    stored = scope.get("mcp_guard.request_id")
    if isinstance(stored, str):
        return stored
    return ""


def _accepted_request_id(scope: Scope) -> str | None:
    values = _header_values(scope, b"x-request-id")
    if len(values) != 1:
        return None
    try:
        text = values[0].decode("ascii")
    except UnicodeDecodeError:
        return None
    if _REQUEST_ID_RE.fullmatch(text):
        return text
    return None


def _csp_for_path(path: str) -> str:
    if path == "/docs" or path.startswith("/docs/"):
        return DOCS_CSP
    return STRICT_CSP


def _header_values(scope: Scope, name: bytes) -> list[bytes]:
    return [value for key, value in scope.get("headers", []) if key.lower() == name]


def _replace_header(scope: Scope, name: bytes, value: bytes) -> None:
    headers = _without(scope.get("headers", []), name)
    headers.append((name, value))
    scope["headers"] = headers


def _without(
    headers: list[tuple[bytes, bytes]], *names: bytes
) -> list[tuple[bytes, bytes]]:
    blocked = set(names)
    return [(key, value) for key, value in headers if key.lower() not in blocked]


def _has_header(headers: list[tuple[bytes, bytes]], name: bytes) -> bool:
    return any(key.lower() == name for key, _value in headers)


async def _send_error(
    send: Send,
    gate: "_ResponseGate | None",
    status: int,
    code: str,
    message: str,
    *,
    extra_headers: list[tuple[bytes, bytes]] | None = None,
) -> None:
    """Send one JSON error. A second call is ignored once headers have started."""

    if gate is not None and gate.started:
        return
    if gate is not None:
        gate.started = True
    request_id = request_id_context.get() or None
    payload = json.dumps(
        {
            "error": {
                "code": code,
                "message": message,
                "details": None,
                "request_id": request_id,
            }
        },
        separators=(",", ":"),
    ).encode("utf-8")
    
    headers = [
        (b"content-type", b"application/json"),
        (b"content-length", str(len(payload)).encode("ascii")),
    ]
    if extra_headers:
        headers.extend(extra_headers)

    await send(
        {
            "type": "http.response.start",
            "status": status,
            "headers": headers,
        }
    )
    await send({"type": "http.response.body", "body": payload, "more_body": False})

