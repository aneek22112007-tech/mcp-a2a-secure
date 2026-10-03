from datetime import UTC, datetime, timedelta, timezone

import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.models import Base
from app.repos import api_keys, audit, clients, sandbox_runs
from app.repos.errors import ApiKeyNotFoundError, ClientNotFoundError

pytestmark = pytest.mark.anyio


@pytest.fixture
async def session(tmp_path):
    import app.database  # noqa: F401  installs the SQLite foreign-key listener

    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path}/repos.db")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with maker() as db:
        yield db
        await db.rollback()
    await engine.dispose()


def _utc(year: int, month: int, day: int, hour: int = 0) -> datetime:
    return datetime(year, month, day, hour, tzinfo=UTC)


async def test_client_create_get_and_missing(session):
    async with session.begin():
        created = await clients.create(session, name="  dev-admin  ")
    assert created.name == "dev-admin"
    assert created.status == "active"
    assert created.created_at.tzinfo is not None
    assert created.created_at.utcoffset() == timedelta(0)

    found = await clients.get(session, created.id)
    assert found is not None
    assert found.id == created.id
    assert await clients.get(session, "missing") is None


async def test_client_list_filter_pagination_and_order(session):
    async with session.begin():
        later = await clients.create(session, name="later")
        earlier = await clients.create(session, name="earlier", status="paused")
        third = await clients.create(session, name="third")
        later.created_at = _utc(2024, 1, 3)
        earlier.created_at = _utc(2024, 1, 1)
        third.created_at = _utc(2024, 1, 2)

    rows = await clients.list(session, limit=2, offset=0)
    assert [row.name for row in rows] == ["earlier", "third"]
    assert [row.name for row in await clients.list(session, limit=2, offset=2)] == [
        "later"
    ]
    paused = await clients.list(session, status="paused")
    assert [row.name for row in paused] == ["earlier"]
    assert await clients.list(session, offset=10) == []


async def test_client_list_rejects_bad_paging(session):
    with pytest.raises(ValueError):
        await clients.list(session, limit=0)
    with pytest.raises(ValueError):
        await clients.list(session, offset=-1)


async def test_client_create_rejects_blank_name(session):
    with pytest.raises(ValueError):
        await clients.create(session, name="   ")


async def test_deactivate_is_soft_and_missing_client_errors(session):
    async with session.begin():
        created = await clients.create(session, name="agent")
    async with session.begin():
        updated = await clients.deactivate(session, created.id)
    assert updated.status == "inactive"
    assert (await clients.get(session, created.id)) is not None
    assert (await clients.get(session, created.id)).status == "inactive"

    with pytest.raises(ClientNotFoundError):
        await clients.deactivate(session, "missing")


async def test_api_key_create_lookup_and_client_list(session):
    async with session.begin():
        client = await clients.create(session, name="owner")
        other = await clients.create(session, name="other")
        created = await api_keys.create(
            session,
            client_id=client.id,
            key_hash="hash-1",
            key_prefix="pref_one",
            name="primary",
            scopes=["notes:read"],
        )
        await api_keys.create(
            session,
            client_id=other.id,
            key_hash="hash-2",
            key_prefix="pref_two",
            name="secondary",
        )

    assert not hasattr(created, "raw_key")
    assert created.key_hash == "hash-1"
    assert created.scopes == ["notes:read"]
    found = await api_keys.get_by_prefix(session, "pref_one")
    assert found is not None
    assert found.id == created.id
    assert await api_keys.get_by_prefix(session, "missing") is None
    owned = await api_keys.list_for_client(session, client.id)
    assert [row.name for row in owned] == ["primary"]
    assert (await api_keys.list_for_client(session, client.id))[0].scopes == [
        "notes:read"
    ]


async def test_api_key_scopes_default_to_empty_list(session):
    async with session.begin():
        client = await clients.create(session, name="owner")
        created = await api_keys.create(
            session,
            client_id=client.id,
            key_hash="hash-empty",
            key_prefix="pref_empty",
            name="empty",
        )
    await session.refresh(created)
    assert created.scopes == []


async def test_api_key_rejects_bad_scopes_without_writing(session):
    async with session.begin():
        client = await clients.create(session, name="owner")
    with pytest.raises(ValueError):
        await api_keys.create(
            session,
            client_id=client.id,
            key_hash="hash",
            key_prefix="pref",
            name="bad",
            scopes=["ok", ""],
        )
    assert await api_keys.get_by_prefix(session, "pref") is None


async def test_missing_client_rejects_api_key(session):
    with pytest.raises(IntegrityError):
        async with session.begin():
            await api_keys.create(
                session,
                client_id="does-not-exist",
                key_hash="hash",
                key_prefix="pref",
                name="orphan",
            )


async def test_duplicate_key_hash_and_prefix_are_rejected(session):
    async with session.begin():
        client = await clients.create(session, name="owner")
        client_id = client.id

    with pytest.raises(IntegrityError):
        async with session.begin():
            await api_keys.create(
                session,
                client_id=client_id,
                key_hash="same-hash",
                key_prefix="pref_a",
                name="first",
            )
            await api_keys.create(
                session,
                client_id=client_id,
                key_hash="same-hash",
                key_prefix="pref_b",
                name="second",
            )

    with pytest.raises(IntegrityError):
        async with session.begin():
            await api_keys.create(
                session,
                client_id=client_id,
                key_hash="hash-a",
                key_prefix="same_pref",
                name="first",
            )
            await api_keys.create(
                session,
                client_id=client_id,
                key_hash="hash-b",
                key_prefix="same_pref",
                name="second",
            )


async def test_revoke_and_mark_used_use_utc(session):
    async with session.begin():
        client = await clients.create(session, name="owner")
        created = await api_keys.create(
            session,
            client_id=client.id,
            key_hash="hash",
            key_prefix="pref",
            name="primary",
        )

    when = datetime(2024, 6, 1, 15, 30, tzinfo=timezone(timedelta(hours=5, minutes=30)))
    async with session.begin():
        used = await api_keys.mark_used(session, created.id, when=when)
        revoked = await api_keys.revoke(session, created.id)
        again = await api_keys.revoke(session, created.id)

    await session.refresh(used)
    assert used.last_used_at == when.astimezone(UTC)
    assert used.last_used_at.utcoffset() == timedelta(0)
    assert revoked.revoked_at == again.revoked_at
    assert revoked.revoked_at is not None
    assert revoked.revoked_at.utcoffset() == timedelta(0)

    with pytest.raises(ApiKeyNotFoundError):
        await api_keys.revoke(session, "missing")
    with pytest.raises(ApiKeyNotFoundError):
        await api_keys.mark_used(session, "missing")


async def test_audit_filters_pagination_and_ordering(session):
    async with session.begin():
        client = await clients.create(session, name="owner")
        other = await clients.create(session, name="other")
        first = await audit.add_event(
            session,
            decision="allowed",
            action="tool.call",
            status="success",
            client_id=client.id,
            tool_name="list_notes",
            key_prefix="pref",
            created_at=_utc(2024, 2, 1, 1),
        )
        second = await audit.add_event(
            session,
            decision="denied",
            action="tool.call",
            status="denied",
            client_id=client.id,
            tool_name="write_note",
            reason="missing scope",
            status_code=403,
            duration_ms=1.5,
            created_at=_utc(2024, 2, 1, 2),
        )
        third = await audit.add_event(
            session,
            decision="allowed",
            action="tool.call",
            status="success",
            client_id=other.id,
            tool_name="list_notes",
            created_at=_utc(2024, 2, 2, 1),
        )
        tied_a = await audit.add_event(
            session,
            decision="allowed",
            action="tool.call",
            status="success",
            client_id=client.id,
            tool_name="read_note",
            created_at=_utc(2024, 3, 1),
        )
        tied_b = await audit.add_event(
            session,
            decision="denied",
            action="tool.call",
            status="denied",
            client_id=client.id,
            tool_name="read_note",
            created_at=_utc(2024, 3, 1),
        )

    assert first.key_prefix == "pref"
    assert second.reason == "missing scope"
    by_client = await audit.list_events(session, client_id=client.id)
    assert third.id not in {row.id for row in by_client}
    by_tool = await audit.list_events(session, tool_name="list_notes")
    assert [row.id for row in by_tool] == [first.id, third.id]
    denied = await audit.list_events(session, decision="denied")
    assert second.id in {row.id for row in denied}
    window = await audit.list_events(
        session,
        start=_utc(2024, 2, 1, 2),
        end=_utc(2024, 2, 1, 2),
    )
    assert [row.id for row in window] == [second.id]

    page = await audit.list_events(
        session,
        client_id=client.id,
        tool_name="read_note",
        limit=1,
        offset=0,
    )
    assert [row.id for row in page] == sorted([tied_a.id, tied_b.id])[:1]
    assert [row.id for row in await audit.list_events(session, limit=2, offset=0)] == [
        first.id,
        second.id,
    ]


async def test_audit_rejects_invalid_decision_and_time_range(session):
    with pytest.raises(ValueError):
        await audit.add_event(
            session,
            decision="maybe",
            action="tool.call",
            status="success",
        )
    with pytest.raises(ValueError):
        await audit.list_events(
            session,
            start=_utc(2024, 2, 2),
            end=_utc(2024, 2, 1),
        )


async def test_sandbox_runs_filter_and_reject_missing_client(session):
    async with session.begin():
        client = await clients.create(session, name="owner")
        other = await clients.create(session, name="other")
        first = await sandbox_runs.add_run(
            session, client_id=client.id, status="pending"
        )
        second = await sandbox_runs.add_run(
            session,
            client_id=other.id,
            status="finished",
            exit_code=0,
        )

    assert first.created_at.utcoffset() == timedelta(0)
    owned = await sandbox_runs.list_runs(session, client_id=client.id)
    assert [row.id for row in owned] == [first.id]
    assert {row.id for row in await sandbox_runs.list_runs(session)} == {
        first.id,
        second.id,
    }

    # list_runs autobegins a transaction. Close it before the explicit one.
    await session.rollback()
    with pytest.raises(IntegrityError):
        async with session.begin():
            await sandbox_runs.add_run(session, client_id="missing-client")


async def test_naive_audit_timestamp_is_stored_as_utc(session):
    naive = datetime(2024, 7, 4, 12, 0, 0)  # noqa: DTZ001
    async with session.begin():
        event = await audit.add_event(
            session,
            decision="allowed",
            action="tool.call",
            status="success",
            created_at=naive,
        )
    await session.refresh(event)
    assert event.created_at == naive.replace(tzinfo=UTC)
    assert event.created_at.utcoffset() == timedelta(0)
