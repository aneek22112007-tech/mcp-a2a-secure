# AI incident analyst

The analyst groups real audit rows and open scanner findings into incidents, then explains one incident in plain English. Grouping is ordinary code. The model never decides a fact, a severity, or an allow or deny.

It does not block a tool, revoke a key, approve a pin, or resolve a finding. Nothing calls it automatically. A person asks with `POST /api/analyst/explain`.

## Data flow

```
audit_events (denied rows, and tool.output.injection)
        +  tool_scan_findings (open rows in the window)
            |
            v
app/analyst/incidents.py    group_incidents()     no model
            |
            v
GET  /api/analyst/incidents                 audit:read
GET  /api/analyst/incidents/{incident_id}   audit:read
            |
POST /api/analyst/explain                   analyst:run, and audit:read in the handler
            |
            v
app/analyst/prompt.py       build_facts()         whitelist, no client IP, no raw ids
                            sanitize_field()      safe_reason, then normalize, then scan_text
                            fence_messages()      random nonce around the JSON
            |
            v
LLMBackend.invoke(purpose="analyst.explain")      Ollama first, Groq only on fallback
            |
            v
app/analyst/output.py       parse_report()        strict JSON, every timeline line cites a real ref
            |
            v
analyst_reports row  +  audit row analyst.explain  ->  console AI Analyst page
```

List and detail never call the model. If the model is disabled or unreachable, the list and the facts still come from code. The explanation area says the analyst is unavailable and shows no invented text.

`GET /api/analyst/status` reports health. It does not call the model.

## What becomes an incident

`group_incidents` reads denied audit rows, plus any `tool.output.injection` row (warn and cleaned hits are allowed and still count), from the last `ANALYST_WINDOW_HOURS`. It also reads open `tool_scan_findings` in that window. `none` and `info` findings are skipped. The same rows always produce the same incidents.

Rows are dropped before grouping when the action is `guard.check` or starts with `analyst.`. Scanner findings come from `tool_scan_findings`, not from a second copy of the `tool.scan.finding` audit row. The retention row `analyst_reports.retention` is an allow, so it is not a security event and cannot become an incident.

| Kind | Grouped by | How a row gets here |
|---|---|---|
| `injection` | tool name, or `unknown` | `tool.output.injection` |
| `pin` | tool name, or `unknown` | `tool.pin.drift`, `tool.pin.deny`, `tool.pin.unapproved` |
| `scanner` | tool name, or `unknown` | one open finding. `decision` is `denied` when its severity is in `SCANNER_BLOCK_SEVERITIES` |
| `scope` | key prefix, or `anonymous` | `auth.deny` whose reason is `unmapped_tool` or starts with `insufficient_scope:` |
| `auth` | key prefix, or `anonymous` | other `auth.deny` rows |
| `rate_limit` | key prefix, or `anonymous` | `rate_limit.deny` |
| `a2a` | key prefix, or `anonymous` | `a2a.denied`, `a2a.failed` |
| `other` | key prefix, or `anonymous` | any other denied row |

A gap strictly longer than `ANALYST_INCIDENT_GAP_MINUTES` starts a new incident inside the same bucket. Events are `E1` .. `En` in time order. Two incidents are related when they share a key prefix or a tool name and their time ranges overlap or fall within one gap. `related_ids` are sorted. `counts_by_action` keeps first-seen order.

The two database reads stay on the event loop. Row building, clustering, relating, and the final sort run in a worker thread. Related ids come from an index of key prefixes and an index of tool names. Inside each index the incidents are ordered by `first_seen`, and a walk stops at the first later incident that starts after `last_seen` plus the gap. The definition of related is unchanged. `GET /api/analyst/incidents/{id}` returns 404 `Incident not found.` for an id that is not `inc_` plus 16 hex characters, before it reads the database or builds incidents.

Anonymous rows are split by client IP only inside the private bucket. The public group key is `anonymous`. The incident id is `inc_` plus 16 hex characters of SHA-256 over `kind|group_key|first event id`, so the id does not contain an IP. If retention deletes that first row, the next build uses a new first event and the id changes. A stored report is then for the old id.

Detail keeps the original `E` numbers and returns the newest 200 events when there are more. The list never returns events or evidence.

## Severity

`app/analyst/severity.py` sets high, medium, or low. The model is told the value and is not asked to change it.

| Kind | High | Medium | Low |
|---|---|---|---|
| `injection` | any event has status `denied` | every other injection incident | |
| `pin` | action `tool.pin.drift`, or reason `upstream_contract_changed` | `tool.pin.deny` or `tool.pin.unapproved` | anything else |
| `scanner` | a finding severity of `high` or `critical` | a finding severity of `medium` | anything else |
| `scope` | 10 or more events | 3 to 9 events | fewer than 3 |
| `auth` | 20 or more events | 5 to 19 events | fewer than 5 |
| `a2a` | | every a2a incident | |
| `rate_limit` | | 3 or more events | fewer than 3 |
| `other` | | | every other incident |

## Settings

There is no separate enable flag. `LLM_ENABLED=false` makes explain return 503. Grouping still works.

| Variable | Default | Bounds | Meaning |
|---|---|---|---|
| `ANALYST_WINDOW_HOURS` | `24` | 1 to 168 | How far back incidents are built |
| `ANALYST_INCIDENT_GAP_MINUTES` | `15` | 1 to 240 | A larger gap starts a new incident |
| `ANALYST_MAX_ROWS` | `5000` | 100 to 20000 | Most audit rows read per pass, newest first |
| `ANALYST_MAX_EVENTS_PER_PROMPT` | `40` | 5 to 100 | Most events placed in one prompt. Older events are counted in `events_not_listed` |
| `ANALYST_MAX_OUTPUT_CHARS` | `4000` | 500 to 8000 | Longest reply accepted, before parsing |
| `ANALYST_RATE_LIMIT_CAPACITY` | `3` | greater than 0 | Explain bucket size, per key |
| `ANALYST_RATE_LIMIT_PER_MINUTE` | `3.0` | greater than 0 | Refill per minute for that bucket |
| `ANALYST_MAX_CONCURRENCY` | `1` | 1 to 4 | Explanations running at once in this process |

The explain bucket is separate from the shared REST and MCP bucket. A cache hit still takes one explain token, because the limiter runs before the service. It does not take a concurrency slot and it does not call the model.

The shared app limiter still runs first. With the default shared capacity, a few disabled explain calls stay 503. They do not become 429 from the explain bucket, because `LLM_ENABLED` is checked before that bucket.

## Endpoints

| Method | Path | Scope | What it does |
|---|---|---|---|
| `GET` | `/api/analyst/status` | `analyst:run` | `enabled`, Ollama reachability, model name, whether that model is present, whether Groq is configured, the explain rate, concurrency, and `busy`. No key material |
| `GET` | `/api/analyst/incidents` | `audit:read` | Newest first. Optional `kind`, `severity`, and `limit` (1 to 100, default 50). Includes `window_hours` |
| `GET` | `/api/analyst/incidents/{incident_id}` | `audit:read` | Facts, events, and the stored report when its JSON still validates. Unknown id is 404 `Incident not found.` |
| `POST` | `/api/analyst/explain` | `analyst:run`, then `audit:read` in the handler | Body `incident_id` or `event_id`, and `refresh`. Returns the checked report, provider, model, `fell_back`, `cached`, `withheld_fields`, `created_at`, `latency_ms`, and `refs` |

`admin` satisfies every scope. A key with `analyst:run` but not `audit:read` gets 403 `Missing required scope: audit:read.` and an `auth.deny` row whose reason is `insufficient_scope:audit:read`. The route map cannot express both scopes, so the handler writes that row itself. `require_scopes` is not used.

`event_id` is an audit UUID (at most 36 characters). A finding id such as `finding:<uuid>` does not fit. An audit id in the window that is not part of an incident is 422 `This event is not part of an incident.` A missing audit row is 404 `Event not found.`

The console connect screen probes `analyst:run` with `GET /api/analyst/status`. A key without that scope writes one real `auth.deny` row per connect. That row can show up in a later incident. An admin key passes every probe, because `admin` counts as every scope.

## What is sent to the model

Each event in the prompt may include `ref`, `at`, `action`, `decision`, `status`, `status_code`, `error_code`, `reason`, and `tool`. A `tool.scan.finding` event may also include `evidence`. The incident block may include kind, severity, times, event count, counts by action, key prefixes, tool names, and `allowed_refs` (the `E` labels actually sent). A related incident contributes kind, severity, event count, and first seen.

These are not sent: `client_ip`, `client_id`, `api_key_id`, `args_hash`, `request_id`, and the real event id. A key prefix is the 8 hex characters already stored on the audit row, not a key. Field lengths are capped (evidence 120, reason 300, tool name 100, error code 64, prefix 16).

Groq receives that same fenced JSON, and only when Ollama cannot be reached or times out and `GROQ_API_KEY` is set. Prompts are not written to `llm_calls`. The stored report body is the validated JSON, not the raw reply.

## Prompt-injection defences

Event text is untrusted. A tool name or a request id can look like an instruction.

1. Field whitelist. Only the fields above are copied into the facts.
2. `safe_reason` drops `mcpg_` secrets, bearer tokens, and control characters.
3. The scan view runs `normalize_for_scan`, then replaces `_`, `.`, `:`, and `-` with spaces, then `scan_text`. A match is replaced with `[withheld: matched guard rule G1]` (rule ids joined when several match). The matched text is not sent. `withheld_fields` counts those replacements.
4. `fence_messages` wraps the JSON in `<incident_data id="<nonce>">` with a fresh 8-byte hex nonce. `<` and `>` inside the JSON are escaped. The system text tells the model the block is untrusted data and that the only output is one JSON object.
5. `parse_report` strips one `<think>` block and one markdown fence, then requires a JSON object with `extra` forbidden. A reply longer than `ANALYST_MAX_OUTPUT_CHARS` is `too_long`. Bad JSON is `not_json`. The wrong shape is `invalid_shape`.
6. Every timeline item must cite at least one ref that was actually sent. Any other ref is `unknown_ref`. The response `refs` map still lists every event on the incident, including events omitted from a trimmed prompt.
7. The reply guard rejects `high` and `critical` findings from `scan_text` on the raw joined text and on the separator-normalized view. It also rejects `mcpg_` and `http://` or `https://`, case-insensitive. Medium findings do not reject the reply. A failed reply is `unsafe_output`.

There is no second prompt. A rejected reply is not stored and is not returned. Parsing and fact building run in a worker thread because `scan_text` can be slow.

## Unavailable, busy, and rejected

| State | HTTP | Code | When |
|---|---|---|---|
| Unavailable | 503 | `ANALYST_UNAVAILABLE` | `LLM_ENABLED` is false (`reason` `disabled`), or Ollama and Groq cannot answer (`reason` `unreachable`). The handler adds `check_health()` fields. No explanation text |
| Busy | 503 | `ANALYST_BUSY` | This process is already at `ANALYST_MAX_CONCURRENCY`. `Retry-After: 5`. The call is not queued |
| Rejected | 502 | `ANALYST_OUTPUT_REJECTED` | `too_long`, `not_json`, `invalid_shape`, `unknown_ref`, or `unsafe_output`. `details.reason` is that word. The raw reply is not included |
| Limited | 429 | `RATE_LIMITED` | The explain bucket is empty. The audit reason contains `surface=analyst` |

The concurrency limit is an in-process counter. `try_enter` returns immediately when it is full. The counter is created on the first explain that misses the cache. `GET /api/metrics` `rate_limit_rejections` counts the shared bucket only, not `surface=analyst`.

Each explain attempt writes `analyst.explain` with decision `allowed`, including unavailable, busy, and rejected attempts. `llm_calls` records `analyst.explain` for a model attempt. A disabled call is status `disabled`. An unreachable call is status `error`. A cache hit writes the audit row and does not write `llm_calls`.

## Cache

A report is reused when `refresh` is false, the stored `events_fingerprint` matches the incident, and the stored body still validates. The fingerprint is SHA-256 over the sorted event ids. `cached` is true and `latency_ms` is the original call. `refresh: true`, a changed event set, or JSON that no longer validates computes a new report. Invalid stored JSON is omitted from detail as well, so the text is not shown. The short `latest_report` on the list can still show `created_at`, `provider`, and `stale`.

Reports are deleted with `llm_calls`, after `LLM_CALL_RETENTION_DAYS`, when the retention scheduler runs. That pass writes `analyst_reports.retention`.

## Console

The AI Analyst page is `#/analyst`. Seeing the list needs `audit:read`. Explain needs `analyst:run`. The page, the withheld note, and the unavailable sentences are described in [CONSOLE.md](CONSOLE.md).

Threats for this feature are in [THREAT_MODEL.md](THREAT_MODEL.md). Stored columns are in [DATA_MODEL.md](DATA_MODEL.md). What leaves the machine is in [PRIVACY.md](PRIVACY.md). Checking the status endpoint is in [RUNBOOK.md](RUNBOOK.md).
