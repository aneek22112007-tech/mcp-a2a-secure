import os
import sqlite3
import subprocess
import sys
from datetime import UTC, datetime, timedelta, timezone
from pathlib import Path

import pytest
from alembic.config import Config
from sqlalchemy import inspect, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from alembic import command
from app.database import enable_sqlite_foreign_keys
from app.models import ApiKey, AuditEvent, Base, Client
from app.repos import clients

pytestmark = pytest.mark.anyio


@pytest.fixture
async def session(tmp_path):
    import app.database  # noqa: F401

    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path}/integrity.db")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with maker() as db:
        yield db
        await db.rollback()
    await engine.dispose()


def _alembic_config(database: Path) -> Config:
    url = f"sqlite+aiosqlite:///{database}"
    config = Config("alembic.ini")
    config.set_main_option("sqlalchemy.url", url)
    return config


async def test_sqlite_foreign_keys_are_enforced(session):
    async with session.begin():
        pragma = await session.execute(text("PRAGMA foreign_keys"))
    assert pragma.scalar() == 1

    async with session.begin():
        client = Client(name="owner", status="active")
        session.add(client)
        await session.flush()
        session.add(
            ApiKey(
                client_id=client.id,
                name="primary",
                key_prefix="pref",
                key_hash="hash",
                scopes=[],
            )
        )

    with pytest.raises(IntegrityError):
        async with session.begin():
            session.add(
                ApiKey(
                    client_id="missing",
                    name="orphan",
                    key_prefix="other",
                    key_hash="other-hash",
                    scopes=[],
                )
            )
            await session.flush()


def test_non_sqlite_listener_does_not_emit_sql():
    class Connection:
        def cursor(self):
            raise AssertionError("PRAGMA was executed for a non-SQLite connection")

    Connection.__module__ = "psycopg"
    enable_sqlite_foreign_keys(Connection(), None)


async def test_audit_restrict_keeps_history_and_deactivate_does_not_delete(session):
    async with session.begin():
        client = Client(name="owner", status="active")
        session.add(client)
        await session.flush()
        event = AuditEvent(
            client_id=client.id,
            action="tool.call",
            status="denied",
            decision="denied",
            key_prefix="pref",
        )
        session.add(event)
        await session.flush()
        client_id = client.id
        event_id = event.id

    with pytest.raises(IntegrityError):
        async with session.begin():
            persisted = await session.get(Client, client_id)
            await session.delete(persisted)
            await session.flush()

    async with session.begin():
        survived = await session.get(AuditEvent, event_id)
        assert survived is not None
        assert survived.client_id == client_id
        assert survived.key_prefix == "pref"
        updated = await clients.deactivate(session, client_id)
    assert updated.status == "inactive"
    assert await session.get(Client, client_id) is not None
    assert (await session.get(AuditEvent, event_id)).client_id == client_id


async def test_utc_timestamps_round_trip_with_offsets(session):
    aware = datetime(2024, 5, 1, 12, 0, tzinfo=timezone(timedelta(hours=-4)))
    naive = datetime(2024, 5, 1, 16, 0)  # noqa: DTZ001
    async with session.begin():
        client = Client(
            name="tz",
            status="active",
            created_at=aware,
            updated_at=naive,
        )
        session.add(client)
    await session.refresh(client)
    assert client.created_at == aware.astimezone(UTC)
    assert client.created_at.utcoffset() == timedelta(0)
    assert client.updated_at == naive.replace(tzinfo=UTC)
    assert client.created_at != aware.replace(tzinfo=UTC)


async def test_unique_and_null_constraints(session):
    async with session.begin():
        client = Client(name="owner", status="active")
        session.add(client)
        await session.flush()
        client_id = client.id
        session.add(
            ApiKey(
                client_id=client_id,
                name="primary",
                key_prefix="pref",
                key_hash="hash",
                scopes=["notes:read"],
            )
        )

    with pytest.raises(IntegrityError):
        async with session.begin():
            session.add(
                ApiKey(
                    client_id=client_id,
                    name="duplicate-hash",
                    key_prefix="other",
                    key_hash="hash",
                    scopes=[],
                )
            )
            await session.flush()

    with pytest.raises(IntegrityError):
        async with session.begin():
            await session.execute(
                text(
                    "INSERT INTO api_keys "
                    "(id, client_id, name, key_prefix, key_hash, scopes, created_at) "
                    "VALUES ('k2', :client_id, 'n', 'p2', 'h2', NULL, '2024-01-01')"
                ),
                {"client_id": client_id},
            )

    with pytest.raises(IntegrityError):
        async with session.begin():
            await session.execute(
                text(
                    "INSERT INTO audit_events "
                    "(id, action, status, decision, created_at) "
                    "VALUES ('bad', 'tool.call', 'success', 'maybe', '2024-01-01')"
                )
            )


def test_migration_round_trip_preserves_audit_rows_and_matches_metadata(
    tmp_path, monkeypatch
):
    database = tmp_path / "migration.db"
    url = f"sqlite+aiosqlite:///{database}"
    monkeypatch.setenv("DATABASE_URL", url)
    config = _alembic_config(database)

    command.upgrade(config, "7a767168a9ab")
    connection = sqlite3.connect(database)
    connection.execute("PRAGMA foreign_keys=ON")
    connection.execute(
        "INSERT INTO clients (id, name, status, created_at, updated_at) "
        "VALUES ('c1', 'kept', 'active', '2024-01-01', '2024-01-01')"
    )
    connection.execute(
        "INSERT INTO api_keys "
        "(id, client_id, key_prefix, key_hash, scopes, created_at) "
        "VALUES ('k1', 'c1', 'pref', 'hash', NULL, '2024-01-01')"
    )
    connection.execute(
        "INSERT INTO audit_events "
        "(id, client_id, api_key_id, action, status, created_at) "
        "VALUES ('a1', 'c1', 'k1', 'tool.call', 'denied', '2024-01-02')"
    )
    connection.commit()
    connection.close()

    command.upgrade(config, "head")
    command.check(config)
    _assert_migrated_schema(database)

    connection = sqlite3.connect(database)
    audit_row = connection.execute(
        "SELECT decision, client_id FROM audit_events WHERE id = 'a1'"
    ).fetchone()
    key_row = connection.execute(
        "SELECT name, scopes FROM api_keys WHERE id = 'k1'"
    ).fetchone()
    connection.close()
    assert audit_row == ("denied", "c1")
    assert key_row == ("legacy-key", "[]")

    command.downgrade(config, "7a767168a9ab")
    connection = sqlite3.connect(database)
    columns = [row[1] for row in connection.execute("PRAGMA table_info(audit_events)")]
    assert "decision" not in columns
    assert connection.execute("SELECT COUNT(*) FROM audit_events").fetchone()[0] == 1
    connection.close()

    command.upgrade(config, "head")
    command.check(config)
    _assert_migrated_schema(database)
    connection = sqlite3.connect(database)
    assert connection.execute("SELECT id FROM audit_events").fetchone()[0] == "a1"
    connection.close()


def _assert_migrated_schema(database: Path) -> None:
    from sqlalchemy import create_engine

    engine = create_engine(f"sqlite:///{database}")
    try:
        inspector = inspect(engine)
        tables = set(inspector.get_table_names())
        assert {"clients", "api_keys", "audit_events", "sandbox_runs"} <= tables

        indexes = {item["name"] for item in inspector.get_indexes("audit_events")}
        assert "ix_audit_events_created_at" in indexes
        assert "ix_audit_events_client_id_created_at" in indexes
        assert "ix_audit_events_tool_name_created_at" in indexes
        assert "ix_audit_events_decision_created_at" in indexes

        foreign_keys = inspector.get_foreign_keys("audit_events")
        client_fk = next(
            item
            for item in foreign_keys
            if item["constrained_columns"] == ["client_id"]
        )
        assert client_fk.get("options", {}).get("ondelete") == "RESTRICT"

        unique_names = {
            tuple(item["column_names"])
            for item in inspector.get_unique_constraints("api_keys")
        }
        prefix_indexes = {
            tuple(item["column_names"])
            for item in inspector.get_indexes("api_keys")
            if item["unique"]
        }
        assert ("key_hash",) in unique_names or ("key_hash",) in prefix_indexes
        assert ("key_prefix",) in prefix_indexes or ("key_prefix",) in unique_names

        columns = {item["name"]: item for item in inspector.get_columns("api_keys")}
        assert columns["name"]["nullable"] is False
        assert columns["scopes"]["nullable"] is False
        assert columns["expires_at"]["nullable"] is True
        assert columns["revoked_at"]["nullable"] is True
        assert columns["last_used_at"]["nullable"] is True

        checks = inspector.get_check_constraints("audit_events")
        assert any(
            "allowed" in (item.get("sqltext") or item.get("sql") or "")
            and "denied" in (item.get("sqltext") or item.get("sql") or "")
            for item in checks
        )
    finally:
        engine.dispose()


def test_seed_script_is_idempotent_and_refuses_production(tmp_path):
    database = tmp_path / "seed.db"
    script = Path(__file__).resolve().parents[1] / "scripts" / "seed_dev.py"
    api_root = script.parent.parent

    def run(app_env: str) -> subprocess.CompletedProcess[str]:
        env = os.environ.copy()
        env["APP_ENV"] = app_env
        env["DATABASE_URL"] = f"sqlite+aiosqlite:///{database}"
        return subprocess.run(
            [sys.executable, str(script)],
            cwd=api_root,
            env=env,
            capture_output=True,
            text=True,
            check=False,
        )

    refused = tmp_path / "refused.db"
    env = os.environ.copy()
    env["APP_ENV"] = "production"
    env["DATABASE_URL"] = f"sqlite+aiosqlite:///{refused}"
    blocked = subprocess.run(
        [sys.executable, str(script)],
        cwd=api_root,
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )
    assert blocked.returncode != 0
    assert "production" in blocked.stderr
    assert not refused.exists()

    from sqlalchemy import create_engine

    from app.models import Base

    sync_engine = create_engine(f"sqlite:///{database}")
    Base.metadata.create_all(sync_engine)
    sync_engine.dispose()

    first = run("dev")
    assert first.returncode == 0, first.stderr
    second = run("dev")
    assert second.returncode == 0, second.stderr

    connection = sqlite3.connect(database)
    rows = connection.execute(
        "SELECT name, status FROM clients ORDER BY name"
    ).fetchall()
    assert rows == [("demo-agent", "active"), ("dev-admin", "active")]
    assert connection.execute("SELECT COUNT(*) FROM api_keys").fetchone()[0] == 0
    connection.execute(
        "UPDATE clients SET status = 'inactive' WHERE name = 'dev-admin'"
    )
    connection.commit()
    connection.close()

    third = run("dev")
    assert third.returncode == 0, third.stderr
    connection = sqlite3.connect(database)
    status = connection.execute(
        "SELECT status FROM clients WHERE name = 'dev-admin'"
    ).fetchone()[0]
    count = connection.execute("SELECT COUNT(*) FROM clients").fetchone()[0]
    connection.close()
    assert status == "inactive"
    assert count == 2
