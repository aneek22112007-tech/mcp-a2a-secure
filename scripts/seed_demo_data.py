#!/usr/bin/env python3
"""
seed_demo_data.py — Seed the MCP Guard database with realistic demo data.

Usage (from repo root):
  cd api
  source .venv/bin/activate
  ADMIN_KEY=<your_admin_key> python ../scripts/seed_demo_data.py

The script:
  1. Creates two API keys (dev-admin, demo-agent)
  2. Syncs tool pins
  3. Approves write_note pin
  4. Runs the scanner
  5. Fires 10 tool calls via the MCP endpoint
     (list_notes, read_note, write_note — one with a bad key)

Safe to run multiple times — checks before creating.
"""

import asyncio
import os
import sys
import json
import time
import httpx

BASE_URL = os.environ.get("MCPG_BASE_URL", "http://127.0.0.1:8000")
ADMIN_KEY = os.environ.get("ADMIN_KEY", "")

if not ADMIN_KEY:
    print("ERROR: set ADMIN_KEY=<your_key> in environment", file=sys.stderr)
    sys.exit(1)

HEADERS = {"Authorization": f"Bearer {ADMIN_KEY}", "Content-Type": "application/json"}


def check(r: httpx.Response, label: str) -> dict:
    if r.status_code not in (200, 201):
        print(f"  ✗ {label}: HTTP {r.status_code} — {r.text[:200]}", file=sys.stderr)
        return {}
    data = r.json()
    print(f"  ✓ {label}")
    return data


async def main() -> None:
    async with httpx.AsyncClient(base_url=BASE_URL, headers=HEADERS, timeout=15) as c:

        print("\n── 0. Health check ──────────────────────────────────────────────────")
        r = await c.get("/health")
        if r.status_code != 200:
            print("Backend is not running. Start uvicorn first.", file=sys.stderr)
            sys.exit(1)
        data = r.json()
        print(f"  ✓ Backend up — {data.get('app', 'unknown')}")

        print("\n── 1. Create API keys ───────────────────────────────────────────────")

        # dev-admin
        r = await c.post("/api/keys", json={
            "client_id": "dev-admin",
            "name": "Dev Admin Key (seeded)",
            "scopes": ["admin"],
        })
        if r.status_code == 200:
            d = r.json()
            print(f"  ✓ dev-admin key created — prefix: {d.get('key_prefix')}…")
            print(f"    Raw key (save this): {d.get('raw_key')}")
        else:
            print(f"  ⚠ dev-admin key: HTTP {r.status_code} (may already exist)")

        # demo-agent
        r = await c.post("/api/keys", json={
            "client_id": "demo-agent",
            "name": "Demo Agent Key (seeded)",
            "scopes": ["notes:read", "notes:write", "agent:run"],
        })
        if r.status_code == 200:
            d = r.json()
            print(f"  ✓ demo-agent key created — prefix: {d.get('key_prefix')}…")
        else:
            print(f"  ⚠ demo-agent key: HTTP {r.status_code} (may already exist)")

        print("\n── 2. Sync + approve tool pins ──────────────────────────────────────")
        r = await c.post("/api/pins/sync")
        check(r, "Sync pins")

        # Approve list_notes
        r = await c.post("/api/pins/list_notes/approve", json={"note": "seeded"})
        check(r, "Approve list_notes")

        # Approve read_note
        r = await c.post("/api/pins/read_note/approve", json={"note": "seeded"})
        check(r, "Approve read_note")

        # Approve write_note
        r = await c.post("/api/pins/write_note/approve", json={"note": "seeded"})
        check(r, "Approve write_note")

        # Revoke write_note so the dashboard shows a revoked pin for demo
        r = await c.post("/api/pins/write_note/revoke", json={"note": "demo revoke — seeded"})
        check(r, "Revoke write_note (for demo)")

        print("\n── 3. Run scanner ───────────────────────────────────────────────────")
        r = await c.post("/api/scanner/run")
        d = check(r, "Scanner run")
        if d:
            print(f"    tools_scanned={d.get('tools_scanned')} findings_open={d.get('findings_open')}")

        print("\n── 4. Fire MCP tool calls ───────────────────────────────────────────")

        def mcp_body(tool: str, args: dict, req_id: int = 1) -> dict:
            return {
                "jsonrpc": "2.0",
                "id": req_id,
                "method": "tools/call",
                "params": {"name": tool, "arguments": args},
            }

        mcp_headers = {
            "Authorization": f"Bearer {ADMIN_KEY}",
            "Content-Type": "application/json",
        }

        for i in range(4):
            r = await c.post("/mcp/", headers=mcp_headers, json=mcp_body("list_notes", {}, i + 1))
            status = "ok" if r.status_code == 200 else f"HTTP {r.status_code}"
            print(f"  ✓ list_notes ({status})")
            await asyncio.sleep(0.1)

        for name in ["foo", "bar"]:
            r = await c.post("/mcp/", headers=mcp_headers,
                             json=mcp_body("write_note", {"name": name, "content": f"seeded note {name}"}, 10))
            status = "ok" if r.status_code == 200 else f"HTTP {r.status_code}"
            print(f"  ✓ write_note {name} ({status})")
            await asyncio.sleep(0.1)

        for name in ["foo", "bar"]:
            r = await c.post("/mcp/", headers=mcp_headers,
                             json=mcp_body("read_note", {"name": name}, 20))
            status = "ok" if r.status_code == 200 else f"HTTP {r.status_code}"
            print(f"  ✓ read_note {name} ({status})")
            await asyncio.sleep(0.1)

        # One bad key call to generate a 401 in audit
        bad_headers = {"Authorization": "Bearer mcpg_bad_key_seed_test", "Content-Type": "application/json"}
        r = await c.get("/api/metrics", headers=bad_headers)
        print(f"  ✓ Bad-key call (expect 401): HTTP {r.status_code}")

        print("\n── 5. Verify metrics ────────────────────────────────────────────────")
        r = await c.get("/api/metrics")
        d = check(r, "Metrics")
        if d:
            totals = d.get("totals", {})
            print(f"    total={totals.get('total')} "
                  f"allowed={totals.get('successful')} "
                  f"denied={totals.get('denied')}")

        print("\n✅  Seed complete. Open http://localhost:5173/console to see live data.\n")


if __name__ == "__main__":
    asyncio.run(main())
