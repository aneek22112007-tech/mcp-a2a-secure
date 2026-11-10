# Manager-to-Worker Delegation through MCP Guard

This document describes how a manager agent delegates a notes task to a worker agent through MCP Guard: the identity model, scope attenuation, task lifecycle, audit events, endpoints, and behaviour when a dependency is unavailable.

## What this is, and what it is not

This is a one-hop manager-to-worker **delegation** pipeline. It uses the task and agent-card **shapes** from the official `a2a-sdk` Python package (`a2a.types.Task`, `TaskState`, `AgentCard`) so task status and discovery data follow the A2A data model.

It is **not** full A2A protocol support yet. The manager and worker run in the same API process, and the hand-off between them is an in-process call. The following are follow-ups:

- An agent card with a reachable service `url` and supported interfaces.
- Serving the card at `/.well-known/agent-card.json`.
- An A2A task-send endpoint (JSON-RPC `message/send`), so an external A2A client can submit tasks.

---

## 1. Architecture and identity model

```
+------------------+   POST /api/a2a/tasks/run (caller = manager identity)
|  User / Client   | -------------------------------------------+
+------------------+                                            |
                                                                v
                                        +--------------------------------------+
                                        | Manager (LangGraph)                  |
                                        |  - resolve worker identity           |
                                        |  - scope attenuation (403 on excess) |
                                        |  - task row + audit events           |
                                        |  plan -> delegate -> collect         |
                                        +--------------------------------------+
                                                                |
                                     task + manager plan        |  WORKER_NOTES_API_KEY
                                                                v
                                        +--------------------------------------+
                                        | Worker (notes agent, LangGraph)      |
                                        |  one authenticated /mcp/ session     |
                                        |  X-Request-ID = task_id              |
                                        +--------------------------------------+
                                                                |
                                                                v
                                        +--------------------------------------+
                                        | MCP Guard /mcp/                      |
                                        | auth, rate limit, pinning, sandbox,  |
                                        | injection guard, audit               |
                                        +--------------------------------------+
```

### Identity rules
1. **Separate identities.** The manager is the authenticated caller. The worker uses its own API key, stored in the database like any other key.
2. **Server-side worker identity.** The worker key comes from `WORKER_NOTES_API_KEY` in the server environment. The request body never accepts credentials, upstream URLs, worker identities or scope grants.
3. **No secret leaks.** Raw keys never appear in responses, audit rows, CLI output or logs. Only the public key prefix (`mcpg_<prefix>_<secret>` -> `<prefix>`) is stored or shown for attribution.

---

## 2. LangGraph manager

The manager is a LangGraph graph with three nodes:

1. **plan** - one call through the existing `LLMBackend` (purpose `a2a_manager_plan`) that writes a short execution plan for the task.
2. **delegate** - runs the worker. The worker instruction is the user's task followed by the manager's plan, marked as guidance only. The plan is clipped (at most 2,000 characters) so the whole instruction stays within the worker's 8,000-character task limit; if there is no room, the task is sent alone. No extra LLM call is made for this step.
3. **collect** - turns the worker outcome into the final task status and result.

The manager never calls tools itself. The whole run has a 120-second deadline.

---

## 3. Server-enforced scope attenuation

```
delegated_scopes = manager_scopes ∩ worker_scopes ∩ {notes:read, notes:write}
```

- `agent:run` alone never implies `notes:read` or `notes:write`. An `admin` key counts as holding every scope for this check.
- If the worker key holds a tool scope the manager does not, the delegation is rejected before any task row or worker session is created:
  ```json
  {
    "error": {
      "code": "FORBIDDEN",
      "message": "Delegation denied: worker permissions exceed delegator permissions: notes:write.",
      "details": null,
      "request_id": "<request_id>"
    }
  }
  ```
- If the intersection is empty (for example, manager and worker both hold only `agent:run`), the delegation is also rejected with 403 `FORBIDDEN` before any worker session opens.
- Both rejections write an `a2a.denied` audit row with status code 403 and error code `FORBIDDEN`.

---

## 4. MCP per-tool scope enforcement

At `/mcp/`, `McpBearerAuthMiddleware` (`app/auth/mcp_asgi.py`) verifies that the connecting key holds `agent:run` to open an MCP session. In addition, `McpToolScopeMiddleware` (`app/mcp_tool_scope.py`) inspects incoming `tools/call` requests and enforces per-tool scopes defined in `TOOL_SCOPES` (`notes:write` for `write_note`, `notes:read` for `list_notes` and `read_note`):

- Delegated worker scopes are enforced at the actual tool-call layer, not merely when opening the MCP session.
- If a worker key holding `agent:run` attempts to call `write_note` without holding `notes:write`, the gateway returns 403 `FORBIDDEN` (`Missing required scope: notes:write.`) and audits an `auth.deny` event.
- Unmapped tools fail closed and are denied with 403 `FORBIDDEN`.
- Attenuation is enforced on the server before delegation (403 on excess or empty scopes) and subsequently enforced at every tool execution on the gateway.

---

## 5. Endpoints

All routes are registered in `ROUTE_SCOPES` (`app/auth/scopes.py`).

| Method and path | Scope | Purpose |
|---|---|---|
| `POST /api/a2a/tasks/run` | `agent:run` | Run one delegated task. Body: `{"task": "..."}` (1 to 8,000 characters). |
| `GET /api/a2a/tasks/{id}` | `agent:run` | Task status and result. Owner-only: only the key that created the task can read it; any other key, including admin, gets 404 `NOT_FOUND`. |
| `GET /api/a2a/capabilities` | public | Agent name, installed `a2a-sdk` version, max hops (1), allowed tools, max task length, and the agent card. |
| `GET /api/a2a/agent-card` | public | The worker's agent card, built with `a2a.types.AgentCard` (name, description, version, capabilities, skills). |

`GET /api/a2a/tasks/{id}` also returns an `a2a_task` object: the task as an `a2a.types.Task` (id, status state, and history with the user's task and the agent's result or error).

---

## 6. Task lifecycle and statuses

Each delegation is stored in the `a2a_tasks` table (migration `f3b8c921d47e`). A row starts as `pending`, moves to `running`, and always ends in one terminal status:

| Status | Meaning | A2A task state |
|---|---|---|
| `completed` | The worker finished and every tool call succeeded. | `TASK_STATE_COMPLETED` |
| `failed` | LLM disabled or unavailable, gateway unreachable, a tool call failed, the deadline passed, or an unexpected error. | `TASK_STATE_FAILED` |
| `blocked` | The gateway denied the worker or one of its tool calls (401, 403, 429, pin block, guard block). | `TASK_STATE_REJECTED` |
| `cancelled` | The run was cancelled while in progress. | `TASK_STATE_CANCELED` |

A blocked tool call is never reported as `completed`.

---

## 7. Audit events

| Action | When |
|---|---|
| `a2a.denied` | Delegation rejected (excess or empty scopes), 403 `FORBIDDEN`. |
| `a2a.delegate` | Delegation granted and task row created. Reason lists the task id, worker prefix and delegated scopes. |
| `a2a.worker.start` | The manager starts the run (written after the LLM-enabled check, before the plan step). |
| `a2a.complete` | Task finished as `completed`. |
| `a2a.failed` | Task finished as `failed` or `blocked`, including timeouts. Also written when the worker key is not configured (503). |
| `a2a.cancelled` | Task cancelled. |

The `a2a.*` rows for a task use `request_id = task_id`. The worker sends `X-Request-ID: <task_id>` on its `/mcp/` requests, so the gateway's own audit rows for those calls (`auth.allow`, `mcp.tools_call`) carry the same id. The task row also stores the original HTTP request id as `manager_request_id`.

---

## 8. Setup

1. In `api/.env`:
   ```bash
   LLM_ENABLED=true
   # Worker key: agent:run plus notes:read (and notes:write only if the manager also has it)
   WORKER_NOTES_API_KEY=mcpg_<worker_prefix>_<secret>
   ```
2. Apply migrations:
   ```bash
   cd api
   uv run alembic upgrade head
   ```
3. Run a task from the CLI. The runner reads the manager key from the environment and prints only status, result and correlation ids:
   ```bash
   export MANAGER_API_KEY="mcpg_<manager_prefix>_<secret>"
   export API_BASE_URL="http://127.0.0.1:8000"
   uv run python scripts/run_a2a_task.py "list my notes"
   ```

---

## 9. Behaviour by scenario

### Read delegation
- Manager scopes: `agent:run`, `notes:read`. Worker scopes: `agent:run`, `notes:read`. Delegated: `["notes:read"]`.
- Request:
  ```http
  POST /api/a2a/tasks/run
  Authorization: Bearer mcpg_<manager_prefix>_<secret>
  Content-Type: application/json

  {"task": "list all notes"}
  ```
- Flow: worker identity verified, attenuation passes, task row `pending`, `a2a.delegate`, row `running`, `a2a.worker.start`, manager plan, worker session on `/mcp/` with the worker key, tool calls through the full pipeline, row `completed`, `a2a.complete`.
- This path needs a working LLM (Ollama, or Groq as fallback).

### Excess worker permissions
- Manager: `agent:run`, `notes:read`. Worker: `agent:run`, `notes:read`, `notes:write`.
- Result: 403 `FORBIDDEN`, "worker permissions exceed delegator permissions: notes:write.", and an `a2a.denied` row. No task row is created.

### Manager holds only `agent:run`
- Worker: `agent:run`, `notes:read`. Result: 403 `FORBIDDEN` for `notes:read`.

### Empty delegated scopes
- Manager and worker both hold only `agent:run`. Result: 403 `FORBIDDEN`, "delegated permissions are empty", and an `a2a.denied` row. No worker session is opened.

### LLM disabled (`LLM_ENABLED=false`)
- Returns **HTTP 200** with `"status": "failed"` and `"result": "LLM is disabled."`. A task row is created and ends as `failed`, with `a2a.delegate` and `a2a.failed` audit rows.

### LLM unavailable
- Ollama unreachable and Groq not configured: HTTP 200, `"status": "failed"`, result "Ollama is unreachable and Groq is not configured.", with `a2a.worker.start` and `a2a.failed` rows.

### Deadline exceeded
- If the run takes longer than 120 seconds: HTTP 200, `"status": "failed"`, result "Task deadline exceeded.", and `a2a.failed` with status `timeout`.

### Worker key not set
- `WORKER_NOTES_API_KEY` empty or invalid: **HTTP 503** `SERVICE_UNAVAILABLE`, "A2A worker is not configured. Set WORKER_NOTES_API_KEY.", and an `a2a.failed` row. No task row is created.

### Gateway unreachable
- If the worker cannot reach `/mcp/`: HTTP 200, `"status": "failed"`, result "MCP gateway unavailable: ...". Because the manager's plan step runs first, this path is reached only when the LLM is available.

### Gateway denies a tool call
- The task ends as `blocked` (A2A state `TASK_STATE_REJECTED`) with a result naming the tool and status code, never `completed`.
