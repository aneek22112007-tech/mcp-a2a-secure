# Load balancing

Compose runs two API replicas behind Caddy. Valkey holds the shared per-key rate limit and relays audit events and pin-cache clears. Postgres is the database. A one-shot `migrate` service applies Alembic before either replica serves traffic.

```
browser or client
        |
        |  127.0.0.1:8000
        v
     proxy (Caddy, 172.30.57.10:8080)
        |-- /mcp and /mcp/*     sticky on Authorization, else least connections
        |-- /api/*, /health, /ready    least connections
        |-- everything else     files from /srv
        |
        +--> api1 (INSTANCE_ID=api1)
        +--> api2 (INSTANCE_ID=api2)
                |            |
                v            v
            postgres       valkey
                ^
                |
             migrate (alembic upgrade head, once)
```

Only `127.0.0.1:8000` is published. Postgres and Valkey have no host ports. The proxy address `172.30.57.10/32` is the only value in `TRUSTED_PROXIES`.

## Why Caddy

`deploy/Caddyfile` is the whole proxy config.

- Active health checks call `GET /ready` every 5 seconds. `health_fails 2` marks a replica down after two failed probes. `fail_duration 10s` is how long one failed request counts for the passive check.
- `/mcp` uses `lb_policy header Authorization` so one API key stays on one replica. If the header is missing, Caddy uses least connections.
- `/api/*`, `/health`, and `/ready` use least connections. Those routes do not keep an MCP session.
- `lb_try_duration 5s` lets Caddy try another replica when the selected one cannot be reached. A failed dial is retried for any method. If the connection succeeded and the round-trip then failed, the default is to retry only GET. This file does not set `lb_retry_match`. The [Caddy reverse_proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy) page states that default.
- Each replica runs uvicorn with `--limit-concurrency 256` and answers 503 above it. Caddy caps its own connections to each replica with `max_conns_per_host`: 160 for the `/api` pool and 64 for the `/mcp` pool, 224 per replica in total, which leaves room for `/ready` probes. Past the cap Caddy queues the request instead of opening another connection. Before the cap, a 200-connection `/health` burst through the proxy got 533 responses of 503 out of 158,792. The uvicorn limit was not raised.
- The site is the built frontend. Hashed files under `/assets/*` are cached as immutable. HTML is `Cache-Control: no-cache`.

Client IP is not taken from Caddy's own forwarded-header parser. The entrypoint starts uvicorn with `--no-proxy-headers`. `ClientIPMiddleware` walks `X-Forwarded-For` from right to left and trusts only `TRUSTED_PROXIES`. A client that sends that header from outside the proxy does not get to pick its address.

## Why Valkey

The shared state is a token bucket, a pub/sub fanout, and a pin-cache bump. It is not a second database. Compose runs `valkey/valkey:8-alpine` with no persistence (`--appendonly no`), a 64 MB cap, and `noeviction`. The password comes from `REDIS_PASSWORD` in the root `.env`. The URL is passed to the replicas as `REDIS_URL` and is not printed.

If Valkey is down, the API keeps serving. `/ready` stays HTTP 200 with `shared_state` set to `unavailable` as long as Postgres answers `SELECT 1`. Each replica then uses its own in-memory bucket, and shared-state failures are logged as the exception type at most once a minute per replica.

`MULTI_INSTANCE=true` refuses to start when `DATABASE_URL` is SQLite or `REDIS_URL` is unset. The error is `MULTI_INSTANCE requires a Postgres DATABASE_URL and REDIS_URL`.

## What is shared

- One token bucket per API key, surface name `key`. REST and `/mcp` take tokens from that bucket when Valkey is up. The defaults are 30 tokens and a refill of 5 per second. A denial is HTTP 429 with `Retry-After`. The process-local bucket is not also charged on that denial.
- A second Valkey bucket, surface `analyst`, for `POST /api/analyst/explain` only. It does not spend the REST bucket. Its own capacity is `ANALYST_RATE_LIMIT_CAPACITY`.
- Audit stream events, channel `mcpg:audit`, when the publishing replica's relay is connected. A subscriber on the other replica then sees the event.
- Pin-cache clears, channel `mcpg:pins`. Approve and revoke publish a clear. `clear_pin_cache` itself does not publish.

## What stays on one replica

- MCP sessions. FastMCP keeps the session in the process that handled `initialize`. Stickiness is what makes the next call with the same `Authorization` header hit that process. After that process stops, the old `Mcp-Session-Id` is 404 `Session not found`. A new `initialize` works on the replica that is still up.
- The failed-login throttle. `AUTH_FAILURE_LIMIT` is 20 failures per IP per 60 seconds, stored in that process. Two replicas can each allow 20 before either returns 429. Restarting a replica clears only that replica's counter.
- The pin cache TTL (default 5 seconds) until a clear arrives or the TTL expires.
- The sandbox concurrency budget. Compose sets `SANDBOX_MAX_CONCURRENT` to 3, so two replicas can run 6 note sandbox containers at once. A full budget on one replica does not borrow from the other.
- The analyst concurrency cap (`ANALYST_MAX_CONCURRENCY`, default 1) and the in-memory bucket used only while Valkey is unavailable.
- Startup jobs and retention locks are coordinated, but the work still runs inside one process. See below.

## Postgres

Compose sets `DATABASE_URL` to `postgresql+asyncpg://...@postgres:5432/...`. That value is not `${DATABASE_URL:-...}`, so a `DATABASE_URL` in the shell that started Compose does not replace it.

`migrate` runs `alembic upgrade head` once, then exits. Its healthcheck is disabled and it does not restart. Both API replicas set `RUN_MIGRATIONS=false`, so the entrypoint does not run Alembic again.

Each replica's pool defaults to `DB_POOL_SIZE` 5 plus `DB_MAX_OVERFLOW` 5. Two replicas can open 20 connections. Postgres `max_connections` stays at the image default of 100. Keep `replicas × (DB_POOL_SIZE + DB_MAX_OVERFLOW)` under that limit, with room for `migrate` and an operator `psql`. `/ready` waits at most `READY_DB_TIMEOUT_S` (default 2 seconds) for `SELECT 1`.

A production-like process refuses a placeholder `API_KEY_PEPPER`. The error is `API_KEY_PEPPER is a placeholder; set a long random value`. The value is not included.

Startup jobs take Postgres advisory lock `727001` and hold the connection until that process exits. One replica logs `running startup jobs`. The other logs `startup jobs ran on another instance`. Stopping the replica that holds the lock releases it. The surviving replica does not run the jobs until it starts again.

Retention takes transaction lock `727002`. The replica that does not get it skips the cycle and does not log a skip.

## Adding a third replica

1. Copy the `api2` service to `api3` and set `INSTANCE_ID` to `api3`.
2. Add `api3:8000` to both `reverse_proxy` lists in `deploy/Caddyfile`.
3. Add `api3` to the proxy `depends_on` list with `condition: service_healthy`.
4. Check the connection budget. Three replicas at the compose pool settings open 30 Postgres connections.
5. `docker compose up -d api3 proxy`.

Do not raise `RATE_LIMIT_CAPACITY` or lower a timeout to make the extra replica look faster. The shared bucket does not grow when a replica is added.

## Measured on this machine

These numbers are from the two-process check on commit `e213f96`, before this branch's shared bucket, and from the same check after Valkey was wired up. They are not a capacity promise.

- One key, requests alternating across two API processes for 10 seconds, no Valkey: 160 requests allowed. Each process had its own bucket, about 80, which is the default 30 tokens plus 5 per second.
- The same check with Valkey: 80 requests allowed.
- A note written on process A, no Valkey: 6 live SSE events on A and 0 on B.
- The same write with Valkey: 3 live events on each process.
- An MCP session created on A: `tools/list` returned 200 on A and 404 `Session not found` on B.
- One 99,000-character guard check on a single API took about 90 ms. Twenty-nine of those checks, 8 at a time, ran at 6.4 requests per second on one core. `/health` during that run had a p99 of 132 ms. A second replica is how this host gets a second core. It does not raise the shared per-key limit.
