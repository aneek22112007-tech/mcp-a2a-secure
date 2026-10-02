from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_request_id_generated():
    res = client.get("/health")
    assert res.status_code == 200
    assert "X-Request-ID" in res.headers
    assert len(res.headers["X-Request-ID"]) > 0


def test_request_id_accepted():
    res = client.get("/health", headers={"X-Request-ID": "test-req-id"})
    assert res.status_code == 200
    assert res.headers["X-Request-ID"] == "test-req-id"


def test_request_id_too_long():
    long_id = "a" * 100
    res = client.get("/health", headers={"X-Request-ID": long_id})
    assert res.status_code == 200
    # Should generate a new one since provided one is too long
    assert res.headers["X-Request-ID"] != long_id


def test_security_headers():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.headers["X-Content-Type-Options"] == "nosniff"
    assert res.headers["X-Frame-Options"] == "DENY"
    assert res.headers["Referrer-Policy"] == "no-referrer"


def test_error_response_format():
    res = client.get("/non-existent-path")
    assert res.status_code == 404
    data = res.json()
    assert "error" in data
    assert data["error"]["code"] == "NOT_FOUND"
    assert "request_id" in data["error"]
    assert data["error"]["request_id"] == res.headers.get("X-Request-ID")


def test_validation_error_format():
    res = client.put("/api/notes/testnote", json={"wrong_field": True})
    assert res.status_code == 422
    data = res.json()
    assert "error" in data
    assert data["error"]["code"] == "VALIDATION_ERROR"
    assert data["error"]["details"] is not None


def test_gateway_error_format():
    res = client.get("/api/notes/nonexistent123")
    assert res.status_code == 404
    data = res.json()
    assert "error" in data
    assert data["error"]["code"] == "NOT_FOUND"
