"""Create the two local development clients.

The script is safe to run more than once. It refuses to run when
``APP_ENV=production`` and exits before opening the database.

It does not create API keys or any other credential.
"""

from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

_DEV_CLIENTS = ("dev-admin", "demo-agent")


def _refuse_production() -> None:
    app_env = os.environ.get("APP_ENV", "")
    if app_env.strip().lower() == "production":
        print(
            "seed_dev: refusing to run because APP_ENV=production",
            file=sys.stderr,
        )
        raise SystemExit(1)


def _prepare_import_path() -> None:
    root = Path(__file__).resolve().parent.parent
    root_text = str(root)
    if root_text not in sys.path:
        sys.path.insert(0, root_text)


async def _seed() -> None:
    from sqlalchemy import select

    from app.database import async_session_maker, engine
    from app.models import Base, Client

    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)

    async with async_session_maker() as session:
        try:
            for name in _DEV_CLIENTS:
                existing = await session.scalar(
                    select(Client).where(Client.name == name).limit(1)
                )
                if existing is None:
                    session.add(Client(name=name, status="active"))
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await engine.dispose()


def main() -> None:
    _refuse_production()
    _prepare_import_path()
    asyncio.run(_seed())


if __name__ == "__main__":
    main()
