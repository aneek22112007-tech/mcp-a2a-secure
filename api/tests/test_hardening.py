import asyncio
import json
import logging
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from httpx import ASGITransport, AsyncClient

from app.config import settings
from app.errors import register_error_handlers
from app.main import app, apply_http_middleware
from app.middleware import (
    DOCS_CSP,
    STRICT_CSP,
    BodySizeLimitMiddleware,
    RequestIdLogFilter,
    _ResponseGate,
    _send_error,
    install_request_id_logging,
    request_id_context,
)

pytestmark = pytest.mark.anyio

client = TestClient(app)


def _isolated_app() -> FastAPI:
    """Same middleware stack as the process app, without mutating its routes."""

    application = FastAPI()
    register_error_handlers(application)
    apply_http_middleware(application)
    return application


def test_cors_rejects_untrusted_origin():
    response = client.get("/health", headers={"Origin": "https://evil.example"})
    assert response.status_code == 200
    assert "access-control-allow-origin" not in response.headers
    assert response.headers.get("access-control-allow-origin") != "*"


def test_cors_preflight_allows_configured_origin_and_headers():
    response = client.options(
        "/api/notes",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "Authorization,Content-Type,X-Request-ID",
        },
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"
    allowed = response.headers["access-control-allow-headers"].lower()
    assert "authorization" in allowed
    assert "content-type" in allowed
    assert "x-request-id" in allowed
    assert response.headers["x-request-id"]
    assert response.headers["content-security-policy"] == STRICT_CSP
    assert response.headers["x-content-type-options"] == "nosniff"


def test_cors_preflight_rejects_untrusted_origin():
    response = client.options(
        "/api/notes",
        headers={
            "Origin": "https://evil.example",
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "Authorization",
        },
    )
    assert "access-control-allow-origin" not in response.headers


def test_csp_is_strict_except_on_docs():
    health = client.get("/health")
    assert health.status_code == 200
    assert health.headers["content-security-policy"] == STRICT_CSP
    assert health.headers["x-frame-options"] == "DENY"
    assert health.headers["referrer-policy"] == "no-referrer"

    docs = client.get("/docs")
    assert docs.status_code == 200
    assert docs.headers["content-security-policy"] == DOCS_CSP
    assert "cdn.jsdelivr.net" in docs.headers["content-security-policy"]
    assert "cdn.jsdelivr.net" not in health.headers["content-security-policy"]


def test_content_length_over_limit_is_413(monkeypatch):
    monkeypatch.setattr(settings, "max_body_bytes", 32)
    response = client.post("/health", content=b"x" * 33)
    assert response.status_code == 413
    body = response.json()
    assert body["error"]["code"] == "PAYLOAD_TOO_LARGE"
    assert body["error"]["request_id"] == response.headers["x-request-id"]
    assert response.headers["content-security-policy"] == STRICT_CSP
    assert "x" * 33 not in response.text


def test_body_within_limit_is_streamed(monkeypatch):
    monkeypatch.setattr(settings, "max_body_bytes", 32)
    response = client.post("/health", content=b"x" * 32)
    assert response.status_code == 405
    assert response.json()["error"]["code"] == "METHOD_NOT_ALLOWED"


async def test_chunked_body_over_limit_is_413(monkeypatch):
    monkeypatch.setattr(settings, "max_body_bytes", 32)
    sent: list[dict] = []

    async def receive():
        if not chunks:
            return {"type": "http.disconnect"}
        return chunks.pop(0)

    chunks = [
        {"type": "http.request", "body": b"a" * 20, "more_body": True},
        {"type": "http.request", "body": b"b" * 20, "more_body": False},
    ]

    async def send(message):
        sent.append(message)

    scope = _scope("POST", "/health")
    await app(scope, receive, send)
    start = next(
        message for message in sent if message["type"] == "http.response.start"
    )
    assert start["status"] == 413
    payload = _json_body(sent)
    assert payload["error"]["code"] == "PAYLOAD_TOO_LARGE"
    header_map = {key.lower(): value for key, value in start["headers"]}
    assert header_map[b"content-security-policy"] == STRICT_CSP.encode()
    assert header_map[b"x-request-id"]


async def test_leading_zero_content_length_is_accepted():
    body = b"x" * 17
    sent: list[dict] = []

    async def receive():
        return {"type": "http.request", "body": body, "more_body": False}

    async def send(message):
        sent.append(message)

    scope = _scope("POST", "/health", headers=[(b"content-length", b"017")])
    await app(scope, receive, send)
    start = next(
        message for message in sent if message["type"] == "http.response.start"
    )
    assert start["status"] == 405


async def test_huge_content_length_is_413():
    sent: list[dict] = []

    async def receive():
        raise AssertionError("oversized Content-Length was read")

    async def send(message):
        sent.append(message)

    scope = _scope(
        "POST",
        "/health",
        headers=[(b"content-length", b"1" * 4400)],
    )
    await app(scope, receive, send)
    start = next(
        message for message in sent if message["type"] == "http.response.start"
    )
    assert start["status"] == 413
    assert _json_body(sent)["error"]["code"] == "PAYLOAD_TOO_LARGE"


async def test_malformed_content_length_is_400():
    sent: list[dict] = []

    async def receive():
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(message):
        sent.append(message)

    scope = _scope(
        "POST",
        "/health",
        headers=[(b"content-length", b"nope")],
    )
    await app(scope, receive, send)
    start = next(
        message for message in sent if message["type"] == "http.response.start"
    )
    assert start["status"] == 400
    payload = _json_body(sent)
    assert payload["error"]["code"] == "BAD_REQUEST"
    assert "nope" not in json.dumps(payload)


def test_internal_error_hides_details_and_keeps_headers(caplog):
    application = _isolated_app()

    @application.get("/explode")
    async def explode():
        raise RuntimeError("SECRET_DB_PASSWORD /Users/hidden SELECT * FROM api_keys")

    # Starlette re-raises after the 500 handler so servers can log it.
    # The response itself is what this test has to observe.
    caplog.set_level(logging.ERROR, logger="app.errors")
    quiet = TestClient(application, raise_server_exceptions=False)
    response = quiet.get("/explode", headers={"X-Request-ID": "err-500-id"})
    assert response.status_code == 500
    body = response.json()
    assert body["error"]["code"] == "INTERNAL_SERVER_ERROR"
    assert body["error"]["message"] == "An unexpected error occurred."
    assert body["error"]["details"] is None
    assert body["error"]["request_id"] == response.headers["x-request-id"]
    assert "SECRET_DB_PASSWORD" not in response.text
    assert "SELECT" not in response.text
    assert "/Users/hidden" not in response.text
    assert response.headers["content-security-policy"] == STRICT_CSP
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-request-id"] == "err-500-id"
    error_logs = [record for record in caplog.records if record.name == "app.errors"]
    assert error_logs
    assert error_logs[-1].request_id == "err-500-id"
    assert error_logs[-1].request_id != "-"


def test_gateway_timeout_response_format(monkeypatch):
    monkeypatch.setattr(settings, "tool_timeout_s", 0.05)

    async def slow(name, args):
        await asyncio.sleep(5)

    monkeypatch.setattr("app.gateway._dispatch", slow)
    response = client.get("/api/notes")
    assert response.status_code == 504
    body = response.json()
    assert body["error"]["code"] == "GATEWAY_TIMEOUT"
    assert "did not complete within" in body["error"]["message"]
    assert body["error"]["request_id"] == response.headers["x-request-id"]
    assert response.headers["content-security-policy"] == STRICT_CSP
    assert "Traceback" not in response.text


def test_method_not_allowed_uses_error_envelope():
    response = client.post("/health")
    assert response.status_code == 405
    body = response.json()
    assert body["error"]["code"] == "METHOD_NOT_ALLOWED"
    assert body["error"]["request_id"] == response.headers["x-request-id"]
    assert response.headers["x-frame-options"] == "DENY"


def test_validation_error_does_not_echo_input():
    response = client.put(
        "/api/notes/testnote",
        json={"content": {"leak": "SECRET_INPUT_VALUE"}},
    )
    assert response.status_code == 422
    body = response.json()
    assert body["error"]["code"] == "VALIDATION_ERROR"
    assert body["error"]["details"]
    for item in body["error"]["details"]:
        assert set(item) == {"loc", "msg", "type"}
    assert "SECRET_INPUT_VALUE" not in response.text
    assert "leak" not in response.text


def test_overlong_and_invalid_request_ids_are_replaced():
    overlong = "a" * 100
    response = client.get("/health", headers={"X-Request-ID": overlong})
    assert response.headers["x-request-id"] != overlong
    assert len(response.headers["x-request-id"]) <= 64

    invalid = "bad id\r\nX-Injected: yes"
    response = client.get("/health", headers={"X-Request-ID": invalid})
    assert response.headers["x-request-id"] != invalid
    assert "\n" not in response.headers["x-request-id"]
    assert "X-Injected" not in response.headers["x-request-id"]


def test_request_context_is_reset_after_the_response():
    response = client.get("/health", headers={"X-Request-ID": "req-one"})
    assert response.headers["x-request-id"] == "req-one"
    assert request_id_context.get() == ""
    response = client.get("/health", headers={"X-Request-ID": "req-two"})
    assert response.headers["x-request-id"] == "req-two"
    assert request_id_context.get() == ""


async def test_request_ids_stay_isolated_across_concurrent_requests():
    application = _isolated_app()

    @application.get("/whoami")
    async def whoami():
        await asyncio.sleep(0.05)
        return {"request_id": request_id_context.get()}

    async def one(http: AsyncClient, request_id: str) -> tuple[str, str]:
        response = await http.get(
            "/whoami",
            headers={"X-Request-ID": request_id},
        )
        return response.headers["x-request-id"], response.json()["request_id"]

    transport = ASGITransport(app=application)
    async with AsyncClient(transport=transport, base_url="http://test") as http:
        first, second = await asyncio.gather(
            one(http, "alpha-id"), one(http, "beta-id")
        )
    assert first == ("alpha-id", "alpha-id")
    assert second == ("beta-id", "beta-id")
    assert request_id_context.get() == ""


def test_log_filter_uses_context_and_safe_fallback():
    request_filter = RequestIdLogFilter()
    record = logging.LogRecord("test", logging.INFO, __file__, 1, "hello", (), None)
    assert request_filter.filter(record) is True
    assert record.request_id == "-"
    assert logging.Formatter("%(request_id)s %(message)s").format(record) == "- hello"

    token = request_id_context.set("req-log")
    try:
        active = logging.LogRecord("test", logging.INFO, __file__, 1, "hello", (), None)
        assert request_filter.filter(active) is True
        assert active.request_id == "req-log"
    finally:
        request_id_context.reset(token)
    assert request_id_context.get() == ""


def test_request_id_logging_install_is_idempotent():
    install_request_id_logging()
    install_request_id_logging()
    root = logging.getLogger()
    assert not any(isinstance(item, RequestIdLogFilter) for item in root.filters)
    record = logging.getLogRecordFactory()(
        "app.test", logging.INFO, __file__, 1, "hello", (), None
    )
    assert record.request_id == "-"


def test_log_config_formats_request_id():
    config_path = Path(__file__).resolve().parents[1] / "log_config.json"
    config = json.loads(config_path.read_text())
    default_format = config["formatters"]["default"]["format"]
    access_format = config["formatters"]["access"]["format"]
    assert "%(request_id)s" in default_format
    assert "%(request_id)s" in access_format

    token = request_id_context.set("fmt-req")
    try:
        record = logging.getLogRecordFactory()(
            "app.test", logging.INFO, __file__, 1, "hello", (), None
        )
    finally:
        request_id_context.reset(token)
    assert "rid=fmt-req" in logging.Formatter(default_format).format(record)

    bare = logging.getLogRecordFactory()(
        "uvicorn.access", logging.INFO, __file__, 1, "GET /health", (), None
    )
    assert "rid=-" in logging.Formatter(access_format).format(bare)


async def test_empty_terminal_body_chunk_is_preserved():
    seen: list[dict] = []

    async def inner(scope, receive, send):
        del scope
        while True:
            message = await receive()
            seen.append(message)
            if message["type"] != "http.request" or not message.get("more_body", False):
                break
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b"ok", "more_body": False})

    middleware = BodySizeLimitMiddleware(inner, max_body_bytes=100)
    messages = [
        {"type": "http.request", "body": b"hi", "more_body": True},
        {"type": "http.request", "body": b"", "more_body": False},
    ]

    async def receive():
        return messages.pop(0)

    sent: list[dict] = []

    async def send(message):
        sent.append(message)

    await middleware(_scope("POST", "/health"), receive, send)
    assert seen[0]["body"] == b"hi"
    assert seen[1]["body"] == b""
    assert seen[1]["more_body"] is False
    assert sent[0]["status"] == 200


async def test_disconnect_does_not_send_a_response():
    async def receive():
        return {"type": "http.disconnect"}

    sent: list[dict] = []

    async def send(message):
        sent.append(message)

    await app(_scope("POST", "/health"), receive, send)
    assert sent == []


async def test_error_sender_does_not_write_a_second_response():
    gate = _ResponseGate()
    sent: list[str] = []

    async def send(message):
        sent.append(message["type"])

    await _send_error(send, gate, 413, "PAYLOAD_TOO_LARGE", "too large")
    await _send_error(send, gate, 413, "PAYLOAD_TOO_LARGE", "too large")
    assert sent == ["http.response.start", "http.response.body"]


def _scope(
    method: str, path: str, headers: list[tuple[bytes, bytes]] | None = None
) -> dict:
    return {
        "type": "http",
        "asgi": {"version": "3.0", "spec_version": "2.3"},
        "http_version": "1.1",
        "method": method,
        "scheme": "http",
        "path": path,
        "raw_path": path.encode(),
        "query_string": b"",
        "headers": headers or [],
        "client": ("127.0.0.1", 50000),
        "server": ("testserver", 80),
        "root_path": "",
    }


def _json_body(messages: list[dict]) -> dict:
    body = b"".join(
        message.get("body", b"")
        for message in messages
        if message["type"] == "http.response.body"
    )
    return json.loads(body)
