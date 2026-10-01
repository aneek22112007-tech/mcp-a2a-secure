# Architecture & Routing Notes

This document explains how the different files in the project connect to each other, specifically focusing on how the new "Notes" feature (creating, reading, and listing notes) works end-to-end.

## 1. The Core Logic (Python)
**File:** `api/app/mcp_server.py`
- This is the **Brain**. 
- It contains the actual Python functions that do the work: `list_notes()`, `read_note()`, and `write_note()`.
- It uses `@mcp.tool()` to register these functions so that AI models (via the MCP Inspector) can use them.
- **Storage:** It saves the notes as real `.md` files in the `api/data/notes/` folder.

## 2. The REST API / Routing (Python)
**File:** `api/app/routes/notes.py`
- This is the **Bridge** for the frontend.
- Since the React frontend cannot speak the complex MCP protocol, this file creates standard HTTP REST routes (`GET /api/notes`, `POST /api/notes/{name}`).
- **Connection:** Instead of rewriting the logic, these routes simply import and call the exact same `list_notes`, `read_note`, and `write_note` functions from `mcp_server.py`.

**File:** `api/app/main.py`
- This is the **Hub**.
- It starts the FastAPI server.
- It attaches the REST routes (`app.include_router(notes_router)`).
- It also attaches the MCP Streamable HTTP endpoint (`app.mount("/mcp", ...)`).

## 3. The Frontend API Client (TypeScript)
**File:** `frontend/src/lib/mcpApi.ts`
- This is the **Messenger**.
- It contains functions like `listNotes()`, `readNote()`, and `writeNote()`.
- **Connection:** These functions use the browser's `fetch()` to call the FastAPI REST routes (e.g., `http://localhost:8000/api/notes`).

## 4. The React User Interface (TypeScript)
**File:** `frontend/src/components/dashboard/NotesPanel.tsx`
- This is the **Face**.
- It is the visual component on the dashboard where users can view and type notes.
- **Connection:** When a user types a note and clicks "Save Note", this component calls `writeNote()` from `mcpApi.ts`.

**File:** `frontend/src/pages/Dashboard.tsx`
- This is the **Layout**.
- It imports `NotesPanel` and places it visually on the dashboard screen next to the server inventory and security findings.

---

## The Complete Flow (How a note gets created)

1. **User Action:** You type a note in the dashboard and click "Save Note" in `NotesPanel.tsx`.
2. **Frontend Call:** `NotesPanel.tsx` calls `writeNote("my-note", "hello")` from `mcpApi.ts`.
3. **HTTP Request:** `mcpApi.ts` sends an HTTP `POST` request to `http://localhost:8000/api/notes/my-note`.
4. **Backend Route:** FastAPI routes this request to the `api_write_note()` function in `api/app/routes/notes.py`.
5. **Core Logic:** `api_write_note()` calls the core `write_note()` function imported from `api/app/mcp_server.py`.
6. **File System:** `write_note()` validates the name and saves a file called `my-note.md` in the `api/data/notes/` directory.
7. **Success:** A success message flows all the way back to the React component, which then updates the UI.
