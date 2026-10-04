# MCP Guard — Threat Model

> **Scope**: This threat model covers the actual implemented components as of
> `ci/quality-base`. Controls are documented only where evidence exists in
> the code or tests. Proposed/planned controls are labelled **[PROPOSED]**.

---

## Architecture and Trust Boundaries

```
┌─────────────────────────────────────────────────────────────────────┐
│ Browser (untrusted)                                                  │
│  React + Vite frontend (frontend/)                                   │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  mcpApi.ts — fetch() → http://localhost:8000                  │   │
│  └──────────────────────────────────────────────────────────────┘   │
└────────────────────────────┬────────────────────────────────────────┘
                              │ HTTP (CORS-controlled)
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ TRUST BOUNDARY: API process                                          │
│  FastAPI (api/) — port 8000                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │
│  │ SecurityHeaders│  │BodySizeLimit │  │ RequestContextMiddleware  │  │
│  │ Middleware    │  │ Middleware    │  │ (request ID, log ctx)    │  │
│  └──────────────┘  └──────────────┘  └──────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ REST routes: /api/notes, /api/status, /health, /api/mcp/info │   │
│  └──────────────────────┬───────────────────────────────────────┘   │
│                          │                                           │
│  ┌──────────────────────▼───────────────────────────────────────┐   │
│  │ gateway.py — call_tool()                                       │   │
│  │  • allowlist check  • size guard  • timeout  • error sanitize │   │
│  └──────────────────────┬───────────────────────────────────────┘   │
│                          │                                           │
│  ┌──────────────────────▼───────────────────────────────────────┐   │
│  │ mcp_server.py / FastMCP tools                                  │   │
│  │  • list_notes  • read_note  • write_note                       │   │
│  │  • _safe() path-traversal guard                                │   │
│  └──────────────────────┬───────────────────────────────────────┘   │
│                          │                                           │
│  ┌──────────────────────▼───────────────────────────────────────┐   │
│  │ SQLite database (aiosqlite)                    api/data/       │   │
│  │ Alembic migrations                             mcp_guard.db   │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                              │ HTTP (same-process probe)
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ MCP Streamable HTTP transport — /mcp/                                │
│  FastMCP session manager                                             │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ Express auth proxy (backend/) — separate process                     │
│  Google OAuth 2.0 flow                                               │
└─────────────────────────────────────────────────────────────────────┘

[PROPOSED] Docker sandbox — not yet implemented
[PROPOSED] A2A request signing — not yet implemented
```

### Trust boundaries

| Boundary | Description |
|----------|-------------|
| **Browser ↔ API** | Untrusted HTTP input. CORS allowlist, body size limit, error sanitization applied. |
| **REST routes ↔ gateway** | Internal — routes must call gateway, never tools directly. |
| **Gateway ↔ MCP tools** | Internal — allowlist enforced; tool results normalised. |
| **API ↔ Filesystem** | Tool functions read/write `api/data/notes/`. Path-traversal guard enforced in `_safe()`. |
| **API ↔ SQLite** | Internal — SQLAlchemy async ORM; no raw SQL from user input in current routes. |
| **API ↔ Express OAuth** | Separate process; no direct code dependency in current API. |

---

## STRIDE Threat Table

### Spoofing

| Threat | Component | Current Mitigation | Evidence | Gap |
|--------|-----------|-------------------|----------|-----|
| Unauthenticated note write | `PUT /api/notes/{name}` | API-key auth and the `notes:write` scope | `api/app/auth/`, `api/app/auth/scopes.py` | Covered. A caller without a valid key gets 401. A key without `notes:write` gets 403. |
| Request ID spoofing | Middleware | IDs validated against `[A-Za-z0-9._:-]{0,64}` regex; overlong IDs replaced with UUID4 | `middleware.py:_REQUEST_ID_RE`, `test_hardening.py::test_overlong_and_invalid_request_ids_are_replaced` | Low — IDs are informational, not trusted for auth. |
| A2A agent impersonation | (planned) | **[PROPOSED]** — not implemented | No signing code present | Gap pending implementation. |

### Tampering

| Threat | Component | Current Mitigation | Evidence | Gap |
|--------|-----------|-------------------|----------|-----|
| Path traversal in note name | `read_note`, `write_note` | `_safe()` regex + resolved path check | `mcp_server.py:_safe()`, `test_mcp_tools.py::test_read_note_traversal_*` | Covered. |
| Oversized note content | `PUT /api/notes/{name}` | 100 KiB per-note limit in route; 128 KiB gateway arg limit | `routes/notes.py:MAX_CONTENT_BYTES`, `gateway.py:MAX_ARG_BYTES` | Covered. |
| Request body overflow | All routes | `BodySizeLimitMiddleware` enforces `MAX_BODY_BYTES` (default 1 MiB) | `middleware.py`, `test_hardening.py::test_content_length_over_limit_is_413` | Covered. |
| Database schema tampering | SQLite | Only Alembic migrations modify schema; no raw DDL from routes | `alembic/versions/` | Gap: no integrity checksums on migration files. |
| Tool allowlist bypass | Gateway | `ALLOWED_TOOLS` frozenset checked before dispatch | `gateway.py:ALLOWED_TOOLS`, `test_gateway.py::test_gateway_404_unknown_tool` | Covered. |

### Repudiation

| Threat | Component | Current Mitigation | Evidence | Gap |
|--------|-----------|-------------------|----------|-----|
| Unattributed tool call | Gateway, auth, `/mcp` | Mutating REST calls (`PUT /api/notes/{name}`) write a required `tool.call` row with status `forwarded` before the tool runs, then a best-effort `tool.result` row. A 503 `Audit log unavailable.` means the write did not happen. Read tools are audited after execution, before the result is returned. MCP `tools/call` is audited before forwarding. Arguments are stored only as a sha256 fingerprint. `client_ip` is personal data and is kept for the same retention period as the rest of the row. | `api/app/gateway.py`, `api/app/audit/`, `api/app/auth/dependencies.py`, `api/app/auth/mcp_asgi.py` | Auth rows can be missing if a best-effort write fails. A database owner or superuser can disable triggers, so run as a non-owner role. SQLite has only the ORM guard. The SSE stream is single-process. Raw keys, header values, argument values, and exception text are not stored. |
| Log tampering | Server logs | Logs go to stderr/stdout; no structured audit store yet | `log_config.json` | Gap: no tamper-evident log storage. |

### Information Disclosure

| Threat | Component | Current Mitigation | Evidence | Gap |
|--------|-----------|-------------------|----------|-----|
| Stack trace in error response | All routes | Generic 500 message; exception logged server-side only | `errors.py:unhandled_exception_handler`, `test_hardening.py::test_internal_error_hides_details_and_keeps_headers` | Covered. |
| MCP probe exception in status | `/api/status` | `error` field fixed to `"mcp_unavailable"`; real exc logged via WARNING | `routes/status.py:_offline`, `test_gateway.py::test_status_offline_*` | Covered (this PR). |
| Filesystem path in OS errors | Gateway | ToolError wrapping OSError returns generic 500 | `gateway.py` lines 189–196, `test_gateway.py::test_gateway_tool_error_os_error_hides_path` | Covered. |
| API docs in production | All documentation routes | Disabled via `docs_url=None` when `ENVIRONMENT != dev/local` | `main.py` lines 63–65, `test_docs_config.py` | Covered (this PR). |
| Secrets in logs | All | Logger warned not to log credentials; no credential logging in current code | Code review | Guideline only — no automated enforcement. |
| CORS wildcard | All | `allow_origins=settings.cors_origins` (no wildcard). Production-like environments reject any `CORS_ORIGINS` entry that is not an exact http or https origin | `main.py`, `config.py`, `test_hardening.py::test_cors_rejects_untrusted_origin` | Covered. Dev, development, local and test do not apply the exact-origin check. |
| Cached responses | All responses | `Cache-Control: no-store` on every response | `middleware.py` | Covered. |
| Missing HSTS | All responses | Opt-in `Strict-Transport-Security` when `HSTS_MAX_AGE_S` is greater than zero | `middleware.py`, `config.py` | Off unless `HSTS_MAX_AGE_S` is set. |
| Docs CSP | `/docs` | The relaxed docs CSP is used only while API docs are enabled (development). Every other route keeps the strict CSP | `middleware.py` | Covered outside development, where docs are disabled. |

### Denial of Service

| Threat | Component | Current Mitigation | Evidence | Gap |
|--------|-----------|-------------------|----------|-----|
| Request body bomb | All routes | `BodySizeLimitMiddleware` — 1 MiB limit, blocks on `Content-Length` | `middleware.py`, tests | Covered. |
| Huge `Content-Length` header | Middleware | Digit length capped at 18 before `int()` conversion | `middleware.py:_MAX_CONTENT_LENGTH_DIGITS` | Covered. |
| Slow MCP tool (tool timeout) | Gateway | `asyncio.wait_for(timeout=settings.tool_timeout_s)` (default 5 s) | `gateway.py`, `test_gateway.py::test_gateway_504_timeout` | Covered. |
| MCP probe blocking | `/api/status` | 3-second probe timeout; failure is a status, not a 500 | `routes/status.py:PROBE_TIMEOUT_SECONDS` | Covered. |
| Rate limiting | REST and `/mcp` | Per-key token buckets, separate for REST and `/mcp` (in-process, per worker). A per-IP failed-auth throttle (`AUTH_FAILURE_LIMIT` / `AUTH_FAILURE_WINDOW_S`) returns 429 with `Retry-After` | `api/app/rate_limit.py`, `api/app/auth/throttle.py` | Limits are per process. IP-based throttling can lock out clients behind a shared NAT. `X-Forwarded-For` is trusted only from `TRUSTED_PROXIES`. |
| Large note directory scan | `list_notes` | `NOTES_DIR.glob("*.md")` — unbounded if many files exist | `mcp_server.py:list_notes` | Gap: could be slow with thousands of notes. |

### Elevation of Privilege

| Threat | Component | Current Mitigation | Evidence | Gap |
|--------|-----------|-------------------|----------|-----|
| Tool not in allowlist invoked | Gateway | `ALLOWED_TOOLS` frozenset enforced before dispatch | `gateway.py:call_tool` | Covered. |
| Unauthenticated access to admin operations | All API routes | No authentication on any API route currently | No auth middleware | **HIGH GAP**: No authorization. All authenticated/unauthenticated callers share the same access level. |
| Alembic migration grants extra privileges | Database | Migrations reviewed per PR | Process control | Gap: no automated SQL review in CI. |

---

## Top 5 Risks

### Risk 1: No Authentication or Authorization on MCP Guard API

| Field | Detail |
|-------|--------|
| **Scenario** | Any client that can reach port 8000 can read, write, and list all notes without credentials. The gateway's `actor` parameter is `None` throughout. |
| **Likelihood** | High (in a multi-tenant or network-accessible deployment) |
| **Impact** | High — data disclosure, data tampering, service abuse |
| **Existing mitigation** | CORS allowlist limits browser origins; body size + timeout limit resource abuse |
| **Residual risk** | High — CORS is browser-only; any non-browser client (curl, scripts, A2A agents) bypasses it entirely |
| **Next action** | Implement Day-3 authentication: validate JWT/API key in `call_tool()` before dispatch |
| **Source files** | `api/app/gateway.py:84-117`, `api/app/routes/notes.py` |

---

### Risk 2: No Rate Limiting

| Field | Detail |
|-------|--------|
| **Scenario** | An attacker can flood the API with thousands of requests per second, exhausting filesystem I/O, SQLite connections, and the asyncio event loop. |
| **Likelihood** | Medium |
| **Impact** | Medium-High — service unavailability for legitimate users |
| **Existing mitigation** | Body size limit (1 MiB), tool timeout (5 s) limit per-request resource usage |
| **Residual risk** | Medium — volume attacks are still viable |
| **Next action** | Add SlowAPI or a reverse-proxy rate limiter (nginx, Caddy) in front of port 8000 |
| **Source files** | `api/app/middleware.py`, `api/app/config.py` |

---

### Risk 3: No Audit Trail for Tool Invocations

| Field | Detail |
|-------|--------|
| **Scenario** | A tool call or auth decision needs to be attributed after the fact. Mutating REST calls (`PUT /api/notes/{name}`) are audit-first: a required `tool.call` row with status `forwarded` is written before the tool runs, then a best-effort `tool.result` row. A 503 `Audit log unavailable.` means the write did not happen. Read tools are audited after execution, before the result is returned. MCP `tools/call` is audited before forwarding, so the MCP tool does not run without a row. `auth.allow` and `auth.deny` are fail-open so a real 401/403 is not turned into a 500. `client_ip` is personal data and is kept for the same retention period as the rest of the row. |
| **Likelihood** | Medium (a database outage drops best-effort auth rows; a required audit write fails closed with 503) |
| **Impact** | Medium — a missed auth row weakens investigation; a failed required audit blocks the call instead of hiding it |
| **Existing mitigation** | `audit_events` is written from the gateway, REST auth, and `/mcp`. Rows store the principal ids, key prefix, route template or constant reason, tool name, args sha256, and client IP. ORM `before_update` / `before_delete` reject mutation. On Postgres, revision `cc48301ff61d` rejects UPDATE, DELETE and TRUNCATE except the retention delete and the `api_key_id` ON DELETE SET NULL update. `GET /api/audit` and `GET /api/audit/stream` expose the rows to `audit:read`. |
| **Residual risk** | Medium — auth rows can be missing if the write fails; a database owner or superuser can disable triggers; SQLite has only the ORM guard; the SSE stream is single-process |
| **Next action** | Run Postgres as a non-owner role so a database owner or superuser cannot disable triggers. SQLite has only the ORM guard. The SSE stream is single-process. |
| **Source files** | `api/app/audit/sink.py`, `api/app/gateway.py`, `api/app/models/audit_events.py`, `api/app/repos/audit.py` |

---

### Risk 4: SQLite Database in Data Directory Without Integrity Checks

| Field | Detail |
|-------|--------|
| **Scenario** | The SQLite database (`api/data/mcp_guard.db`) is stored in the application's data directory. If file permissions are misconfigured or another process has write access, the database can be tampered with directly — bypassing the ORM entirely. |
| **Likelihood** | Low (requires local filesystem access) |
| **Impact** | High — tampered database could corrupt audit records, escalate API key privileges, or inject malicious sandbox run records |
| **Existing mitigation** | SQLAlchemy ORM prevents SQL injection through the API; Alembic controls schema changes |
| **Residual risk** | Medium — no file integrity monitoring or database encryption at rest |
| **Next action** | Restrict file permissions (`chmod 600 mcp_guard.db`); consider WAL mode + periodic checksums; add database path to `.gitignore` enforcement |
| **Source files** | `api/app/database.py`, `api/app/config.py:database_url` |

---

### Risk 5: Information Disclosure via Verbose Error Details in Older Code Paths

| Field | Detail |
|-------|--------|
| **Scenario** | Before this PR, `GET /api/status` returned `str(exc)` for MCP probe failures, potentially exposing connection strings, internal hostnames, or protocol error messages to any caller. |
| **Likelihood** | Was: High (any offline MCP triggers it). Now: Mitigated |
| **Impact** | Medium — connection details, internal URLs, or exception class names could aid reconnaissance |
| **Existing mitigation** | **Fixed in this PR**: `_offline()` now returns `"mcp_unavailable"` and logs the real exception server-side only |
| **Residual risk** | Low — fix verified by tests `test_status_offline_returns_stable_error_code` and `test_status_offline_error_code_is_stable_string` |
| **Next action** | Audit any remaining route that calls `str(exc)` in a response body. Enforce with a ruff rule or custom lint check. |
| **Source files** | `api/app/routes/status.py:_offline()`, `api/tests/test_gateway.py` |

---

## Implemented Controls Summary

| Control | Status | Evidence |
|---------|--------|----------|
| CORS allowlist (no wildcard) | Implemented | `main.py`, `test_hardening.py` |
| Security headers (CSP, X-Frame-Options, Referrer-Policy, X-Content-Type-Options) | Implemented | `middleware.py:SecurityHeadersMiddleware` |
| Body size limit (1 MiB) | Implemented | `middleware.py:BodySizeLimitMiddleware` |
| Request ID tracking | Implemented | `middleware.py:RequestContextMiddleware` |
| Tool allowlist | Implemented | `gateway.py:ALLOWED_TOOLS` |
| Path traversal guard | Implemented | `mcp_server.py:_safe()` |
| Argument size guard (128 KiB) | Implemented | `gateway.py:MAX_ARG_BYTES` |
| Tool timeout (5 s) | Implemented | `gateway.py:asyncio.wait_for` |
| Error sanitisation (no stack traces) | Implemented | `errors.py`, `gateway.py` |
| MCP probe error code stability | Implemented | `routes/status.py:_offline()` |
| API docs disabled in production | Implemented | `main.py` |
| Authentication / authorization | Implemented | `api/app/auth/` |
| Rate limiting | Implemented | `api/app/rate_limit.py`, `api/app/auth/throttle.py` |
| Failed-auth throttle | Implemented | `api/app/auth/throttle.py` |
| Trusted-proxy client IP | Implemented | `api/app/middleware.py` (`ClientIPMiddleware`, `TRUSTED_PROXIES`) |
| Audit log persistence | Implemented | `tool.call` success and `mcp.tools_call` are fail-closed. `auth.allow` and `auth.deny` are fail-open. ORM rejects update/delete. The Postgres append-only trigger is installed (revision `cc48301ff61d`). |
| A2A request signing | Not implemented | — |
| Docker sandbox | Not implemented | — |
