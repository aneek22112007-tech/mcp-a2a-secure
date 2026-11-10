import io
import sys

from alembic.config import Config

from alembic import command
from app.config import Settings, normalize_database_url
from app.database import engine as default_engine
from app.main import app  # noqa: F401


def test_normalize_postgres_scheme():
    raw = "postgres://user:secret@localhost:5432/mcp_guard"
    expected = "postgresql+asyncpg://user:secret@localhost:5432/mcp_guard"
    assert normalize_database_url(raw) == expected

    settings = Settings(database_url=raw, _env_file=None)
    assert settings.database_url == expected


def test_normalize_postgresql_scheme():
    raw = "postgresql://user:secret@localhost:5432/mcp_guard"
    expected = "postgresql+asyncpg://user:secret@localhost:5432/mcp_guard"
    assert normalize_database_url(raw) == expected

    settings = Settings(database_url=raw, _env_file=None)
    assert settings.database_url == expected


def test_preserve_already_normalized_postgresql_asyncpg():
    raw = "postgresql+asyncpg://user:secret@localhost:5432/mcp_guard"
    assert normalize_database_url(raw) == raw

    settings = Settings(database_url=raw, _env_file=None)
    assert settings.database_url == raw


def test_preserve_sqlite_urls():
    sqlite_urls = [
        "sqlite+aiosqlite:///data/mcp_guard.db",
        "sqlite:///:memory:",
        "sqlite:///var/data/custom.db",
    ]
    for url in sqlite_urls:
        assert normalize_database_url(url) == url
        settings = Settings(database_url=url, _env_file=None)
        assert settings.database_url == url


def test_sqlite_remains_default(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    settings = Settings(_env_file=None)
    assert settings.database_url.startswith("sqlite+aiosqlite:///")
    assert default_engine.name == "sqlite"


def test_alembic_url_normalization_with_sqlalchemy_url():
    """Verify that Alembic normalizes postgres:// to postgresql+asyncpg:// when set via config."""
    cfg = Config("alembic.ini")
    cfg.set_main_option(
        "sqlalchemy.url",
        "postgres://user:secret@localhost:5432/mcp_guard",
    )

    old_stdout = sys.stdout
    sys.stdout = io.StringIO()
    try:
        command.upgrade(cfg, "head", sql=True)
        out = sys.stdout.getvalue()
    finally:
        sys.stdout = old_stdout

    assert len(out) > 0
    assert "CREATE TABLE alembic_version" in out
    assert "mcp_guard_audit_events_guard" in out


def test_alembic_url_normalization_with_database_url_env(monkeypatch):
    """Verify that Alembic normalizes postgresql:// to postgresql+asyncpg:// when set via DATABASE_URL."""
    cfg = Config("alembic.ini")
    cfg.set_main_option("sqlalchemy.url", "")
    monkeypatch.setenv(
        "DATABASE_URL",
        "postgresql://user:secret@localhost:5432/mcp_guard",
    )

    old_stdout = sys.stdout
    sys.stdout = io.StringIO()
    try:
        command.upgrade(cfg, "head", sql=True)
        out = sys.stdout.getvalue()
    finally:
        sys.stdout = old_stdout

    assert len(out) > 0
    assert "CREATE TABLE alembic_version" in out
    assert "mcp_guard_audit_events_guard" in out


def test_normalize_edge_cases_and_invalid_inputs():
    # Whitespace stripping
    assert (
        normalize_database_url("  postgresql://localhost:5432/db  ")
        == "postgresql+asyncpg://localhost:5432/db"
    )
    assert (
        normalize_database_url("\npostgres://localhost/db\t")
        == "postgresql+asyncpg://localhost/db"
    )

    # Query parameters and encoded characters preserved
    query_url = "postgresql://user:p%40ss@host:5432/db?ssl=require&timeout=10"
    assert (
        normalize_database_url(query_url)
        == "postgresql+asyncpg://user:p%40ss@host:5432/db?ssl=require&timeout=10"
    )

    # Other database schemes untouched
    assert (
        normalize_database_url("mysql://user:pass@host/db")
        == "mysql://user:pass@host/db"
    )

    # Empty string and non-string inputs
    assert normalize_database_url("") == ""
    assert normalize_database_url(None) is None  # type: ignore[arg-type]
    assert normalize_database_url(12345) == 12345  # type: ignore[arg-type]
