"""Create the two local development clients.

The script is safe to run more than once. It refuses to run when
``APP_ENV=production`` and exits before opening the database.

It does not create API keys or any other credential.
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

_DEV_CLIENTS = ("dev-admin", "demo-agent")


def _refuse_production() -> None:
    from app.config import settings

    if settings.environment.strip().lower() not in ("dev", "development", "local"):
        print(
            f"seed_dev: refusing to run because environment is {settings.environment}",
            file=sys.stderr,
        )
        raise SystemExit(1)


def _prepare_import_path() -> None:
    root = Path(__file__).resolve().parent.parent
    root_text = str(root)
    if root_text not in sys.path:
        sys.path.insert(0, root_text)


async def _seed() -> None:
    from sqlalchemy import inspect, select

    from app.database import async_session_maker, engine
    from app.models import Client
    from app.repos.clients import create

    async with engine.begin() as connection:

        def check_table(sync_conn):
            return inspect(sync_conn).has_table("clients")

        has_clients = await connection.run_sync(check_table)
        if not has_clients:
            print(
                "seed_dev: table 'clients' does not exist. Please run 'uv run alembic upgrade head' first.",
                file=sys.stderr,
            )
            raise SystemExit(1)

    async with async_session_maker() as session:
        try:
            for name in _DEV_CLIENTS:
                existing = await session.scalar(
                    select(Client).where(Client.name == name).limit(1)
                )
                if existing is None:
                    await create(session, name=name, status="active")
            await session.commit()
            print("Successfully seeded development clients.")
        except Exception as e:
            await session.rollback()
            print(f"Error seeding database: {e}", file=sys.stderr)
            raise
        finally:
            await engine.dispose()


def main() -> None:
    _prepare_import_path()
    _refuse_production()
    asyncio.run(_seed())


if __name__ == "__main__":
    main()
