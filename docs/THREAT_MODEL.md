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
│  │  • scanner gate (DbScanGate) check                             │   │
│  └──────────────────────┬───────────────────────────────────────┘   │
│                          │                                           │
│  ┌──────────────────────▼───────────────────────────────────────┐   │
│  │ mcp_server.py / FastMCP tools                                  │   │
│  │  • list_notes  • read_note  • write_note                       │   │
│  │  • each call goes to the sandbox runner                        │   │
│  └──────────────────────┬───────────────────────────────────────┘   │
│                          │                                           │
│  ┌──────────────────────▼───────────────────────────────────────┐   │
│  │ SQLite database (aiosqlite)                    api/data/       │   │
│  │ Alembic migrations                             mcp_guard.db   │   │
│  │ (includes tool_scan_findings)                                  │   │
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

[PROPOSED] A2A request signing — not yet implemented
```

### Trust boundaries

| Boundary | Description |
|----------|-------------|
| **Browser ↔ API** | Untrusted HTTP input. CORS allowlist, body size limit, error sanitization applied. |
| **REST routes ↔ gateway** | Internal — routes must call gateway, never tools directly. |
| **Gateway ↔ MCP tools** | Internal — allowlist enforced; tool results normalised. |
| **Gateway ↔ sandbox container** | Each tool call runs in its own container. The gateway speaks to it only through the Docker CLI and one JSON object on stdin. |
| **API ↔ Filesystem** | The notes directory is the only host path mounted into the container. Path checks live in `app/tools/notes.py`. |
| **API ↔ SQLite** | Internal — SQLAlchemy async ORM; no raw SQL from user input in current routes. |
| **API ↔ Express OAuth** | Separate process; no direct code dependency in current API. |
| **API ↔ local model** | Explain sends a whitelisted JSON document to Ollama. Groq is used only when Ollama cannot be reached or times out and `GROQ_API_KEY` is set. |

### Analyst scopes

The route map is in [`api/app/auth/scopes.py`](../api/app/auth/scopes.py). The product scope table is in the README. The analyst adds:

| Scope | Routes |
|---|---|
| `analyst:run` | `GET /api/analyst/status`, `POST /api/analyst/explain`. `admin` satisfies it. |
| `audit:read` | `GET /api/analyst/incidents` and `GET /api/analyst/incidents/{incident_id}`. Explain checks this again in the handler and writes `auth.deny` with `insufficient_scope:audit:read` when it is missing. |

---

## STRIDE Threat Table

### Spoofing

| Threat | Component | Current Mitigation | Evidence | Gap |
|--------|-----------|-------------------|----------|-----|
| Unauthenticated note write | `PUT /api/notes/{name}` | API-key auth and the `notes:write` scope | `api/app/auth/`, `api/app/auth/scopes.py` | Covered. A caller without a valid key gets 401. A key without `notes:write` gets 403. |
| Unauthorized MCP tool call | `/mcp` `tools/call` | `McpToolScopeMiddleware` enforces per-tool scopes via `TOOL_SCOPES` (`notes:read` for `list_notes`/`read_note`, `notes:write` for `write_note`). Unmapped tools fail closed. | `api/app/mcp_tool_scope.py`, `api/app/auth/scopes.py:TOOL_SCOPES` | Covered. A key without the required tool scope gets 403 `FORBIDDEN` with `WWW-Authenticate`. Unmapped tools are denied with 403. |
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
| Tool schema tampering | MCP `tools/list`, REST gateway, `/mcp` `tools/call` | Pinning stores a sha256 of the canonical schema. `enforce` returns 403 `Tool is not approved.` and omits unapproved tools. `warn` audits and continues. Approve and revoke require `admin`. A changed schema is drift. | `api/app/tools/catalog.py`, `api/app/services/pins.py`, `api/app/pins/` | The fingerprint does not cover the function body. `implementation_digest` is not an allow or deny input. A database owner can change `tool_pins`. |
| Tool poisoning | Scanner | `DbScanGate` blocks tools if static scanner rules identify dangerous patterns (e.g., cmd injection). Evaluated at startup and explicitly. | `api/app/scanner/`, `test_scanner.py` | Static rules cannot catch complex LLM-assisted semantic poisoning; LLM-assisted scanner is planned. |

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
| Rate limiting | REST and `/mcp` | Shared per-key token bucket across REST and `/mcp` (in-process, per worker). A per-IP failed-auth throttle (`AUTH_FAILURE_LIMIT` / `AUTH_FAILURE_WINDOW_S`) returns 429 with `Retry-After` | `api/app/rate_limit.py`, `api/app/auth/throttle.py` | Limits are per process. IP-based throttling can lock out clients behind a shared NAT. `X-Forwarded-For` is trusted only from `TRUSTED_PROXIES`. |
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

### Risk 6: Sandbox shares the host kernel

| Field | Detail |
|-------|--------|
| **Scenario** | A tool process escapes the container through a kernel bug, or an operator mounts the Docker socket into some other container. |
| **Likelihood** | Low for a kernel escape. High if the Docker socket is mounted into a container: that mount is root-equivalent on the host. |
| **Impact** | High — code running as root on the host can read notes, the database, and API key hashes |
| **Existing mitigation** | The runner container drops all capabilities, disallows privilege escalation, uses a non-root user, has no network, and does not receive the Docker socket. `SANDBOX_NETWORK=host` is rejected. Production rejects `SANDBOX_MODE=inprocess` and a `SANDBOX_RUN_AS` uid that starts with 0. |
| **Residual risk** | The container shares the host kernel, so a kernel vulnerability is not contained. Mounting the Docker socket into a container is root-equivalent, so Block 11 should talk to Docker through a socket proxy rather than the raw socket. `SANDBOX_MODE=inprocess` has no isolation: the tool runs in the API process. |
| **Next action** | Keep the API off the raw Docker socket when it moves into Compose. Leave `inprocess` for development and tests only. |
| **Source files** | `api/app/sandbox/docker.py`, `api/app/config.py`, `api/sandbox/Dockerfile` |

---

### Risk 7: Guard rules could stall the server

| Field | Detail |
|-------|--------|
| **Scenario** | Several injection-guard patterns backtracked. `check_tool_output()` ran on the event loop, so one slow tool output made every request wait, including `/health`. A REST read was also scanned twice, because `asyncio.wait_for` copies the context and the "already guarded" flag set inside the tool task did not reach the gateway. |
| **Likelihood** | Was: High for any caller who could put a few thousand crafted characters in a note or call `POST /api/guard/check`. Now: Mitigated |
| **Impact** | High — the API process stopped answering while one core ran the scan |
| **Existing mitigation** | **Fixed in A11.** The slow rules use bounded windows or one forward pass per line or per URL. `run_tool`, the gateway fallback, and `POST /api/guard/check` evaluate the guard on a worker thread. Audit rows are still written on the event loop. The guarded flag is a mutable object shared with the tool task, so a REST output is logged once. A tool that does not go through `run_tool` is still scanned. |
| **Residual risk** | Low — a 1 MiB tool output is still scanned, and the notes agent still runs the sync guard on output that `/mcp/` already scanned. Measured on this machine before the change, guard mode `warn`: reading a 7,000-character note (`curl http://a ` repeated) took 18.215 s and `/health` during that read took 17.207 s. The same text on `POST /api/guard/check` took 9.117 s and `/health` took 8.112 s. `print ` repeated to 18,000 characters took 1.351 s (`/health` 0.346 s). `<!-- ` repeated to 100,000 characters took 20.925 s (`/health` 19.920 s). One injected note read wrote two identical `tool.output.injection` rows. After the change: the 7,000-character read took 0.010 s and `/health` 0.002 s; the same guard check took 0.009 s and `/health` 0.002 s; the print check took 0.054 s and `/health` 0.002 s; the comment check took 0.027 s and `/health` 0.002 s. A 100,000-character `print ` note read took 0.239 s, and `/health` started with that read took 0.001 s. `scan_text` on 100,000 characters was 0.042 s (`curl http://a `), 0.245 s (`print `), 0.016 s (`<!-- `), 0.069 s (`![ `), 0.038 s (`http://a?`), 0.034 s (`curl -X `), and 0.362 s (`echo `). Each 100,000-character time was about twice the 50,000-character time. The same REST read then wrote one row, and `tools/call` `read_note` wrote one row. |
| **Next action** | Keep new rules on a bounded window or a forward-only scan. The notes agent still re-checks `/mcp/` output on the calling task. |
| **Source files** | `api/app/guard/rules.py`, `api/app/guard/engine.py`, `api/app/sandbox/executor.py`, `api/app/sandbox/context.py`, `api/app/gateway.py` |

---

## Hostile Lab Test Fixtures & Attack Demonstrations

The hostile lab upstream ([`docs/UPSTREAM_LAB.md`](UPSTREAM_LAB.md)) serves as a real-world, executable test fixture to evaluate how the gateway contains and defends against malicious or compromised upstream tools. The table below maps threat categories to concrete hostile lab fixtures, the gateway defense layers, and the corresponding D1–D6 attack checks.

> [!NOTE]
> The gateway does not claim complete protection against all possible attacks. While structural and rule-based defenses block known patterns and container isolation contains probe actions, novel semantic attacks (such as paraphrased natural language exfiltration) demonstrate intentional coverage gaps in static rules.

### 1. Tool Poisoning

- **Threat**: An upstream tool embeds adversarial instructions (prompt injection, exfiltration triggers, or homoglyph obfuscation) in its descriptions, schemas, or parameter annotations to hijack the calling model's execution context.
- **Hostile Lab Fixtures**:
  - `lab_add_numbers`: Prompt injection targeting SSH private key exfiltration.
  - `lab_convert_units`: Cyrillic homoglyph injection.
  - `lab_format_date`: Full-width Unicode character obfuscation.
  - `lab_currency_rate`: Base64-encoded exfiltration instructions.
  - `lab_lookup_city`: Prompt injection in parameter schema (`hint`).
  - `lab_translate_text`: Paraphrased data-copy instruction (*known static-scanner gap*).
- **Defense Layer**:
  - Static Scanner (`DbScanGate` / rules R1, R2, R4, R5) identifies malicious patterns during startup and schema evaluation.
  - Tool Pinning Gate in `enforce` mode denies execution with HTTP 403 `pin_scan_blocked` (`tool.pin.deny`), even if an administrator approves the pin hash.
  - *Distinction*: `lab_add_numbers`, `lab_convert_units`, `lab_format_date`, and `lab_currency_rate` are **blocked attacks**. In contrast, `lab_translate_text` successfully executes because its paraphrased phrasing avoids static triggers, representing a deliberate **static-scanner gap** reserved for future AI-assisted evaluation (P9).
- **Demonstration**: See [UPSTREAM_LAB.md#d1-startup-scanner--tool-pinning](UPSTREAM_LAB.md#d1-startup-scanner--tool-pinning) (Check D1).

### 2. Contract Rug Pull / Schema Drift

- **Threat**: A previously approved upstream tool alters its input parameters, descriptions, or behavior post-deployment (e.g., adding a poisoned argument to an existing benign tool, or introducing unmapped/shadow tools).
- **Hostile Lab Fixtures**:
  - `lab_utc_time` (v1 -> v2): Benign no-arg tool in v1 is modified in v2 to add a poisoned `trace` argument instructing the model to exfiltrate user chat history.
  - `lab_reverse_text` (v1 -> v2): Removed in v2.
  - `lab_sync_contacts` (v2 only): Unmapped tool with exfiltration-style description added in v2.
- **Defense Layer**:
  - Dynamic Pre-Call Check: The runner compares live tool schemas with the startup baseline; mismatches immediately reject the call with `tool.pin.drift` (`reason: upstream_contract_changed`).
  - Schema Pinning: Restarting against v2 detects pin fingerprint mismatch, rejecting invocations with `tool.pin.drift` (`reason: pin_drift`).
  - Scan Gate on Re-Approval: Even if the new v2 hash is approved by an administrator, the scan gate re-evaluates the schema, catches the poisoned `trace` parameter, and blocks execution with `pin_scan_blocked`.
  - Fail-Closed Scope Authorization: New tools (`lab_sync_contacts`) without explicit scope mappings are rejected with HTTP 403 `auth.deny` (`reason: unmapped_tool`).
- **Demonstration**: See [UPSTREAM_LAB.md#d6-real-v1-to-v2-contract-drift--rug-pull](UPSTREAM_LAB.md#d6-real-v1-to-v2-contract-drift--rug-pull) (Check D6).

### 3. Tool Output Injection

- **Threat**: A compromised upstream tool returns responses crafted to manipulate the client or model, including direct instruction overrides, role-spoofing markers, leaked credentials, encoded commands, or delimiter escaping.
- **Hostile Lab Fixtures**:
  - `lab_fetch_tip` with variations `override`, `role`, `secret`, `encoded`, `image_link`, `delimiters`, `structured`, and `error`.
- **Defense Layer**:
  - Output Injection Guard (`api/app/guard/rules.py` / G1–G6) scans tool stdout content before returning it to the caller.
  - In `enforce` mode, high-severity violations are blocked and replaced with `[BLOCKED: Tool output blocked by injection guard (rule Gx)]`, medium-severity delimiters are sanitized, and detailed `tool.output.injection` audit records are logged (capturing `key_prefix`, `client_id`, and `api_key_id`).
- **Demonstration**: See [UPSTREAM_LAB.md#d3-output-injection-variations](UPSTREAM_LAB.md#d3-output-injection-variations) (Check D3).

### 4. Resource Abuse (Flooding & Hanging)

- **Threat**: A rogue or misconfigured tool floods the gateway with megabytes of output to cause memory exhaustion, or hangs indefinitely to tie up worker threads and connection pools.
- **Hostile Lab Fixtures**:
  - `lab_flood`: Generates up to 4 MiB of text.
  - `lab_hang`: Infinite loop (`while True: sleep(1)`).
  - `lab_slow`: Sleep delays up to 60 seconds.
- **Defense Layer**:
  - Output Size Cap: Runner stdout buffer enforces `SANDBOX_MAX_OUTPUT_BYTES` (1 MB); outputs exceeding the limit abort execution with `isError: true`, message `"The lab tool output is too large."`, and record `error_type: output_too_large` in `sandbox_runs`.
  - Process Timeout: Upstream container budget is bounded by `UPSTREAM_LAB_TIMEOUT_S` (default: 10s); exceeding runs are terminated with `SIGKILL` and recorded with `error_type: timeout`.
  - Automatic Container Cleanup: All ephemeral containers are killed and pruned (`--rm`), preventing orphaned processes.
- **Demonstration**: See [UPSTREAM_LAB.md#d4-resource-caps-execution-budgets--timeouts](UPSTREAM_LAB.md#d4-resource-caps-execution-budgets--timeouts) (Check D4).

### 5. Container Escape / Host Access Attempts

- **Threat**: Malicious code inside an upstream container attempts to read host credentials, access internal networks, tamper with the root filesystem, communicate with the Docker daemon, or traverse parent directories.
- **Hostile Lab Fixtures**:
  - `lab_probe_host` targets: `shadow` (host user database), `proc_environ` (host secrets), `docker_socket` (daemon takeover), `write_root` (root filesystem tampering), `network` (external egress beacon), and `parent_dirs` (path traversal).
  - Chained path traversal probe via `fs_read_text_file` (`/projects/../../etc/passwd`).
- **Defense Layer**:
  - Docker Sandbox Isolation: Runs with `--read-only` root, `--network none` (no egress), `--cap-drop ALL`, non-root user execution (`UID 65534:65534`), `--security-opt no-new-privileges:true`, and zero host socket mounts.
  - Path Confinement: Filesystem upstream enforces `/projects` canonical boundaries and rejects traversal sequences (`..`).
  - *Distinction*: These are **contained probes** rather than application-layer blocked requests; the container process executes, but the underlying Linux kernel and container runtime enforce boundary denial (e.g., `Permission denied`, `Network is unreachable`, `Read-only file system`).
- **Demonstration**: See [UPSTREAM_LAB.md#d5-container-escape-and-host-boundary-probes](UPSTREAM_LAB.md#d5-container-escape-and-host-boundary-probes) (Check D5).

---

## AI analyst

The analyst explains incidents. It does not block, revoke, or approve. Severity and grouping are code in `app/analyst/`. Details are in [AI_ANALYST.md](AI_ANALYST.md).

| Threat | Control |
|---|---|
| Injection through event fields (tool names, reasons, scanner evidence, a hostile `X-Request-ID`) | The prompt is a field whitelist. `request_id` is not sent. `safe_reason` redacts secrets. The scan view runs `normalize_for_scan`, then turns `_ . : -` into spaces, then `scan_text`. A match is replaced with a withheld marker. The JSON sits inside a random nonce fence. The reply guard rejects high and critical findings, `mcpg_`, and URLs. A failed reply is not stored or shown. |
| The model invents events, causes, or a severity | Severity is `incident_severity` before the call. The system text says not to invent and not to change severity. `parse_report` requires one JSON object. Every timeline line must cite a ref that was sent. Any other ref is `unknown_ref`. There is no second prompt. |
| Incident facts leave the machine | Ollama is local. The document has action names, status codes, reasons, tool names, and key prefixes. It does not have client IPs, client ids, key ids, argument hashes, request ids, or real event ids. Groq receives that same document only as the connection or timeout fallback. |
| Cost and denial of service | Explain has its own token bucket (`ANALYST_RATE_LIMIT_CAPACITY`, `ANALYST_RATE_LIMIT_PER_MINUTE`) and an in-process counter (`ANALYST_MAX_CONCURRENCY`, default 1). A full counter returns 503 `ANALYST_BUSY` and does not queue. Output length, rows read, and events per prompt are capped. |
| The analyst feeds itself | Grouping skips `guard.check` and every action that starts with `analyst.`. `analyst.explain` is recorded as allowed, so it is not a security event. Retention uses `analyst_reports.retention`, also allowed. |

## Implemented Controls Summary

| Control | Status | Evidence |
|---------|--------|----------|
| CORS allowlist (no wildcard) | Implemented | `main.py`, `test_hardening.py` |
| Security headers (CSP, X-Frame-Options, Referrer-Policy, X-Content-Type-Options) | Implemented | `middleware.py:SecurityHeadersMiddleware` |
| Body size limit (1 MiB) | Implemented | `middleware.py:BodySizeLimitMiddleware` |
| Request ID tracking | Implemented | `middleware.py:RequestContextMiddleware` |
| Tool allowlist | Implemented | `gateway.py:ALLOWED_TOOLS` |
| Tool schema pinning | Implemented | `TOOL_PINNING_MODE` `off` / `warn` / `enforce`. Enforce denies with 403 `Tool is not approved.` Approval is an `admin` action with a required `tool.pin.approve` audit row. `NullScanGate` does not block. |
| Path traversal guard | Implemented | `app/tools/notes.py` (`validate_note_name`, `resolve_note_path`); `mcp_server.py:_safe()` delegates to it |
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
| Docker sandbox | Implemented | `docker run --rm --pull never --network none --read-only --cap-drop ALL --security-opt no-new-privileges --pids-limit --memory --memory-swap --cpus --user`, tmpfs `/tmp`, no docker socket, no extra mounts, no env file. A daemon or image failure is HTTP 503 and is not retried in-process. |
| AI incident analyst | Implemented | Grouping and severity are code. Explain needs `analyst:run` and `audit:read`. Replies that fail the checks are not stored. See [AI_ANALYST.md](AI_ANALYST.md). |
