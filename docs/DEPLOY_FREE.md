# Free deploy: Vercel, Render, Neon, Upstash

This guide puts MCP Guard online without a credit card. It is a demo setup,
not a replacement for the Docker Compose stack.

| Part | Where | Free plan |
| --- | --- | --- |
| Landing page and console (`frontend/`) | Vercel | Hobby |
| API (`api/`, FastAPI) | Render web service `mcp-guard-api` | Free |
| Login server (`backend/`) | Render web service `mcp-guard-login` | Free |
| Postgres | Neon | Free |
| Redis | Upstash | Free (optional) |
| LLM | Groq | Free key |

The browser only talks to the Vercel site. `frontend/vercel.json` forwards
`/api/*`, `/mcp`, `/health` and `/ready` to the API and `/api/auth/*` to the
login server, so everything stays on one origin.

## What works and what does not

Works: landing page, sign up and sign in (email and password), console,
API keys, audit log and live audit, tool pinning, the rule scanner, the AI
scanner, Guard Events, the analyst and LLM calls through Groq.

Does not work on this setup:

- Tool calls, by default. Render has no Docker daemon, so every sandboxed call
  to `list_notes`, `read_note` and `write_note` fails closed with "Sandbox
  unavailable". Production refuses `SANDBOX_MODE=inprocess` unless you also set
  `SANDBOX_ALLOW_INPROCESS_IN_PRODUCTION=true`. See "Tools without Docker"
  below before you turn that on.
- The 16 `fs_*` filesystem tools. They need Docker, so `UPSTREAM_FS_ENABLED`
  is off.
- The notes agent, A2A tasks and Attack Simulator steps that run a tool.
- Ollama. Groq is the model. Each LLM call first tries Ollama, fails at once,
  and falls back to Groq, so the LLM calls page shows one Ollama error row per
  call.

Limits of the free plans:

- Render free services sleep after about 15 minutes idle. The first request
  after that takes up to a minute. Open `/health` before a demo.
- Vercel stops a forwarded request after 120 seconds. "Scan all" with AI and
  long agent runs can hit that. Scan one tool at a time.
- Login server accounts live in memory and reset when it sleeps or restarts.
- Notes on the API disk reset on every restart.

## 1. Neon (Postgres)

1. Sign up at https://neon.tech with GitHub. No card is needed.
2. Create a project. Region: **AWS Asia Pacific (Singapore)**. Postgres 16 or newer.
3. Open **Connect**. Turn **Connection pooling off** so you get the direct
   host (no `-pooler` in the name). The API holds a session advisory lock and
   uses prepared statements, which the pooled endpoint breaks.
4. Copy the connection string and change the end:
   - Neon gives `postgresql://USER:PASSWORD@HOST/neondb?sslmode=require&channel_binding=require`
   - Use `postgresql+asyncpg://USER:PASSWORD@HOST/neondb?ssl=require`

   asyncpg does not accept `sslmode` or `channel_binding`, and the API fails
   to start with them.

## 2. Upstash (Redis, optional)

One API instance does not need Redis. Skip this step to keep things simple,
or add it so rate limits survive restarts.

1. Sign up at https://upstash.com with GitHub.
2. Create a Redis database. Region: **AWS ap-southeast-1 (Singapore)**. TLS on.
3. Copy the `rediss://default:PASSWORD@HOST:6379` URL. It must start with
   `rediss://`.

## 3. Render (API and login server)

1. Push the `deploy/free-tier` branch and merge it, or point Render at the branch.
2. Sign up at https://render.com with GitHub. No card is needed for free services.
3. Click **New**, then **Blueprint**, pick this repository, and confirm the
   branch. Render reads `render.yaml` and shows two services.
4. Fill the values it asks for:

   | Variable | Value |
   | --- | --- |
   | `DATABASE_URL` | The Neon string from step 1 |
   | `REDIS_URL` | The Upstash string, or leave blank |
   | `CORS_ORIGINS` | `["https://YOUR-SITE.vercel.app"]` |
   | `MCP_ALLOWED_HOSTS` | `["mcp-guard-api.onrender.com"]` (your API host) |
   | `MCP_ALLOWED_ORIGINS` | `["https://YOUR-SITE.vercel.app"]` |
   | `GROQ_API_KEY` | A new key from https://console.groq.com/keys |
   | `GOOGLE_CLIENT_ID` | Your Google OAuth client ID, or leave blank |

   If you do not know the Vercel address yet, enter a guess such as
   `https://mcp-guard.vercel.app` and fix it after step 4.
5. Click **Apply**. The first API build takes several minutes. The API runs
   database migrations on every start, then serves on port 8000.
6. Note both service URLs. If Render added a suffix, for example
   `mcp-guard-api-ab12.onrender.com`, use that exact host everywhere below.
7. Check `https://YOUR-API.onrender.com/health` returns `{"status":"ok"...}`.

Render generates `API_KEY_PEPPER`, `A2A_SIGNING_KEY` and `JWT_SECRET`. Never
change the pepper after you create keys, or every key stops working.

## 4. Vercel (landing page and console)

1. If the Render URLs differ from `mcp-guard-api.onrender.com` and
   `mcp-guard-login.onrender.com`, replace them in `frontend/vercel.json`,
   commit and push.
2. Sign up at https://vercel.com with GitHub.
3. **Add New**, **Project**, import this repository.
4. **Root Directory**: `frontend`. Vercel reads `frontend/vercel.json` for the
   build (`npm run build`, output `dist`).
5. Environment variables:

   | Variable | Value |
   | --- | --- |
   | `VITE_API_BASE_URL` | `https://YOUR-SITE.vercel.app` |
   | `VITE_API_URL` | `/api` |

6. **Deploy**. Then update `CORS_ORIGINS` and `MCP_ALLOWED_ORIGINS` on the
   Render API to the real Vercel address if it changed. Render redeploys on save.

## 5. Admin key and tool approval

Render's free plan has no shell, so run the two scripts from your laptop
against Neon. Copy `API_KEY_PEPPER` from the Render API's **Environment** tab.
Run from a folder with no `.env` file so local settings do not leak in
(zsh, from the repo root):

```
REPO=$(pwd)
cd /tmp
read -s "DB?Neon DATABASE_URL: " && echo
read -s "PEP?API_KEY_PEPPER from Render: " && echo
export ENVIRONMENT=production DATABASE_URL="$DB" API_KEY_PEPPER="$PEP" UPSTREAM_FS_ENABLED=false
uv run --project "$REPO/api" python "$REPO/api/scripts/create_admin_key.py"
uv run --project "$REPO/api" python "$REPO/api/scripts/approve_current_tools.py"
unset DB PEP DATABASE_URL API_KEY_PEPPER ENVIRONMENT UPSTREAM_FS_ENABLED
cd "$REPO"
```

The admin key prints once. Store it in a password manager. The API must have
started once before this, so the tables exist.

## 5a. Keys the API uses for itself

Three features call the API's own `/mcp/` endpoint with a key from the
environment. Each one is off until its key is set, and each should be a
separate key, so the audit log shows which part made a call and you can revoke
one without breaking the others. Create them in the console under **API
Keys** (the raw key shows once), then paste each into the Render API's
**Environment** tab. Give each key an expiry.

| Variable | Used by | Scopes | Without it |
| --- | --- | --- | --- |
| `MCP_SELF_API_KEY` | Status probe (`/api/status`) | `agent:run` | Status shows MCP offline, and every probe writes an `auth.deny` 401 `missing` row that counts toward the failed-auth limit |
| `NOTES_AGENT_API_KEY` | Notes agent (`POST /api/agents/notes/run`) | `agent:run`, `notes:read`, plus `notes:write` if the agent may write | 503 "Notes agent is not configured." |
| `WORKER_NOTES_API_KEY` | A2A worker (`POST /api/a2a/tasks/run`) | `agent:run`, `notes:read`, plus `notes:write` only if managers should be able to delegate writes. Never `admin` | 503 "A2A worker is not configured. Set WORKER_NOTES_API_KEY." |

The notes agent and the A2A worker also need working tool calls, so they still
fail until the sandbox can run (next section). `LLM_ENABLED=true` and
`GROQ_API_KEY` are already part of the Blueprint.

### Tools without Docker

`SANDBOX_MODE=inprocess` with `SANDBOX_ALLOW_INPROCESS_IN_PRODUCTION=true`
runs the three notes tools in a worker thread inside the API process. The
tool time limit, note size limit, note name checks, scopes, pinning and the
injection guard still apply. What you lose is the container: no separate
filesystem, no memory or process limit, and no network cut-off for the tool. The Sandbox page
shows the mode as `inprocess`, so the live site does not claim container
isolation it does not have. Notes are written to the API disk and reset on
every restart.

## 6. Open it

- Landing page: `https://YOUR-SITE.vercel.app`
- Console: `https://YOUR-SITE.vercel.app/console`. Paste the admin key.
- MCP clients: `https://YOUR-SITE.vercel.app/mcp/` with `Authorization: Bearer <key>`.

## Troubleshooting

- API does not start, log mentions `sslmode`: fix the Neon URL (step 1).
- `/mcp` returns 421 `Invalid Host header`: `MCP_ALLOWED_HOSTS` does not match
  the Render host.
- `/mcp` returns 403 `Invalid Origin header`: `MCP_ALLOWED_ORIGINS` does not
  match the Vercel origin.
- Console says it cannot reach the API: the Render service is waking up. Wait
  a minute and retry.
- A long request fails after two minutes: the Vercel forward limit. As a
  fallback, set the console's backend URL to the Render API URL directly;
  `CORS_ORIGINS` and the site's CSP already allow it.
