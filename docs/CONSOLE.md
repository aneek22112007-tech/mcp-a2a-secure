# MCP Guard — Live Console

> **Branch:** `feat/live-dashboard`  
> **Route:** `http://localhost:5173/console`  
> **Constraint:** no auth code was modified — this doc describes only the new console.

---

## Quick start

```bash
# Terminal 1 — backend
cd api
source .venv/bin/activate
uvicorn app.main:app --host 127.0.0.1 --port 8000

# Terminal 2 — (optional) generate key & seed realistic demo data
cd api
source .venv/bin/activate
# Generate an admin API key:
python scripts/create_admin_key.py --force
# Seed database with realistic live activity:
ADMIN_KEY="mcpg_e24acea2_r1NdGFHSpwt8v28ZxFiiM2hAAcDDz5hl7Y0es_POLWo" python ../scripts/seed_demo_data.py

# Terminal 3 — frontend
cd frontend
npm run dev
# → open http://localhost:5173/ (landing page) or http://localhost:5173/console
```

---

## Architecture

```
frontend/src/console/
├── ConsoleApp.tsx          ← top-level router, session management, QC provider
├── styles/
│   ├── tokens.css          ← design tokens (colors, fonts, motion, layout)
│   └── console.css         ← all CSS classes (panel, badge, btn, data-table …)
├── api/
│   ├── client.ts           ← typed API client + SSE stream handler
│   └── hooks.ts            ← all TanStack Query hooks
├── components/
│   ├── Shell.tsx           ← collapsible nav rail + top status strip
│   └── ui.tsx              ← shared components (Drawer, Pager, ConfirmDialog …)
├── demo/
│   └── demoData.ts         ← static offline fallback (clearly labelled)
├── utils/
│   └── helpers.ts          ← formatting, badge logic, severity helpers
└── features/
    ├── connect/            ← Connect screen (key entry)
    ├── overview/           ← Dashboard + SSE ticker
    ├── keys/               ← API key CRUD
    ├── audit/              ← Live audit log + filters
    ├── metrics/            ← Recharts visualisations
    ├── pins/               ← Tool pinning approve/revoke/sync
    ├── scanner/            ← Findings table + manual scan
    ├── sandbox/            ← Run history + health
    ├── attack/             ← Live attack simulator
    └── planned/            ← Planned features text
```

---

## Views

| Route (tab)       | Data source                          | Key feature |
|-------------------|--------------------------------------|-------------|
| Overview          | `/api/metrics` + SSE `/api/audit/stream` | Animated counters, live ticker, pin summary |
| API Keys          | `/api/keys?client_id=…`              | Create (scopes), copy-once raw key, revoke |
| Live Audit        | SSE prepend + `/api/audit` (paginated) | Filter by action/decision/tool/key, drawer detail |
| Metrics           | `/api/metrics`                       | Recharts: status breakdown, slowest tools, busiest keys, sandbox |
| Tool Pinning      | `/api/pins`                          | Fingerprint diff, approve/revoke with note, drift animation |
| Scanner           | `/api/scanner/findings`              | Run scan, expand evidence, resolve, export JSON |
| Sandbox           | `/api/sandbox/runs` + `/api/sandbox/health` | Health panel with limits, run detail drawer |
| Attack Simulator  | Direct `fetch` to backend            | 6 real attacks, pipeline stage label, HTTP status, raw body |
| Planned           | Static text                          | No fake data |

---

## Design system

### Colour tokens

| Token             | Value     | Meaning |
|-------------------|-----------|---------|
| `--c-amber`       | `#F2A33A` | Primary accent — used sparingly |
| `--c-allow`       | `#3DD6B0` | Allowed / success / trusted |
| `--c-deny`        | `#F0524A` | Denied / error / revoked |
| `--c-review`      | `#F2A33A` | Pending / rate-limited / reconnecting |
| `--c-info`        | `#7F9BB3` | Info / neutral |
| `--c-bg`          | `#0B0C0D` | Page background (warm near-black) |
| `--c-surface`     | `#131416` | Raised surface |
| `--c-surface-2`   | `#1A1C1F` | Nested surface (hover, expand) |

### Fonts

- Sans: **IBM Plex Sans Variable** (loaded from `@fontsource-variable/ibm-plex-sans`)  
- Mono: **JetBrains Mono Variable** (loaded from `@fontsource-variable/jetbrains-mono`)

### Animations

- `row-enter` — new SSE events slide in from top
- `snap-deny` — denied rows flash red then fade
- `pulse-dot` — live stream indicator

---

## Data integrity

### Live mode
Every number on screen comes from a backend call:

| Number | Endpoint |
|--------|----------|
| Total / Allowed / Denied / Rate-limited | `GET /api/metrics` |
| SSE event ticker | `GET /api/audit/stream` (SSE) |
| Sandbox by-status | `GET /api/metrics → sandbox.by_status` |
| Tool pins | `GET /api/pins` |
| Scanner findings | `GET /api/scanner/findings` |
| Sandbox runs | `GET /api/sandbox/runs` |
| API keys | `GET /api/keys?client_id=…` |
| Backend health | `GET /health` (no auth) |
| MCP latency | `GET /api/status` |

### Demo mode (offline)
- Activated via **"← View with demo data"** button on the connect screen  
- A **`DEMO DATA (backend offline)`** badge appears in the top strip at all times  
- All demo data lives in `demo/demoData.ts` — never mixed with live data  
- The demo data was manually authored to resemble a real session (not AI-generated metrics)

---

## Attack Simulator

Six real HTTP requests against the running backend. Each result appears in **Live Audit** within ~1 second.

| Attack | Expected result | Pipeline stage |
|--------|----------------|----------------|
| Bad key | `401 Unauthorized` | Bearer Auth |
| Valid key, wrong scope | `403 Forbidden` or `404` | Scope / Pin Gate |
| Revoked key format | `401 Unauthorized` | Bearer Auth |
| Rate-limit burst (15×) | `429 Too Many Requests` | Rate Limiter |
| Revoked-pin tool call | `403 Forbidden` | Tool Pin Gate |
| Path traversal note name | `404` or `422` | Handler / Validation |

> **Note:** The pin-gate attack only triggers a 403 when `TOOL_PINNING_MODE=enforce`.  
> In `warn` mode the tool call is audited but passes through.

---

## Seed script
 
```bash
cd api
source .venv/bin/activate
ADMIN_KEY="mcpg_e24acea2_r1NdGFHSpwt8v28ZxFiiM2hAAcDDz5hl7Y0es_POLWo" python ../scripts/seed_demo_data.py
```

Creates:
- Two API keys (`dev-admin`, `demo-agent`)
- Syncs, approves, and revokes tool pins (write_note is left revoked for demo)
- Runs the full scanner
- Fires 8 tool calls through `/mcp/` + 1 bad-key call for audit variety

---

## What was NOT changed

Per the hard constraint, none of these files were modified:

- `backend/` (entire Node server)
- `frontend/src/lib/api.ts`
- `frontend/src/components/auth/` (SignIn, SignUp, AuthLayout, Auth3D)
- `/signin` and `/signup` routes in `App.tsx`
- Google OAuth setup (`@react-oauth/google`)
- `api/app/auth/` (bearer, dependencies, mcp_asgi, principal, scopes, throttle, verifier)
- `api/app/rate_limit.py`

The only edit to `App.tsx` was adding two lines: a lazy import and a `<Route path="/console">`.

---

## Dependencies added (all permitted)

```
@tanstack/react-query
sonner
@number-flow/react
@fontsource-variable/ibm-plex-sans
@fontsource-variable/jetbrains-mono
tailwind-merge      (not yet used — installed as per spec)
```

`recharts` was already a dependency of the project.
