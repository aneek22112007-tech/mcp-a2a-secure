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
        api_key = ApiKey(client_id=client.id, key_prefix="test_", key_hash="hashed_abc")
        session.add(api_key)

        # Create AuditEvent
        audit = AuditEvent(
            client_id=client.id,
            api_key_id=api_key.id,
            action="test_action",
            status="success",
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
