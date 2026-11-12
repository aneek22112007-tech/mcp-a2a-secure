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


# sqlite3.Connection and the async adapter both reject new attributes.
# The flag is this set, keyed by the DBAPI connection object the trigger
# function closes over. Checkin drops a leaked entry before the id can be reused.
_sqlite_retention_ids: set[int] = set()


def enable_sqlite_audit_retention(dbapi_connection, connection_record) -> None:
    """Register mcpg_audit_retention() on each SQLite connection.

    The function reads a per-connection flag. delete_events_before turns the
    flag on around its deletes. A client that never registered the function,
    including the sqlite3 CLI, fails the delete trigger closed.
    """

    del connection_record
    module = type(dbapi_connection).__module__
    if "sqlite" not in module or not hasattr(dbapi_connection, "create_function"):
        return

    def mcpg_audit_retention() -> int:
        return 1 if id(dbapi_connection) in _sqlite_retention_ids else 0

    dbapi_connection.create_function("mcpg_audit_retention", 0, mcpg_audit_retention)


def _clear_sqlite_audit_retention(dbapi_connection, connection_record) -> None:
    del connection_record
    _sqlite_retention_ids.discard(id(dbapi_connection))


def install_sqlite_audit_retention() -> None:
    if getattr(Engine, "_mcpg_audit_retention_fn", False):
        return
    event.listen(Engine, "connect", enable_sqlite_audit_retention)
    event.listen(Engine, "checkin", _clear_sqlite_audit_retention)
    Engine._mcpg_audit_retention_fn = True  # type: ignore[attr-defined]


def set_sqlite_audit_retention(dbapi_connection, enabled: bool) -> None:
    """Turn the SQLite retention flag on or off for this connection."""

    key = id(dbapi_connection)
    if enabled:
        _sqlite_retention_ids.add(key)
        return
    _sqlite_retention_ids.discard(key)


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
install_sqlite_audit_retention()
ensure_sqlite_parent_directory(settings.database_url)

_engine_kwargs: dict[str, object] = {"echo": False}
if not settings.database_url.startswith("sqlite"):
    _engine_kwargs.update(
        pool_size=settings.db_pool_size,
        max_overflow=settings.db_max_overflow,
        pool_timeout=settings.db_pool_timeout_s,
        pool_recycle=settings.db_pool_recycle_s,
        pool_pre_ping=True,
    )

engine = create_async_engine(
    settings.database_url,
    **_engine_kwargs,
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
