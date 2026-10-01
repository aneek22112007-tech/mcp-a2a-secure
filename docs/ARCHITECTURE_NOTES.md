# Architecture & Routing Notes

This document explains how the different files in the project connect to each other, specifically focusing on how the "Notes" feature (creating, reading, and listing notes) works end-to-end through the centralized gateway.

## 1. The Core Logic (Python)
**File:** `api/app/mcp_server.py`
- This is the **Brain**. 
- It contains the core Python functions: `list_notes()`, `read_note()`, and `write_note()`.
- Functions are registered with `@mcp.tool()` on the FastMCP server instance (`mcp-guard`).
- **Storage:** Saves notes as real `.md` files in the `api/data/notes/` directory.

## 2. The Gateway Layer (Python)
**File:** `api/app/gateway.py`
- This is the **Chokepoint & Security Gateway**.
- All REST route tool calls pass through `call_tool(name, args)`. Route handlers never call tool functions or access the filesystem directly.
- **Enforces:** Tool allowlist, 128 KiB argument payload limit, 5-second execution timeout, error path sanitization (500 Internal tool error for OS errors), and hooks for Day-3 auth and Day-4 audit logging.

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
6. **Core Execution:** Gateway validates rules and executes `write_note()`, saving `my-note.md` in `api/data/notes/`.
7. **Success:** Structured JSON response flows back to the React component to update the UI.
