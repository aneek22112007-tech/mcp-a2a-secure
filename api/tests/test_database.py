import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.database import engine as default_engine
from app.models import Base

pytestmark = pytest.mark.anyio


@pytest.fixture
def anyio_backend():
    return "asyncio"


async def test_engine_creation():
    # Verify the engine was created correctly
    assert default_engine.name == "sqlite"


async def test_session_lifecycle(tmp_path):
    test_db_url = f"sqlite+aiosqlite:///{tmp_path}/test_lifecycle.db"
    engine = create_async_engine(test_db_url)
    session_maker = async_sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with session_maker() as session:
        result = await session.execute(text("SELECT 1"))
        assert result.scalar() == 1

    await engine.dispose()
