from fastapi.testclient import TestClient

from app.main import app


def test_mcp_http_transport():
    with TestClient(
        app,
        base_url="http://localhost:8000",
        headers={"Authorization": "Bearer mcpg_test"},
    ) as client:
        init_res = client.post(
            "/mcp/",
            headers={
                "Accept": "application/json, text/event-stream",
                "Content-Type": "application/json",
            },
            json={
                "jsonrpc": "2.0",
                "id": 1,
                "method": "initialize",
                "params": {
                    "protocolVersion": "2024-11-05",
                    "capabilities": {},
                    "clientInfo": {"name": "test-client", "version": "1.0.0"},
                },
            },
        )
        assert init_res.status_code == 200
