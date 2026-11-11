import os

import pytest
from alembic.config import Config
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from alembic import command
from app.models import ApiKey, AuditEvent, Client, SandboxRun

pytestmark = pytest.mark.anyio


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
def alembic_config(tmp_path):
    test_db_path = tmp_path / "test_migration.db"
    test_db_url = f"sqlite+aiosqlite:///{test_db_path}"

    # Alembic relies on the app settings.
    # To isolate, we should override the env variable used in config.py.
    os.environ["DATABASE_URL"] = test_db_url

    # Now set up Alembic config
    alembic_cfg = Config("alembic.ini")
    alembic_cfg.set_main_option("sqlalchemy.url", test_db_url)

    yield alembic_cfg, test_db_url

    # Cleanup
    if "DATABASE_URL" in os.environ:
        del os.environ["DATABASE_URL"]


import anyio


def test_alembic_upgrade_downgrade(alembic_config):
    alembic_cfg, _ = alembic_config

    # These run synchronously in a normal def test
    command.upgrade(alembic_cfg, "head")
    command.downgrade(alembic_cfg, "base")
    command.upgrade(alembic_cfg, "head")


async def test_schema_validity(alembic_config):
    alembic_cfg, db_url = alembic_config

    # Make sure we're upgraded
    await anyio.to_thread.run_sync(command.upgrade, alembic_cfg, "head")

    engine = create_async_engine(db_url)
    session_maker = async_sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )

    async with session_maker() as session:
        # Create a Client
        client = Client(name="test_client", status="active")
        session.add(client)
        await session.flush()

        # Create ApiKey
        api_key = ApiKey(
            client_id=client.id,
            key_prefix="test_",
            key_hash="hashed_abc",
            name="test-key",
            scopes=[],
        )
        session.add(api_key)

        # Create AuditEvent
        audit = AuditEvent(
            client_id=client.id,
            api_key_id=api_key.id,
            action="test_action",
            status="success",
            decision="allowed",
        )
        session.add(audit)

        # Create SandboxRun
        sandbox = SandboxRun(
            client_id=client.id, audit_event_id=audit.id, status="pending"
        )
        session.add(sandbox)

        await session.commit()

        # Verify
        result = await session.execute(text("SELECT name FROM clients"))
        assert result.scalar() == "test_client"

    await engine.dispose()


def test_llm_calls_boolean_default_compiles_across_dialects():
    """Verify that fell_back column server_default compiles to false on PostgreSQL and 0 on SQLite."""
    import sqlalchemy as sa
    from sqlalchemy.dialects import postgresql, sqlite

    col = sa.Column(
        "fell_back", sa.Boolean(), nullable=False, server_default=sa.false()
    )
    pg_ddl = str(sa.schema.CreateColumn(col).compile(dialect=postgresql.dialect()))
    sqlite_ddl = str(sa.schema.CreateColumn(col).compile(dialect=sqlite.dialect()))

    assert "DEFAULT false" in pg_ddl
    assert "DEFAULT 0" in sqlite_ddl


def test_llm_calls_migration_generates_valid_postgres_ddl():
    """Verify that Alembic offline migration for PostgreSQL generates valid boolean defaults."""
    import io
    import sys

    cfg = Config("alembic.ini")
    cfg.set_main_option(
        "sqlalchemy.url",
        "postgresql+asyncpg://mcpg_user:mcpg_dev_password@localhost:5432/mcpg_guard",
    )

    old_stdout = sys.stdout
    sys.stdout = io.StringIO()
    try:
        command.upgrade(cfg, "head", sql=True)
        out = sys.stdout.getvalue()
    finally:
        sys.stdout = old_stdout

    assert "fell_back BOOLEAN DEFAULT false" in out
