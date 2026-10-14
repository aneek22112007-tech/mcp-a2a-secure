"""Seed live console demo traffic against a running API.

Refuses to run unless ENVIRONMENT is dev, development, or local.
Reads the admin key from ADMIN_KEY. There is no default key.

The API must already be running. MCP calls use a real session:
initialize, then the Mcp-Session-Id header, with
Accept: application/json, text/event-stream.

MCPG_BASE_URL defaults to http://127.0.0.1:8000.
Set MCPG_DEMO_POISON_TOOL=1 and restart the API before this script
so the scanner can record R1 and R2 on poisoned_test_tool.
"""

from __future__ import annotations

import asyncio
import os
import re
import sys
import time
from pathlib import Path

import httpx

_BASE = os.environ.get("MCPG_BASE_URL", "http://127.0.0.1:8000").rstrip("/")
_STALE_FINGERPRINT = "0" * 64
_NOTES_SCOPES = ["notes:read", "notes:write"]
_AGENT_SCOPES = ["notes:read", "notes:write", "agent:run"]
_PIN_REASONS = ("pin_revoked", "pin_drift", "pin_scan_blocked", "pin_missing")

failures: list[str] = []


def _prepare_import_path() -> None:
    root = Path(__file__).resolve().parent.parent
    root_text = str(root)
    if root_text not in sys.path:
        sys.path.insert(0, root_text)


def _refuse_production() -> None:
    from app.config import settings

    if settings.environment.strip().lower() not in ("dev", "development", "local"):
        print(
            "seed_demo_data: refusing to run because environment is "
            f"{settings.environment}",
            file=sys.stderr,
        )
        raise SystemExit(1)


def _admin_key() -> str:
    key = os.environ.get("ADMIN_KEY", "").strip()
    if not key:
        print(
            "seed_demo_data: set ADMIN_KEY to an admin mcpg_ key. "
            "create_admin_key.py prints one.",
            file=sys.stderr,
        )
        raise SystemExit(1)
    return key


def _snippet(response: httpx.Response) -> str:
    text = " ".join(response.text.split())[:300]
    return re.sub(r"mcpg_[A-Za-z0-9_-]+", "mcpg_[redacted]", text)


def _ok(name: str, response: httpx.Response, expected: set[int]) -> bool:
    if response.status_code in expected:
        print(f"ok   {name}  HTTP {response.status_code}")
        return True
    message = (
        f"FAIL {name}  HTTP {response.status_code} "
        f"expected {sorted(expected)}  {_snippet(response)}"
    )
    print(message, file=sys.stderr)
    failures.append(message)
    return False


def _require(name: str, response: httpx.Response, expected: set[int]) -> bool:
    if _ok(name, response, expected):
        return True
    raise SystemExit(1)


def _auth(key: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {key}"}


def _json_headers(key: str) -> dict[str, str]:
    return {**_auth(key), "Content-Type": "application/json"}


async def _client_ids() -> dict[str, str]:
    from sqlalchemy import select
    from sqlalchemy.ext.asyncio import (
        AsyncSession,
        async_sessionmaker,
        create_async_engine,
    )

    from app.config import settings
    from app.models import Client

    engine = create_async_engine(settings.database_url)
    maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    found: dict[str, str] = {}
    try:
        async with maker() as session:
            for name in ("dev-admin", "demo-agent"):
                row = await session.scalar(
                    select(Client).where(Client.name == name).limit(1)
                )
                if row is None:
                    print(
                        f"seed_demo_data: client {name} is missing. "
                        "Run scripts/seed_dev.py first.",
                        file=sys.stderr,
                    )
                    raise SystemExit(1)
                found[name] = row.id
    finally:
        await engine.dispose()
    return found


async def _rewrite_pins() -> None:
    """Store a stale read_note hash and keep the poison tool pending.

    The API process caches pin rows. This write does not clear that cache.
    The caller waits longer than the cache TTL before the drift call.
    """

    from sqlalchemy import select
    from sqlalchemy.ext.asyncio import (
        AsyncSession,
        async_sessionmaker,
        create_async_engine,
    )

    from app.config import settings
    from app.models.tool_pins import ToolPin

    engine = create_async_engine(settings.database_url)
    maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    try:
        async with maker() as session:
            read_note = await session.scalar(
                select(ToolPin).where(ToolPin.tool_name == "read_note").limit(1)
            )
            if read_note is None or read_note.status != "approved":
                print(
                    "seed_demo_data: read_note has no approved pin to drift.",
                    file=sys.stderr,
                )
                raise SystemExit(1)
            read_note.fingerprint = _STALE_FINGERPRINT
            poisoned = await session.scalar(
                select(ToolPin)
                .where(ToolPin.tool_name == "poisoned_test_tool")
                .limit(1)
            )
            if poisoned is not None:
                poisoned.status = "pending"
                poisoned.approved_at = None
                poisoned.revoked_at = None
            await session.commit()
    finally:
        await engine.dispose()


def _mcp_headers(client: httpx.Client, key: str) -> dict[str, str]:
    headers = {
        **_json_headers(key),
        "Accept": "application/json, text/event-stream",
    }
    init = client.post(
        f"{_BASE}/mcp/",
        headers=headers,
        json={
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2025-06-18",
                "capabilities": {},
                "clientInfo": {"name": "seed-demo-data", "version": "1.0.0"},
            },
        },
    )
    _require("mcp initialize", init, {200, 201})
    session = init.headers.get("mcp-session-id")
    if not session:
        print(
            "seed_demo_data: initialize did not return mcp-session-id.",
            file=sys.stderr,
        )
        raise SystemExit(1)
    headers["mcp-session-id"] = session
    noted = client.post(
        f"{_BASE}/mcp/",
        headers=headers,
        json={"jsonrpc": "2.0", "method": "notifications/initialized"},
    )
    _ok("mcp initialized notification", noted, {200, 201, 202, 204})
    return headers


def _tools_call(
    client: httpx.Client,
    headers: dict[str, str],
    name: str,
    arguments: dict[str, str],
    request_id: int,
) -> httpx.Response:
    return client.post(
        f"{_BASE}/mcp/",
        headers=headers,
        json={
            "jsonrpc": "2.0",
            "id": request_id,
            "method": "tools/call",
            "params": {"name": name, "arguments": arguments},
        },
    )


def _create_key(
    client: httpx.Client,
    admin: str,
    client_id: str,
    name: str,
    scopes: list[str],
) -> tuple[str, str]:
    response = client.post(
        f"{_BASE}/api/keys",
        headers=_json_headers(admin),
        json={"client_id": client_id, "name": name, "scopes": scopes},
    )
    _require(f"create key {name}", response, {200, 201})
    body = response.json()
    raw = body.get("raw_key")
    key_id = body.get("id")
    if not isinstance(raw, str) or not isinstance(key_id, str):
        print(
            f"seed_demo_data: create key {name} did not return id and raw_key.",
            file=sys.stderr,
        )
        raise SystemExit(1)
    prefix = body.get("key_prefix")
    if not isinstance(prefix, str) or not prefix:
        print(
            f"seed_demo_data: create key {name} did not return key_prefix.",
            file=sys.stderr,
        )
        raise SystemExit(1)
    print(f"created {name} key prefix {prefix}")
    return key_id, raw


def _pin_reason(client: httpx.Client, admin: str, tool: str) -> str | None:
    for _ in range(4):
        response = client.get(
            f"{_BASE}/api/audit",
            headers=_auth(admin),
            params={"tool_name": tool, "decision": "denied", "limit": 10},
        )
        if response.status_code == 200:
            items = response.json().get("items") or []
            for item in items:
                reason = item.get("reason")
                if reason in _PIN_REASONS:
                    return str(reason)
        time.sleep(0.3)
    return None


def _check_pins(client: httpx.Client, admin: str) -> None:
    response = client.get(f"{_BASE}/api/pins", headers=_auth(admin))
    if not _ok("list pins", response, {200}):
        return
    items = {row["tool_name"]: row for row in response.json().get("items") or []}
    expected = {
        "list_notes": ("approved", True),
        "read_note": ("approved", False),
        "write_note": ("revoked", None),
    }
    for name, (status, matches) in expected.items():
        row = items.get(name)
        if row is None or row.get("status") != status:
            message = f"FAIL pin {name} status is not {status}: {row}"
            print(message, file=sys.stderr)
            failures.append(message)
            continue
        if matches is not None and row.get("matches") is not matches:
            message = f"FAIL pin {name} matches is not {matches}: {row.get('matches')}"
            print(message, file=sys.stderr)
            failures.append(message)
            continue
        print(f"ok   pin {name}  {status} matches={row.get('matches')}")
    poisoned = items.get("poisoned_test_tool")
    if poisoned is not None and poisoned.get("status") != "pending":
        message = (
            f"FAIL poisoned_test_tool pin is not pending: {poisoned.get('status')}"
        )
        print(message, file=sys.stderr)
        failures.append(message)


def _check_scanner(client: httpx.Client, admin: str) -> None:
    ran = client.post(f"{_BASE}/api/scanner/run", headers=_auth(admin))
    _ok("scanner run", ran, {200, 201})
    found = client.get(
        f"{_BASE}/api/scanner/findings",
        headers=_auth(admin),
        params={
            "tool_name": "poisoned_test_tool",
            "open_only": "true",
            "limit": 50,
        },
    )
    if not _ok("scanner findings", found, {200}):
        return
    rules = {item.get("rule_id") for item in found.json().get("items") or []}
    missing = {"R1_PROMPT_INJECTION", "R2_EXFILTRATION"} - rules
    if missing:
        message = (
            "FAIL scanner is missing "
            + ", ".join(sorted(missing))
            + ". Set MCPG_DEMO_POISON_TOOL=1 and restart the API, then rerun."
        )
        print(message, file=sys.stderr)
        failures.append(message)
        return
    print("ok   scanner findings include R1_PROMPT_INJECTION and R2_EXFILTRATION")


def _burst(client: httpx.Client, admin: str) -> None:
    from concurrent.futures import ThreadPoolExecutor

    def one(_: int) -> httpx.Response:
        return client.get(f"{_BASE}/api/metrics", headers=_auth(admin))

    with ThreadPoolExecutor(max_workers=120) as pool:
        results = list(pool.map(one, range(120)))
    limited = [item for item in results if item.status_code == 429]
    allowed = [item for item in results if 200 <= item.status_code < 300]
    other = [
        item.status_code
        for item in results
        if item.status_code != 429 and not (200 <= item.status_code < 300)
    ]
    retry = limited[0].headers.get("retry-after") if limited else None
    print(
        f"ok   rate-limit burst  total=120  2xx={len(allowed)}  "
        f"429={len(limited)}  Retry-After={retry}"
    )
    if other:
        message = f"FAIL rate-limit burst unexpected statuses {other[:8]}"
        print(message, file=sys.stderr)
        failures.append(message)
    if not limited:
        message = (
            "FAIL rate-limit burst got 0 responses with HTTP 429. "
            "Set RATE_LIMIT_CAPACITY at or below 100 and restart the API."
        )
        print(message, file=sys.stderr)
        failures.append(message)


def main() -> None:
    _prepare_import_path()
    _refuse_production()
    admin = _admin_key()
    client_ids = asyncio.run(_client_ids())
    timeout = httpx.Timeout(30.0, connect=5.0)
    limits = httpx.Limits(max_connections=150, max_keepalive_connections=40)
    with httpx.Client(timeout=timeout, limits=limits) as client:
        health = client.get(f"{_BASE}/health")
        _require("health", health, {200})

        _dev_admin_id, dev_admin_key = _create_key(
            client,
            admin,
            client_ids["dev-admin"],
            "demo dev-admin",
            ["admin"],
        )
        _agent_id, agent_key = _create_key(
            client,
            admin,
            client_ids["demo-agent"],
            "demo agent",
            _AGENT_SCOPES,
        )

        synced = client.post(f"{_BASE}/api/pins/sync", headers=_auth(admin))
        _require("pin sync", synced, {200, 201})
        for tool in ("list_notes", "read_note", "write_note"):
            approved = client.post(
                f"{_BASE}/api/pins/{tool}/approve",
                headers=_json_headers(admin),
                json={"note": "demo"},
            )
            _require(f"approve {tool}", approved, {200, 201})

        _check_scanner(client, admin)

        metrics = client.get(f"{_BASE}/api/metrics", headers=_auth(dev_admin_key))
        _require("dev-admin GET /api/metrics", metrics, {200})
        notes = client.get(f"{_BASE}/api/notes", headers=_auth(agent_key))
        _require("demo-agent GET /api/notes", notes, {200})

        admin_mcp = _mcp_headers(client, admin)
        wrote = _tools_call(
            client,
            admin_mcp,
            "write_note",
            {"name": "demo-note", "content": "demo note for the console"},
            2,
        )
        _require("mcp write_note", wrote, {200, 201})
        read = _tools_call(client, admin_mcp, "read_note", {"name": "demo-note"}, 3)
        _require("mcp read_note", read, {200, 201})
        listed = _tools_call(client, admin_mcp, "list_notes", {}, 4)
        _require("mcp list_notes", listed, {200, 201})

        agent_mcp = _mcp_headers(client, agent_key)
        agent_list = _tools_call(client, agent_mcp, "list_notes", {}, 2)
        _require("demo-agent mcp list_notes", agent_list, {200, 201})

        runs = client.get(
            f"{_BASE}/api/sandbox/runs",
            headers=_auth(admin),
            params={"limit": 20},
        )
        if _ok("sandbox runs", runs, {200}):
            items = runs.json().get("items") or []
            if not items:
                message = (
                    "FAIL sandbox runs is empty. "
                    "Set SANDBOX_MODE=inprocess and restart the API."
                )
                print(message, file=sys.stderr)
                failures.append(message)
            else:
                print(f"ok   sandbox runs  count={len(items)}")

        revoked = client.post(
            f"{_BASE}/api/pins/write_note/revoke",
            headers=_json_headers(admin),
            json={"note": "demo revoke"},
        )
        _require("revoke write_note", revoked, {200, 201})
        asyncio.run(_rewrite_pins())
        print("ok   read_note fingerprint rewritten; waiting for pin cache")
        time.sleep(6)
        _check_pins(client, admin)

        bad = client.get(
            f"{_BASE}/api/metrics",
            headers=_auth("mcpg_not_a_real_key"),
        )
        _ok("bad key", bad, {401})

        temp_id, temp_key = _create_key(
            client,
            admin,
            client_ids["demo-agent"],
            "demo notes-only",
            _NOTES_SCOPES,
        )
        denied = client.get(f"{_BASE}/api/metrics", headers=_auth(temp_key))
        _ok("wrong scope GET /api/metrics", denied, {403})
        removed = client.delete(
            f"{_BASE}/api/keys/{temp_id}",
            headers=_auth(admin),
        )
        _require("revoke notes-only key", removed, {200, 201})

        admin_mcp = _mcp_headers(client, admin)
        blocked_write = _tools_call(
            client,
            admin_mcp,
            "write_note",
            {"name": "demo-note", "content": "should be blocked"},
            5,
        )
        if _ok("mcp write_note pin block", blocked_write, {403}):
            reason = _pin_reason(client, admin, "write_note")
            if reason != "pin_revoked":
                message = (
                    f"FAIL write_note pin reason is {reason}, expected pin_revoked"
                )
                print(message, file=sys.stderr)
                failures.append(message)
            else:
                print("ok   write_note reason pin_revoked")

        blocked_read = _tools_call(
            client, admin_mcp, "read_note", {"name": "demo-note"}, 6
        )
        if _ok("mcp read_note pin block", blocked_read, {403}):
            reason = _pin_reason(client, admin, "read_note")
            if reason != "pin_drift":
                message = f"FAIL read_note pin reason is {reason}, expected pin_drift"
                print(message, file=sys.stderr)
                failures.append(message)
            else:
                print("ok   read_note reason pin_drift")

        _burst(client, admin)

    if failures:
        print(f"seed_demo_data: {len(failures)} step(s) failed.", file=sys.stderr)
        raise SystemExit(1)
    print("seed_demo_data: complete")


if __name__ == "__main__":
    main()
