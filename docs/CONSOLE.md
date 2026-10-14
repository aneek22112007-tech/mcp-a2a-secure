# MCP Guard live console

The live console is the React app in `frontend/src/console/`. `/console` and `/dashboard` both render it. The old `/dashboard-legacy` and `/dashboard-v2` screens are gone.

The console talks to the Python API on port 8000. You type an API key into the connect screen. The browser keeps that key in `sessionStorage` for the tab. It is not a build variable and it is not written into the frontend source.

## Settings

Copy `api/.env.example` to `api/.env` and set these before you start the API:

```
ENVIRONMENT=dev
SANDBOX_MODE=inprocess
TOOL_PINNING_MODE=enforce
API_KEY_PEPPER=replace-with-a-local-development-secret
MCP_SELF_API_KEY=
MCPG_DEMO_POISON_TOOL=1
RATE_LIMIT_CAPACITY=20
```

`API_KEY_PEPPER` is any long local secret. Do not commit `api/.env`.

`MCP_SELF_API_KEY` is an `mcpg_` key with the `agent:run` scope. The admin key from `create_admin_key.py` is enough. `/api/status` uses it only to probe MCP. Leave it empty and the overview shows an amber line, "MCP not configured: set MCP_SELF_API_KEY". The status route cannot tell an unset key apart from any other probe failure, so that same amber line also covers a probe that failed for another reason. A green online badge means the probe succeeded.

`RATE_LIMIT_CAPACITY=20` is the demo setting in `api/.env.example`. The attack simulator and the seed script send 120 requests at once. A bucket of 20 cannot hold that burst, so most of those requests come back as 429 with a Retry-After value. The code default without this setting is 100, and a higher capacity can absorb the whole burst so you see zero 429 responses. Restart the API after you change it.

`MCPG_DEMO_POISON_TOOL=1` registers `poisoned_test_tool`. Its description is a fixture for the scanner (R1 prompt injection and R2 exfiltration). The function returns a fixed string and does not open a network connection. The flag is refused when `ENVIRONMENT` is production-like. Leave it unset when you run the test suite, or the tests that expect only the three notes tools will fail. Restart the API after you change it.

## Run

From the repo root, in this order.

1. Apply the schema and create the two local clients.

```bash
cd api
uv run alembic upgrade head
uv run python scripts/seed_dev.py
```

`seed_dev.py` creates the clients `dev-admin` and `demo-agent`. It does not create keys. It refuses to run unless the environment is dev, development, or local.

2. Create an admin key and put it in the environment you will use for the seed script. The script prints the raw key once.

```bash
uv run python scripts/create_admin_key.py
```

Copy that key into `MCP_SELF_API_KEY` in `api/.env`. Keep the same value in your shell as `ADMIN_KEY` for the next step. Do not paste it into a `VITE_` variable.

3. Start the API, then seed demo traffic. The seed script calls the running API, so uvicorn has to be up first.

```bash
uv run uvicorn app.main:app --host 127.0.0.1 --port 8000
```

In a second terminal, from `api/`:

```bash
ADMIN_KEY="the key from create_admin_key.py" uv run python scripts/seed_demo_data.py
```

`seed_demo_data.py` also refuses to run outside a dev environment. It reads `ADMIN_KEY` from the environment and exits if that variable is missing. HTTP 200 and 201 count as success. Any other status on a setup step is a failure and is printed with the status and a short body. A step that is supposed to be denied (401, 403, or 429) succeeds only when the status matches. The process exits non-zero if any step fails.

The script resolves `dev-admin` and `demo-agent` from the database, then creates keys for those clients. It syncs pins, approves `list_notes`, `read_note`, and `write_note`, and runs the scanner. It opens an MCP session with `initialize`, reuses the `mcp-session-id` header, and sends `Accept: application/json, text/event-stream`. Through that session it writes, reads, and lists a note so sandbox runs exist. It then revokes `write_note` and rewrites the stored `read_note` fingerprint so the pin shows drift. After the pin cache expires it calls those tools again and checks the audit reasons `pin_revoked` and `pin_drift`. It also sends a bad key, a notes-only key against `/api/metrics`, and a burst of 120 metrics requests. The base URL is `MCPG_BASE_URL` or `http://127.0.0.1:8000`.

If the scanner step says R1 or R2 is missing, set `MCPG_DEMO_POISON_TOOL=1`, restart uvicorn, and run the seed script again.

4. Start the frontend and open the console.

```bash
cd frontend
npm run dev
```

Open http://localhost:5173/console. The API only allows that origin in CORS. Paste the admin key into the connect screen. Leave the backend URL as http://127.0.0.1:8000. The footer shows the same value. MCP calls to `localhost` can be rejected by the server host check, so the field defaults to 127.0.0.1.

`/signin` and `/signup` still use the Node server on port 5001. The console does not.

## What you should see

Overview counts requests from `GET /api/metrics` and pin totals from `GET /api/pins`. The live event feed and the demo sequence sit side by side under the pipeline strip. "Run demo sequence" sends a real allowed call, a bad key (401), a wrong scope (403), a rate-limit burst (429), and a pinned-tool block. Each row is labelled from the HTTP status. A 200 is Allowed. A 403 that says the tool is not approved, or whose audit reason is `pin_revoked`, `pin_drift`, `pin_scan_blocked`, or `pin_missing`, is the pin gate.

API Keys lists every client id found in the audit log. Live Audit hides the console's own `GET /api` allow rows until you turn on "Show console GET /api polls". The scanner button is "Scan all tools".

If `GET /health` fails, the console switches to the demo dataset and shows "DEMO DATA (backend offline)". The Live and backend-ok text is hidden. When health succeeds again, it returns to live data. A request that does not finish within 5 seconds shows an error instead of a spinner.

## What was not changed

These paths were not edited for the console:

- `backend/` (the Node auth server)
- `frontend/src/lib/api.ts`
- `frontend/src/components/auth/`
- the `/signin` and `/signup` routes and the Google OAuth provider in `frontend/src/App.tsx`
- `api/app/auth/`
- `api/app/rate_limit.py`

`App.tsx` only lost the old dashboard routes. `/dashboard` and `/console` both render `ConsoleApp`.
