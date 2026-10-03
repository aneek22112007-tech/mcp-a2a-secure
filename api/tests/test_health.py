from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app, headers={"Authorization": "Bearer mcpg_test"})


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
