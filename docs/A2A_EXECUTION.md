# Agent-to-Agent (A2A) Execution through MCP Guard

This document describes the manager-to-worker A2A execution pipeline, identity model, delegation scope attenuation, tool permission audit findings, and operational behavior under normal and degraded conditions.

---

## 1. Architecture & Identity Model

In MCP Guard, an A2A workflow allows an authenticated **manager** agent to delegate a task to a **worker** agent with a separate, restricted identity.

```
+------------------+         POST /api/a2a/tasks/run
|   User / Client  | ------------------------------------+
+------------------+                                      |
                                                          v
                                              +-----------------------+
                                              |      A2A Manager      |
                                              | (Caller identity,     |
                                              |  e.g. key: b8bb971c)  |
                                              +-----------------------+
                                                          |
                                      Scope Attenuation & | Server-configured
                                      Task Record (DB)    | Worker Identity
                                                          v
                                              +-----------------------+
                                              |      A2A Worker       |
                                              | (WORKER_NOTES_API_KEY,|
                                              |  e.g. key: 1ddb303b)  |
                                              +-----------------------+
                                                          |
                                            Streamable    | Authenticated /mcp/
                                            HTTP RPC      | (No direct tool calls)
                                                          v
                                              +-----------------------+
                                              |  MCP Guard Gateway    |
                                              |  POST /mcp/           |
                                              +-----------------------+
                                                          |
                                                          v
                                              +-----------------------+
                                              |  Notes Tool Sandbox   |
                                              |  list_notes/read/write|
                                              +-----------------------+
```

### Identity Rules
1. **Separate Identities**: The manager and worker use completely separate API keys registered in the database.
2. **Server-Side Worker Identity**: The worker's API key is configured via the environment (`WORKER_NOTES_API_KEY`). The request body **never** accepts worker credentials, upstream URLs, or scope overrides.
3. **No Secret Leaks**: Raw API keys are never exposed in HTTP responses, audit rows, CLI output, or logs. Only the 8-character public prefix (e.g. `mcpg_1ddb303b_...` -> `1ddb303b`) is stored or displayed for attribution.

---

## 2. Server-Enforced Scope Attenuation

Delegation scope attenuation ensures the worker's effective permissions are strictly a subset of the delegator's effective permissions:

$$\text{delegated\_scopes} = \text{manager\_scopes} \cap \text{worker\_scopes} \cap \{\text{notes:read}, \text{notes:write}\}$$

### Crucial Security Principles:
- `agent:run` **alone never implies** `notes:read` or `notes:write`.
- If the worker identity is configured with permissions that exceed the manager's effective permissions (e.g., Worker has `notes:write` while Manager only holds `agent:run` and `notes:read`), the server **rejects the delegation upfront** with the project's standard `FORBIDDEN` error shape:
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
- Excess permissions are rejected with `403 FORBIDDEN`, not silently dropped.

---

## 3. Audit of MCP Tool-Level Permission Enforcement (Requirement 9)

### Finding:
At the `/mcp/` endpoint:
- `McpBearerAuthMiddleware` (`app/auth/mcp_asgi.py`) validates that the connecting client possesses `MCP_REQUIRED_SCOPE` (`agent:run`).
- However, currently, the MCP JSON-RPC dispatch layer does **not** perform granular per-tool scope enforcement (such as verifying `notes:write` for `write_note` or `notes:read` for `read_note`).
- **Impact**: Any valid API key with `agent:run` that connects directly to `/mcp/` can execute `write_note`, even if the key does not possess `notes:write`.

### Security Status & Explicit Dependency:
- In accordance with the project specification: **This PR does NOT claim full end-to-end tool-level authorization is complete at the MCP gateway protocol layer.**
- Worker scope attenuation is strictly enforced on the server prior to delegation (rejecting excess worker permissions and empty delegations with 403 `FORBIDDEN`). However, worker attenuation is fully enforced at the MCP layer only once per-tool scope checks land in `/mcp/`.
- Granular per-tool scope verification at the MCP transport layer (`tools/call` inspection for `notes:write`) belongs to a separate dedicated gateway middleware PR and is not bypassed with a client-side check.

---

## 4. Setup & Configuration

### Prerequisites
1. Set the following in `api/.env`:
   ```bash
   LLM_ENABLED=true
   # Worker API key for notes tasks (must have agent:run and notes:read/write)
   WORKER_NOTES_API_KEY=mcpg_<worker_prefix>_<secret>
   ```
2. Apply database migrations:
   ```bash
   cd api
   uv run alembic upgrade head
   ```

### Running an A2A Task via CLI
The CLI runner `scripts/run_a2a_task.py` reads credentials from environment variables:
```bash
export MANAGER_API_KEY="mcpg_<manager_prefix>_<secret>"
export API_BASE_URL="http://127.0.0.1:8000"

uv run python scripts/run_a2a_task.py "list notes"
```

---

## 5. Observed Real Execution Results

### 1. Successful Read-Only Delegation
- **Manager Scopes**: `agent:run`, `notes:read`
- **Worker Scopes**: `agent:run`, `notes:read`
- **Delegated Scopes**: `["notes:read"]`
- **Request**:
  ```http
  POST /api/a2a/tasks/run
  Authorization: Bearer mcpg_b8bb971c_...
  Content-Type: application/json

  {"task": "list all notes"}
  ```
- **Observed Behavior**:
  - Manager verifies worker identity (`1ddb303b`).
  - Attenuation confirms worker tool permissions (`{notes:read}`) are a subset of manager permissions (`{notes:read}`).
  - Task record created with `status: "pending"`.
  - Audit event `a2a.delegate` logged (`request_id = task_id`).
  - Worker starts execution through `/mcp/` using the worker API key.
  - Final task lifecycle updated to `completed` and audit event `a2a.complete` logged.

### 2. Rejection of Excess Worker Permissions
- **Manager Scopes**: `agent:run`, `notes:read` (read-only manager)
- **Worker Scopes**: `agent:run`, `notes:read`, `notes:write` (worker has write)
- **Observed Response**:
  ```http
  HTTP/1.1 403 Forbidden
  Content-Type: application/json

  {
    "error": {
      "code": "FORBIDDEN",
      "message": "Delegation denied: worker permissions exceed delegator permissions: notes:write.",
      "details": null,
      "request_id": "f041d0e6-601a-4508-95d3-d40cf7f9134f"
    }
  }
  ```
- **Audit**: Logged `a2a.denied` with `status: "denied"`, `error_code: "FORBIDDEN"`, and `status_code: 403`.

### 3. Rejection When Manager Has Only `agent:run`
- **Manager Scopes**: `agent:run` only (no `notes:read` or `notes:write`)
- **Worker Scopes**: `agent:run`, `notes:read`
- **Observed Response**:
  ```http
  HTTP/1.1 403 Forbidden
  Content-Type: application/json

  {
    "error": {
      "code": "FORBIDDEN",
      "message": "Delegation denied: worker permissions exceed delegator permissions: notes:read.",
      "details": null,
      "request_id": "bcbefc9f-cc90-4c21-8954-2e7c66f4d690"
    }
  }
  ```

### 4. Degraded Availability Failures
- **LLM Disabled (`LLM_ENABLED=false`)**:
  ```json
  {
    "error": {
      "code": "SERVICE_UNAVAILABLE",
      "message": "LLM is disabled.",
      "details": null,
      "request_id": "102e88d7-cff4-4e6b-a56a-af4822c8b2b7"
    }
  }
  ```
- **Worker Key Unset (`WORKER_NOTES_API_KEY=""`)**:
  ```json
  {
    "error": {
      "code": "SERVICE_UNAVAILABLE",
      "message": "A2A worker is not configured. Set WORKER_NOTES_API_KEY.",
      "details": null,
      "request_id": "5883daf3-ad70-4169-aaf4-4a9cb6075824"
    }
  }
  ```
- **Gateway Unreachable (`GatewayTransportError`)**:
  Returns HTTP 200 with truthful status `failed` and result detailing transport failure:
  ```json
  {
    "task_id": "a44c5010-e4ec-43a2-a30e-c53ad4d09986",
    "status": "failed",
    "result": "MCP gateway unavailable: The gateway could not be reached.",
    "tool_calls": [],
    "manager_key_prefix": "b8bb971c",
    "worker_key_prefix": "1ddb303b",
    "delegated_scopes": ["notes:read"]
  }
  ```

