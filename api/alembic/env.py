import asyncio
import os
from logging.config import fileConfig
from pathlib import Path

from sqlalchemy import event, pool
from sqlalchemy.engine import Connection, Engine
from sqlalchemy.engine.url import make_url
from sqlalchemy.ext.asyncio import async_engine_from_config

from alembic import context

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

from app.config import settings
from app.models import Base


def _enable_sqlite_foreign_keys(dbapi_connection, connection_record) -> None:
    """Enable SQLite foreign keys for migration connections only."""

    module = type(dbapi_connection).__module__
    if "sqlite" not in module:
        return
    cursor = dbapi_connection.cursor()
    try:
        cursor.execute("PRAGMA foreign_keys=ON")
    finally:
        cursor.close()


if not getattr(Engine, "_mcp_guard_sqlite_fk", False):
    event.listen(Engine, "connect", _enable_sqlite_foreign_keys)
    Engine._mcp_guard_sqlite_fk = True  # type: ignore[attr-defined]


def _database_url() -> str:
    """Prefer an explicit Alembic URL, then a runtime DATABASE_URL override.

    Tests set ``sqlalchemy.url`` on the Alembic config before invoking
    commands. That override wins so migration checks never fall through to a
    developer's database. When the ini value is blank, ``settings.database_url``
    is the default.
    """

    configured = config.get_main_option("sqlalchemy.url")
    if configured and configured.strip():
        return configured.strip()
    env_url = os.environ.get("DATABASE_URL")
    if env_url and env_url.strip():
        return env_url.strip()
    return settings.database_url


def _ensure_sqlite_parent(url: str) -> None:
    if not url.startswith("sqlite"):
        return
    database = make_url(url).database
    if not database or database == ":memory:":
        return
    path = Path(database)
    if not path.is_absolute():
        path = Path.cwd() / path
    path.parent.mkdir(parents=True, exist_ok=True)


db_url = _database_url()
_ensure_sqlite_parent(db_url)
# ConfigParser treats "%" as interpolation. Escape it before storing the URL.
config.set_main_option("sqlalchemy.url", db_url.replace("%", "%%"))

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode."""

    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        render_as_batch=True,
    )

    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        render_as_batch=True,
    )

    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    """Create an engine and run migrations against a live connection."""

    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode."""

    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
