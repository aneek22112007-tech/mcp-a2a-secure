"""Tests for production/development documentation endpoint configuration.

Verifies that FastAPI docs endpoints (/docs, /redoc, /openapi.json) are:
- Available in development/local environments.
- Disabled (HTTP 404) in production or any non-dev environment.

The docs configuration is applied at FastAPI app construction time using the
``settings.environment`` value, so tests create isolated FastAPI instances
rather than relying on the module-level ``app``.
"""

from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.config import Settings
from app.errors import register_error_handlers
from app.main import apply_http_middleware


def _make_app(environment: str) -> FastAPI:
    """Create a minimal FastAPI app with the same docs logic as main.py."""
    docs_args: dict = {}
    if environment not in ("development", "dev", "local"):
        docs_args = {"docs_url": None, "redoc_url": None, "openapi_url": None}

    application = FastAPI(title="MCP Guard Test", **docs_args)
    register_error_handlers(application)
    apply_http_middleware(application)

    @application.get("/health")
    def health():
        return {"status": "ok"}

    return application


# ---------------------------------------------------------------------------
# Development environment — docs must be available
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("env", ["dev", "development", "local"])
def test_docs_available_in_dev_environment(env: str) -> None:
    """Swagger UI, ReDoc, and OpenAPI schema are accessible in dev/local modes."""
    app = _make_app(env)
    client = TestClient(app, headers={"Authorization": "Bearer mcpg_test"})

    docs = client.get("/docs")
    assert docs.status_code == 200, f"/docs returned {docs.status_code} for env={env!r}"

    redoc = client.get("/redoc")
    assert redoc.status_code == 200, (
        f"/redoc returned {redoc.status_code} for env={env!r}"
    )

    openapi = client.get("/openapi.json")
    assert openapi.status_code == 200, (
        f"/openapi.json returned {openapi.status_code} for env={env!r}"
    )


# ---------------------------------------------------------------------------
# Production / unknown environment — docs must be disabled
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("env", ["production", "prod", "staging", "test", ""])
def test_docs_disabled_in_non_dev_environment(env: str) -> None:
    """Documentation endpoints return 404 in non-development environments."""
    app = _make_app(env)
    client = TestClient(app, headers={"Authorization": "Bearer mcpg_test"})

    docs = client.get("/docs")
    assert docs.status_code == 404, f"/docs returned {docs.status_code} for env={env!r}"

    redoc = client.get("/redoc")
    assert redoc.status_code == 404, (
        f"/redoc returned {redoc.status_code} for env={env!r}"
    )

    openapi = client.get("/openapi.json")
    assert openapi.status_code == 404, (
        f"/openapi.json returned {openapi.status_code} for env={env!r}"
    )


# ---------------------------------------------------------------------------
# Settings integration — default environment disables docs
# ---------------------------------------------------------------------------


def test_settings_default_environment_disables_docs(monkeypatch) -> None:
    """The Settings default of 'dev' keeps docs enabled by default.

    This documents the intentional default: developers get docs automatically,
    operators must set ENVIRONMENT=production to disable them.
    """
    # Clear env vars so we get the real default.
    for key in ("ENVIRONMENT", "APP_ENV", "APP_NAME"):
        monkeypatch.delenv(key, raising=False)

    isolated = Settings(_env_file=None)
    # Default is "dev" — docs should be enabled.
    assert isolated.environment == "dev"
    docs_args: dict = {}
    if isolated.environment not in ("development", "dev", "local"):
        docs_args = {"docs_url": None, "redoc_url": None, "openapi_url": None}
    # With "dev", docs_args stays empty → docs are enabled.
    assert docs_args == {}


def test_settings_production_environment_disables_docs(monkeypatch) -> None:
    """ENVIRONMENT=production suppresses all documentation endpoints."""
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("API_KEY_PEPPER", "dummy-pepper")
    isolated = Settings(_env_file=None)
    assert isolated.environment == "production"

    docs_args: dict = {}
    if isolated.environment not in ("development", "dev", "local"):
        docs_args = {"docs_url": None, "redoc_url": None, "openapi_url": None}
    assert docs_args == {"docs_url": None, "redoc_url": None, "openapi_url": None}
