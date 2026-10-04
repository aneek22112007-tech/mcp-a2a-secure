import asyncio
import sys
from datetime import UTC, datetime
from pathlib import Path

ADMIN_CLIENT_NAME = "System Administrator"


def _prepare_import_path() -> None:
    root = Path(__file__).resolve().parent.parent
    root_text = str(root)
    if root_text not in sys.path:
        sys.path.insert(0, root_text)


async def _run():
    from sqlalchemy import select

    from app.database import async_session_maker, engine
    from app.models.api_keys import ApiKey
    from app.models.clients import Client
    from app.repos.clients import create as create_client
    from app.services.api_keys import generate_api_key

    force = "--force" in sys.argv

    async with async_session_maker() as session:
        # Check if admin client exists
        stmt = select(Client).where(Client.name == ADMIN_CLIENT_NAME)
        result = await session.execute(stmt)
        client = result.scalar_one_or_none()

        if not client:
            print("Creating System Administrator client...")
            client = await create_client(session, name=ADMIN_CLIENT_NAME)

        # Check for existing admin key
        stmt = select(ApiKey).where(
            ApiKey.client_id == client.id, ApiKey.revoked_at.is_(None)
        )
        result = await session.execute(stmt)
        existing_keys = result.scalars().all()

        has_active_admin = any(
            "admin" in key.scopes
            and (key.expires_at is None or key.expires_at > datetime.now(UTC))
            for key in existing_keys
        )

        if has_active_admin and not force:
            print("An active administrator key already exists.")
            print(
                "Please manage keys through the API, or use --force to create an additional bootstrap key."
            )
            sys.exit(1)

        print("Generating new administrator API key...")
        _api_key, raw_key = await generate_api_key(
            session=session,
            client_id=client.id,
            name="Bootstrap Admin Key",
            scopes=["admin"],
        )

        await session.commit()

        print("\n=== BOOTSTRAP ADMIN KEY CREATED ===")
        print("This key will only be displayed once. Please store it securely.")
        print(f"API Key: {raw_key}")
        print("===================================\n")

    await engine.dispose()


def main() -> None:
    _prepare_import_path()
    asyncio.run(_run())


if __name__ == "__main__":
    main()
