# Architecture & Routing Notes

This document explains how the different files in the project connect to each other, specifically focusing on how the "Notes" feature (creating, reading, and listing notes) works end-to-end through the centralized gateway.

## 1. The Core Logic (Python)
**File:** `api/app/mcp_server.py`
- This is the **Brain**.
- It registers `list_notes()`, `read_note()`, and `write_note()` with `@mcp.tool()` on the FastMCP server (`mcp-guard`).
- Each tool calls `run_tool`. REST and MCP therefore share one execution path.
- **Storage:** Notes are `.md` files. The sandbox mounts that directory at `/notes`.

## 2. The Gateway Layer (Python)
**File:** `api/app/gateway.py`
- This is the **Chokepoint & Security Gateway**.
- All REST route tool calls pass through `call_tool(name, args)`. Route handlers never call tool functions or access the filesystem directly.
- **Enforces:** Tool allowlist, 128 KiB argument payload limit, a gateway timeout, and error messages that do not include paths or tracebacks.
- Before `_dispatch`, it binds an execution context (transport `rest`, the actor, the request id, and the forwarded audit id). `_dispatch(name, args)` is unchanged and still calls `mcp.call_tool`.
- Sandbox failures: timeout is 504, Docker unavailable or a full run queue is 503 `Sandbox unavailable.`, and a bad sandbox result is 500 `Internal tool error.`. Docker is not retried in-process.

## 3. The REST API / Routing (Python)
**File:** `api/app/routes/notes.py`
- This is the **Bridge** for the frontend.
- Defines REST endpoints (`GET /api/notes`, `GET /api/notes/{name}`, `PUT /api/notes/{name}`).
- **Connection:** Route handlers forward requests directly to `app.gateway.call_tool()`.

**File:** `api/app/main.py`
- This is the **Hub**.
- Starts the FastAPI application.
- Mounts REST routes (`app.include_router(notes_router)`).
- Mounts the Streamable HTTP MCP endpoint (`app.mount("/mcp", ...)`).

## 4. The Frontend API Client (TypeScript)
**File:** `frontend/src/lib/mcpApi.ts`
- This is the **Messenger**.
- Contains typed functions: `listNotes()`, `readNote()`, and `writeNote()`.
- **Connection:** Calls the FastAPI REST endpoints using `fetch()` (`GET /api/notes`, `GET /api/notes/{name}`, `PUT /api/notes/{name}`).

## 5. The React User Interface (TypeScript)
**File:** `frontend/src/components/dashboard/NotesPanel.tsx`
- This is the **Face**.
- Visual component on the dashboard where users can create, view, and select notes.
- **Connection:** Calls `writeNote()` and `readNote()` from `mcpApi.ts`.

---

## The Complete Flow (How a note gets created)

1. **User Action:** You type a note in the dashboard and click "Save Note" in `NotesPanel.tsx`.
2. **Frontend Call:** `NotesPanel.tsx` calls `writeNote("my-note", "hello")` from `mcpApi.ts`.
3. **HTTP Request:** `mcpApi.ts` sends an HTTP `PUT` request with body `{"content": "hello"}` to `http://localhost:8000/api/notes/my-note`.
4. **Backend Route:** FastAPI routes this request to `api_write_note()` in `api/app/routes/notes.py`.
5. **Gateway Invocation:** `api_write_note()` calls `gateway.call_tool("write_note", {"name": "my-note", "content": "hello"})`.
6. **Core Execution:** The gateway validates the call, writes the forwarded audit row, and calls `write_note`. That function calls `run_tool`, which starts one container (`SANDBOX_MODE=docker`) or runs `app.tools.notes` in a worker thread (`SANDBOX_MODE=inprocess`). The container's notes mount is the host `NOTES_DIR`, unless `SANDBOX_NOTES_SOURCE` is set. Compose should set `SANDBOX_NOTES_SOURCE=volume:<name>` so the API and the runner share a named volume instead of a host path.
7. **Success:** Structured JSON response flows back to the React component to update the UI.

MCP `tools/call` does not enter the gateway. It reaches the same three tool functions through FastMCP, and those functions call `run_tool`. The audit middleware stores the `tool.call` event id on the request scope so the sandbox run can point at it.
