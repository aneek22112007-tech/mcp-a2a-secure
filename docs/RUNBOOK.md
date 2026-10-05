# MCP Guard — Operations Runbook

> **Scope**: This runbook covers the MCP Guard FastAPI backend (`api/`), the
> React/Vite frontend (`frontend/`), and the Express authentication proxy
> (`backend/`). Tool execution runs in a Docker sandbox. A2A signing key
> rotation is documented as an architectural placeholder pending full
> implementation.

---

## Prerequisites & Service Dependencies

| Dependency | Version | Purpose |
|------------|---------|---------|
| Python | ≥ 3.11 | FastAPI backend runtime |
| [uv](https://docs.astral.sh/uv/) | latest | Python dependency management |
| Node.js | ≥ 22 LTS | Frontend build and dev server |
| npm | ≥ 10 | Frontend package manager |
| SQLite | bundled (`aiosqlite`) | Application database |
| Docker | ≥ 24 | Required for sandbox execution unless `SANDBOX_MODE=inprocess` |

---

## Environment Variables

All API variables are loaded from `api/.env` (copy `api/.env.example`).
**Never commit `.env` files or secret values to version control.**

### FastAPI backend (`api/.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `APP_NAME` | `MCP Guard` | Application display name |
| `ENVIRONMENT` | `dev` | Controls docs visibility. Set to `production` to disable `/docs`, `/redoc`, `/openapi.json` |
| `CORS_ORIGINS` | `["http://localhost:5173"]` | JSON array of allowed CORS origins |
| `MCP_SELF_URL` | `http://127.0.0.1:8000/mcp/` | URL the status endpoint probes |
| `DATABASE_URL` | `sqlite+aiosqlite:///data/mcp_guard.db` | Async SQLAlchemy connection URL |
| `NOTES_DIR` | `api/data/notes` | Directory for note `.md` files |
| `MAX_BODY_BYTES` | `1048576` (1 MiB) | HTTP request body size limit |
| `TOOL_TIMEOUT_S` | `5.0` | MCP tool invocation timeout (seconds). Must be greater than `SANDBOX_TIMEOUT_S` |
| `SANDBOX_MODE` | `docker` | `docker` or `inprocess`. Production refuses `inprocess` |
| `SANDBOX_IMAGE` | `mcp-guard-tool-runner:local` | Image built by `api/scripts/build_sandbox_image.sh` |
| `SANDBOX_TIMEOUT_S` | `4` | Seconds for one sandbox run |
| `SANDBOX_MEMORY` | `128m` | Container memory and memory-swap limit |
| `SANDBOX_CPUS` | `0.5` | Container CPU limit |
| `SANDBOX_PIDS_LIMIT` | `64` | Process limit inside the container |
| `SANDBOX_MAX_FILE_BYTES` | `1048576` | Largest file the container may write |
| `SANDBOX_MAX_OUTPUT_BYTES` | `1048576` | Largest tool result accepted |
| `SANDBOX_MAX_CONCURRENT` | `4` | Active sandbox runs. A full queue returns 503 |
| `SANDBOX_NETWORK` | `none` | Docker network. `host` is rejected. Production requires `none` |
| `SANDBOX_RUN_AS` | `65534:65534` | `uid:gid` inside the container |
| `SANDBOX_NOTES_SOURCE` | unset | Absolute host path or `volume:<name>` mounted at `/notes` |
| `SANDBOX_DOCKER_BIN` | `docker` | Docker CLI binary |

> **Production requirement**: Set `ENVIRONMENT=production` to disable API documentation endpoints. The default `dev` keeps docs enabled and is suitable only for local development.

### Express auth proxy (`backend/.env`)

See `backend/.env.example`. Contains Google OAuth client ID/secret. These are sensitive credentials — rotate immediately if exposed.

---

## Starting and Stopping Services

### FastAPI backend

```bash
cd api

# Install dependencies (first time or after lockfile changes)
uv sync

# Start development server (auto-reload)
uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

# Stop: Ctrl+C
```

**Production start** (no reload, production environment):

```bash
ENVIRONMENT=production uv run uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 1
```

### Frontend

```bash
cd frontend

# Install dependencies
npm ci

# Start dev server (hot module replacement)
npm run dev
# Starts at http://localhost:5173

# Build production bundle
npm run build

# Stop dev server: Ctrl+C
```

### Express authentication proxy

```bash
cd backend
npm install
node server.js
# Default port: see backend/.env
```

---

## Health Checks and Status Endpoint

### `GET /health`

Returns immediately with `{"status": "ok", "app": "MCP Guard"}`.
No authentication required.  HTTP 200 means the process is alive.

```bash
curl http://localhost:8000/health
```

### `GET /api/status`

Performs a real MCP protocol handshake with the MCP endpoint at
`MCP_SELF_URL` and reports the result.  Always returns HTTP 200.

| Field | Value | Meaning |
|-------|-------|---------|
| `mcp` | `"online"` | Handshake succeeded |
| `mcp` | `"offline"` | Transport or protocol failure |
| `error` | `"mcp_unavailable"` | Stable error code when MCP is down |
| `latency_ms` | integer | Round-trip probe time (ms) |
| `tools` | array | Registered tool names |

```bash
curl http://localhost:8000/api/status | python -m json.tool
```

The `error` field always contains the stable string `"mcp_unavailable"` when
offline — not the raw exception message. Diagnostic details are logged
server-side at `WARNING` level.

---

## Inspecting Application Logs

### Log format

All log records include `rid=<request-id>` so events from a single request
can be correlated:

```
2026-10-03 10:00:01 [INFO] rid=abc-123 app.routes.notes - list_notes called
```

The request ID is taken from the `X-Request-ID` header (if valid) or
generated as a UUID4. It is echoed in every response via `X-Request-ID`.

### Log configuration

The log format is defined in `api/log_config.json`. Pass it to uvicorn with:

```bash
uvicorn app.main:app --log-config api/log_config.json
```

### Finding errors for a specific request

```bash
# In production logs, filter by request ID
grep "rid=<request-id>" /var/log/mcp-guard/app.log

# Real-time stderr tailing in development
uvicorn app.main:app --reload 2>&1 | grep -E "ERROR|WARNING|rid="
```

---

## MCP Unavailable Errors and Connectivity Troubleshooting

When `GET /api/status` returns `"mcp": "offline"` with `"error": "mcp_unavailable"`:

1. **Check the backend is running**: `curl http://localhost:8000/health`
2. **Check the MCP mount**: `curl -v http://localhost:8000/mcp/` — the MCP
   streamable HTTP transport must return a 2xx or 4xx (not a connection refused).
3. **Check `MCP_SELF_URL`**: Verify it matches the actual host/port of the
   running FastAPI process. In Docker, `127.0.0.1` may need to be replaced
   with the container service name.
4. **Check probe timeout**: The status endpoint uses a 3-second probe timeout
   (`PROBE_TIMEOUT_SECONDS = 3`). If the MCP handshake is slow, the status
   will show offline even though the transport is reachable.
5. **Inspect server logs**: The `WARNING` log line `[status] MCP probe failed
   type=<ExcType>` includes the full exception traceback for operators.

---

## Docker sandbox

Build the runner image from `api/`:

```bash
./scripts/build_sandbox_image.sh
```

The image tag defaults to `mcp-guard-tool-runner:local`. Set `SANDBOX_IMAGE` when the tag is different.

On a Mac, Docker Desktop shares `/Users` into the Linux VM, so a `NOTES_DIR` under the home directory can be bind-mounted. Colima uses the same `docker` CLI. Point the CLI at the Colima context and leave `SANDBOX_DOCKER_BIN` as `docker`.

On Linux, a bind-mounted notes directory keeps the host ownership. Set the container user to the owner of that directory so `write_note` can create files:

```bash
SANDBOX_RUN_AS=$(id -u):$(id -g)
```

Bind sources may not contain commas or equals signs.

Compose can mount a named volume instead of a host path:

```bash
SANDBOX_NOTES_SOURCE=volume:<name>
```

`503` with the message `Sandbox unavailable.` means the Docker daemon is not reachable, the runner image is missing, or every sandbox slot is busy. The tool is not run in the API process. Check the daemon with `docker info` and the image with `docker image inspect mcp-guard-tool-runner:local`. A finished run is removed. `docker ps -a --filter label=mcp_guard.sandbox=1` should be empty after the call returns.

---

## Sandbox run records

Every tool invocation starts a sandbox run. The lifecycle is recorded in the `sandbox_runs` table.

- **API**: `GET /api/sandbox/runs` lists runs (newest first) and supports filtering by `client_id`, `tool_name`, `status`, `transport`, `mode`, `request_id`, and a time window (`start`, `end`). `GET /api/sandbox/runs/{run_id}` returns details for a specific run. `GET /api/sandbox/health` returns the health of the sandbox executor without leaking sensitive configuration paths.
- **Startup sweep**: When the application starts, `sweep_stale_runs()` runs to find runs that were stuck in `running` or `pending` (if the process crashed) and marks them `failed` with the error type `stale_run`.
- **Pruning**: The retention scheduler (or `scripts/prune_audit.py`) deletes sandbox runs older than `SANDBOX_RUN_RETENTION_DAYS`. It sweeps stale runs before deletion. A single `sandbox.retention` audit event is written if runs are deleted.
- **Demo script**: `scripts/demo_sandbox.sh` provisions an admin key and demonstrates the lifecycle by starting the API, querying health, running tools, and listing the resulting sandbox records.

---

## Database Migration Failures and Recovery

### Running migrations

```bash
cd api
uv run alembic upgrade head
```

Mutating REST calls (`PUT /api/notes/{name}`) and MCP `tools/call` are
audit-first: a required `tool.call` row is written before the tool runs.
Then a best-effort `tool.result` row records the outcome. Read tools
(`GET /api/notes`, `GET /api/notes/{name}`) are audited after execution:
a required `tool.call` row is written before the result is returned.
Auth allow and deny stay fail-open: a failed audit write does not turn
a 401 or 403 into a 500.

`GET /api/audit/stream` is an in-process SSE feed. `AUDIT_STREAM_MAX_SUBSCRIBERS`
(default 20) caps concurrent subscribers. `AUDIT_STREAM_QUEUE_SIZE` (default 100)
is the per-subscriber queue; a full queue drops that subscriber's newest
events and logs a warning once.

### Checking migration status

```bash
uv run alembic current     # current revision applied to the DB
uv run alembic history     # full revision history
uv run alembic check       # verify the DB matches the latest head
```

### Recovery precautions

- **Always back up the database before applying migrations in production.**
- SQLite: `cp api/data/mcp_guard.db api/data/mcp_guard.db.bak`
- If a migration fails midway, restore from backup and investigate the
  migration script before retrying.
- Alembic's `downgrade -1` reverts the last migration:
  ```bash
  uv run alembic downgrade -1
  ```
- For destructive operations, review the generated SQL first:
  ```bash
  uv run alembic upgrade head --sql  # dry run — prints SQL, does not execute
  ```

> **Note**: The application uses an **async** SQLAlchemy engine
> (`sqlite+aiosqlite`). Alembic runs migrations through `asyncio.run()` in
> `alembic/env.py`. Do not replace the engine with a synchronous driver
> without updating `env.py`.

---

## Rate Limiting

The application uses an in-memory token bucket rate limiter to protect both REST routes and the MCP stream. By default, the capacity is `100` and the refill rate is `10.0` tokens per second.

If 429 Too Many Requests responses are frequent:

- Adjust `RATE_LIMIT_CAPACITY` and `RATE_LIMIT_REFILL_RATE_PER_SEC` in `.env`.
- Note that rate limit rejections are audited as `rate_limit.deny` rows, but throttled to at most one per window.

If body-size 413 responses are frequent:

- Adjust `MAX_BODY_BYTES` in `.env` (default 1 MiB).
- The per-note content limit is 100 KiB (`MAX_CONTENT_BYTES` in `routes/notes.py`).
- The gateway argument limit is 128 KiB (`MAX_ARG_BYTES` in `gateway.py`).

If 504 Gateway Timeout responses occur frequently:

- Increase `TOOL_TIMEOUT_S` in `.env` (default 5.0 seconds).
- Investigate the tool function for slow I/O (check `api/data/notes/` for unusually large or numerous files).

---

## Verifying the audit trigger on Postgres

After applying the append-only migration on Postgres:

```bash
# Verify INSERT works
psql -c "INSERT INTO audit_events (id, action, decision, status, created_at) VALUES ('t1', 'tool.call', 'allowed', 'ok', now())"

# Verify UPDATE is blocked
psql -c "UPDATE audit_events SET status = 'ok' WHERE id = 't1'"  # should FAIL

# Verify DELETE is blocked
psql -c "DELETE FROM audit_events WHERE id = 't1'"  # should FAIL

# Verify TRUNCATE is blocked
psql -c "TRUNCATE audit_events CASCADE"  # should FAIL

# Verify retention still works (uses SET LOCAL mcp_guard.audit_retention = 'on')
uv run --with asyncpg python scripts/prune_audit.py --dry-run

# Downgrade removes the triggers
uv run --with asyncpg alembic downgrade bb37200ee50c
psql -c "SELECT tgname FROM pg_trigger WHERE tgrelid = 'audit_events'::regclass"
# expect 0 rows
```

---

## Running behind a reverse proxy

When uvicorn is behind a reverse proxy (nginx, Caddy, ALB, etc.) that sets
`X-Forwarded-For`, configure `TRUSTED_PROXIES` so the real client IP is used
for rate limiting and throttling:

```bash
# In api/.env — single proxy at 10.0.0.1
TRUSTED_PROXIES=["10.0.0.1"]

# Or a CIDR block
TRUSTED_PROXIES=["10.0.0.0/8"]
```

Pass `--no-proxy-headers` to uvicorn so it does not apply its own
`X-Forwarded-For` handling, letting MCP Guard control it:

```bash
uv run uvicorn app.main:app --no-proxy-headers ...
```

Without `TRUSTED_PROXIES`, all `X-Forwarded-For` headers are ignored and the
raw peer address from the TCP connection is used as the client IP.

---

## Failed-auth throttling

After `AUTH_FAILURE_LIMIT` (default 20) failed 401 responses from the same
client IP within `AUTH_FAILURE_WINDOW_S` (default 60 seconds), every further
authentication attempt from that IP returns 429 with a `Retry-After` header.

- Only 401 outcomes count; a 403 (insufficient scope) or a successful auth
  never increments or resets the counter.
- The first time an IP is throttled in a window, a best-effort `auth.deny` row
  with `reason=auth_throttled` and `error_code=RATE_LIMITED` is written.
- The counter lives in process memory. Restarting the application resets it.
- Settings: `AUTH_FAILURE_LIMIT`, `AUTH_FAILURE_WINDOW_S`,
  `AUTH_FAILURE_MAX_TRACKED_IPS` (LRU cap, default 10 000).

---

## Audit Retention

Audit events are retained for 90 days by default.

- To change the retention period, update `AUDIT_RETENTION_DAYS` in `.env`.
- To enable the background cleanup task, set `ENABLE_RETENTION_SCHEDULER=True`.
- You can manually preview or execute cleanup using `uv run python scripts/prune_audit.py [--dry-run]`.
- Manual or scheduled cleanup will write an `audit.retention` audit record detailing how many events were deleted.

---

## API-key Rotation

> The current implementation does not expose API keys to external callers.
> The database schema includes an `api_keys` table (see `app/models/api_keys.py`)
> but no key-issuance or rotation endpoint is implemented yet.

When API key rotation is implemented, the procedure will involve:
1. Generating a new key hash and writing it to the `api_keys` table.
2. Distributing the new key to callers through a secure out-of-band channel.
3. Setting a revocation timestamp on the old key.
4. After the grace period, deleting or disabling the old key record.

---

## A2A Signing-key Rotation

> A2A (Agent-to-Agent) request verification is not yet implemented in this
> codebase. The `backend/` Express service handles Google OAuth; no A2A
> signing keys are present.

When A2A signing-key rotation is implemented:
1. Generate a new key pair using the project's chosen algorithm.
2. Register the new public key with all A2A consumers.
3. Rotate the private key in the secrets manager / environment.
4. Verify inbound A2A requests are accepted with the new key.
5. Revoke the old key after all consumers have migrated.

---

## Deployment Verification

After deploying a new version, verify:

```bash
# 1. Process health
curl https://<host>/health

# 2. MCP handshake
curl https://<host>/api/status | python -m json.tool
# Expect: {"mcp": "online", ...}

# 3. Documentation endpoints disabled in production
curl -o /dev/null -w "%{http_code}" https://<host>/docs      # expect 404
curl -o /dev/null -w "%{http_code}" https://<host>/redoc     # expect 404
curl -o /dev/null -w "%{http_code}" https://<host>/openapi.json  # expect 404

# 4. Security headers present
curl -I https://<host>/health | grep -E "x-frame-options|x-content-type-options|content-security-policy"

# 5. Notes API
curl https://<host>/api/notes       # expect [] or list of names
```

---

## Rollback Steps

### Application rollback

1. Identify the last known-good Docker image tag or Git commit.
2. Deploy the previous version.
3. Verify with the deployment verification checks above.

### Database rollback

```bash
# Restore from pre-migration backup
cp api/data/mcp_guard.db.bak api/data/mcp_guard.db

# OR: Use Alembic downgrade
cd api && uv run alembic downgrade -1
```

### Escalation

If the service cannot be restored within SLA:
1. Engage the on-call engineer with the failing request ID from logs.
2. Provide the full exception traceback from server logs (not the client response).
3. Do not expose internal exception details to end users.
