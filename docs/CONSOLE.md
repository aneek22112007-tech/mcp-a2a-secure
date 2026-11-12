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
```

`API_KEY_PEPPER` is any long local secret. Do not commit `api/.env`.

`MCP_SELF_API_KEY` is an `mcpg_` key with the `agent:run` scope. The admin key from `create_admin_key.py` is enough. `/api/status` uses it only to probe MCP. Leave it empty and the overview shows an amber line, "MCP not configured: set MCP_SELF_API_KEY". The status route cannot tell an unset key apart from any other probe failure, so that same amber line also covers a probe that failed for another reason. A green online badge means the probe succeeded.

Rate limiting defaults to a bucket capacity of 30 requests (`RATE_LIMIT_CAPACITY=30`) and a refill rate of 5 requests per second (`RATE_LIMIT_REFILL_RATE_PER_SEC=5.0`). The Attack page sends 120 requests at once. With a capacity of 30 and assuming no refill during the burst, approximately 90 requests will receive HTTP 429 responses with a Retry-After value. Approximately 90 is the expected burst behavior rather than a guaranteed result under every timing condition, because tokens may refill while requests are processed. Operators can override these defaults via environment variables if desired. Restart the API after changing rate limit settings.

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

2. Create an admin key. The script prints the raw key once.

```bash
uv run python scripts/create_admin_key.py
```

Copy that key into `MCP_SELF_API_KEY` in `api/.env`, and keep it handy to paste into the console connect screen. Do not paste it into a `VITE_` variable.

3. Start the API.

```bash
uv run uvicorn app.main:app --host 127.0.0.1 --port 8000
```

To populate the console with genuine activity, produce real system traffic instead of fabricating database rows:

- **Console Attack simulator**: In the console, navigate to the Attack Simulator page and click "Run all" (or run individual attack steps). These send real requests against the running gateway — testing invalid keys, forbidden scopes, rate-limit bursts, and path traversal probes.
- **Demo shell scripts**: From `api/`, run the existing automated scenario scripts:
  ```bash
  ./scripts/demo_tool_pinning.sh
  ./scripts/demo_sandbox.sh
  ./scripts/demo_audit.sh
  ./scripts/demo_scanner.sh
  ```
- **Notes agent**: From `api/`, run tasks through the notes agent:
  ```bash
  uv run python scripts/run_notes_agent.py "list the notes"
  ```

### Demonstrating real pin drift

To demonstrate genuine pin drift without fabricating fingerprints or modifying database rows:

1. Edit a tool's docstring in `api/app/mcp_server.py` (e.g. edit the description of `read_note`).
2. Restart the API with `TOOL_PINNING_MODE=enforce`:
   ```bash
   TOOL_PINNING_MODE=enforce uv run uvicorn app.main:app --host 127.0.0.1 --port 8000
   ```
3. Call that tool (via the console Attack page, an MCP client, or the notes agent).
4. The gateway detects the fingerprint change against the stored pin and reports a genuine `pin_drift` (returning HTTP 403 in enforce mode).

Real traffic and audit records are always produced by actual tool requests, and real pin drift is produced by genuine tool-definition changes detected by the gateway. No database rows should be manually fabricated to simulate these events.

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

### AI Analyst

`#/analyst` (keyboard `i`) lists incidents from `GET /api/analyst/incidents`. The nav item needs `audit:read`. The window label uses `window_hours` from that response. Kind and severity chips filter the list. Each row shows severity, kind, the group key, the event count, and first and last seen. A stored report is tagged explained or stale.

The live audit stream does not refetch the list on every event. A new event with decision `denied`, or action `tool.output.injection`, shows "New security events. Refresh". The empty state is "No security incidents in the last N hours." with N from `window_hours`.

The right side shows facts and the events table from the detail response. Event text is rendered as text. Each row links to `#/audit` and shows the event id. The hash router has no query filter, so the link is only `#/audit`. Related incidents are buttons that clear the filters and select that incident.

Explain needs `analyst:run`. Without it, the page says "You need the analyst:run scope to ask for an explanation." Facts and events still show. The button calls `POST /api/analyst/explain` with a 75 second timeout. It sends `refresh: true` only when the stored report is stale. The label while it runs is "Asking <model>..." using `ollama_model` from `GET /api/analyst/status`.

The explanation is labelled "AI explanation, checked against N events". It shows the summary, a timeline whose ref chips scroll to that event row, likely cause, impact, next steps, and confidence. The footer shows provider, model, latency, a withheld count when it is greater than zero, the time, "via Groq fallback" when `fell_back` is true, and "cached" when the report was reused. It is not shown as a verdict.

When the status says the analyst is down, a previously stored report is hidden. The sentences are "Analyst unavailable. LLM_ENABLED is false.", "Analyst unavailable. Ollama is not reachable at the configured URL and Groq is not configured.", and "Analyst unavailable. The configured Ollama model is not present and Groq is not configured." If Ollama is down but Groq is configured, Explain stays enabled. A 502 says the reply failed the checks and names the reason. Busy and 429 name `ANALYST_BUSY` and `429`.

Connecting a key probes `analyst:run`. A key without that scope writes one real `auth.deny` per connect. See [AI_ANALYST.md](AI_ANALYST.md).

If `GET /health` fails, the console enters an offline state. It never falls back to fabricated demo data; instead, it continues displaying the last genuine backend data cached by React Query alongside an honest offline indicator ("Backend offline. Showing the last data received at HH:MM IST."). The timestamp reflects the actual last successful data update from the backend, or shows that no data has been loaded yet if the cache is empty. The health pill and stream status indicator remain visible to reflect current connection health. Actions that perform backend mutations (creating/revoking API keys, running scans, approving/revoking pins, and running attack sequences) are disabled while offline. When the backend becomes reachable again, queries resume and actions are re-enabled. A request that does not finish within 5 seconds shows an error instead of a spinner.

## What was not changed

These paths were not edited for the console:

- `backend/` (the Node auth server)
- `frontend/src/lib/api.ts`
- `frontend/src/components/auth/`
- the `/signin` and `/signup` routes and the Google OAuth provider in `frontend/src/App.tsx`
- `api/app/auth/`
- `api/app/rate_limit.py`

That list is the boundary of the original console change. The AI Analyst page uses `analyst:run` from `api/app/auth/scopes.py` and the explain bucket in `api/app/rate_limit.py`. Sign-in, `frontend/src/lib/api.ts`, `backend/`, and the rest of `api/app/auth/` are unchanged.

`App.tsx` only lost the old dashboard routes. `/dashboard` and `/console` both render `ConsoleApp`.
