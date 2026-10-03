from collections.abc import AsyncGenerator
from pathlib import Path

from sqlalchemy import event
from sqlalchemy.engine import Engine
from sqlalchemy.engine.url import make_url
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings


def enable_sqlite_foreign_keys(dbapi_connection, connection_record) -> None:
    """Enable SQLite foreign keys on each new DBAPI connection.

    The pragma is a no-op for every other driver. It runs at connect time,
    before a transaction uses the connection.
    """

    module = type(dbapi_connection).__module__
    if "sqlite" not in module:
        return
    cursor = dbapi_connection.cursor()
    try:
        cursor.execute("PRAGMA foreign_keys=ON")
    finally:
        cursor.close()


def install_sqlite_foreign_keys() -> None:
    # env.py is executed by Alembic (not imported), so identity checks on the
    # listener function are not stable across runs. A class flag keeps a
    # single listener installed for the process.
    if getattr(Engine, "_mcp_guard_sqlite_fk", False):
        return
    event.listen(Engine, "connect", enable_sqlite_foreign_keys)
    Engine._mcp_guard_sqlite_fk = True  # type: ignore[attr-defined]


def ensure_sqlite_parent_directory(url: str) -> None:
    """Create the parent directory for a SQLite file URL.

    Called from database startup, not from settings construction.
    """

    if not url.startswith("sqlite"):
        return
    database = make_url(url).database
    if not database or database == ":memory:":
        return
    path = Path(database)
    if not path.is_absolute():
        path = Path.cwd() / path
    path.parent.mkdir(parents=True, exist_ok=True)


install_sqlite_foreign_keys()
ensure_sqlite_parent_directory(settings.database_url)

engine = create_async_engine(
    settings.database_url,
    echo=False,
)

async_session_maker = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with async_session_maker() as session:
        yield session
