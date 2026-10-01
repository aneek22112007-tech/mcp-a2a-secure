# MCP Viva Notes

> Quick-reference for explaining this project to a mentor. Ordered from 30-second to full technical depth.

---

## 1. 30-Second Explanation

"MCP — Model Context Protocol — is a standard for AI models to discover and call tools. In this project, I built an MCP server called Polaris using Python's FastMCP library. It exposes three tools: list notes, read a note, and write a note. The server stores notes as Markdown files. I connected it to a FastAPI web server so both the official MCP Inspector and the React dashboard can access the same tools — the Inspector over the MCP protocol, the dashboard over plain REST."

---

## 2. 1-Minute Explanation

"MCP is an open protocol, similar to how REST standardises web APIs, but specifically designed for AI models to interact with tools. Instead of every AI integration being custom code, MCP gives a single standard: tools/list to discover capabilities, tools/call to invoke them, with structured JSON schemas for inputs and outputs.

In this project, I implemented an MCP server named Polaris. It exposes three tools: `list_notes`, `read_note`, and `write_note`. These tools let any MCP-compatible client read and write Markdown notes stored on the filesystem. The server is built with FastMCP, which is a Python framework from the official MCP SDK that lets you register tools using simple decorators on ordinary Python functions.

The MCP server runs inside a FastAPI application. It is exposed over Streamable HTTP transport at `/mcp/`. The official MCP Inspector connects to it and confirms all three tools, the server name 'polaris', and can invoke each tool and see the real result."

---

## 3. 3-Minute Explanation

"Let me walk you through the architecture from top to bottom.

**The problem MCP solves:** AI models need to call external tools — read files, query databases, run searches. Without a standard, every integration is custom. MCP standardises this with a client/server model. The server declares its tools with schemas, the client discovers them automatically, and calls them via JSON-RPC.

**Our MCP server:** I built it in Python using FastMCP, which is part of the official MCP SDK. The file is `api/app/mcp_server.py`. The server is named 'polaris'. It registers three tools with the `@mcp.tool()` decorator — `list_notes`, `read_note`, and `write_note`. These are just Python functions with type hints; FastMCP reads the hints and docstrings to generate the JSON Schema automatically.

**Security:** Every tool that takes a note name runs it through a `_safe()` function I wrote. It does two things: validates the name against a strict allowlist regex `[A-Za-z0-9_-]{1,64}`, and then resolves the full filesystem path and confirms it still lives inside the notes directory. This prevents path traversal attacks where someone passes `../../etc/passwd` as a note name.

**Transport:** The MCP server runs in two modes. When launched directly with `python -m app.mcp_server`, it uses STDIO transport — the Inspector launches it as a subprocess and communicates via stdin/stdout. When imported by FastAPI, the same MCP server object is mounted at `/mcp/` as a Streamable HTTP endpoint — the Inspector and Python client connect to it over HTTP.

**Frontend integration:** The browser cannot speak the MCP protocol — it requires a stateful initialised session. So I added a thin REST layer in FastAPI (`api/app/routes/notes.py`) that exposes `/api/notes` endpoints. These endpoints call the exact same Python functions registered as MCP tools — there is no logic duplication. The React dashboard's `NotesPanel` component calls these endpoints through a typed API client (`mcpApi.ts`) and displays real live data with proper loading, error, and empty states.

**Testing:** All 17 tests pass — the original 9 unit tests for the MCP tools, 1 HTTP transport test, and 8 new tests for the REST bridge."

---

## 4. Architecture Explanation (Speaking Script)

*"Let me draw the architecture for you."*

```
Browser
  ↓ HTTP GET/POST /api/notes
FastAPI (port 8000)
  ↓ calls Python function
list_notes() / read_note() / write_note()
  ↓ reads/writes
api/data/notes/*.md files


MCP Inspector / AI Model
  ↓ JSON-RPC over Streamable HTTP /mcp/
FastMCP session manager
  ↓ dispatches to
list_notes() / read_note() / write_note()
  ↓ reads/writes
api/data/notes/*.md files
```

*"The critical insight: both paths go through the same three Python functions. The MCP decorator `@mcp.tool()` does not change the function — it just registers it with the server. So we call it directly from the REST router with zero duplication."*

---

## 5. Every Important Term

### MCP (Model Context Protocol)
**Definition:** An open standard for AI models to discover and call tools, access resources, and use prompts via JSON-RPC.  
**In our project:** The protocol the Polaris server implements. The Inspector validates it.

### MCP Server
**Definition:** A process that exposes tools, resources, and prompts over the MCP protocol.  
**In our project:** `api/app/mcp_server.py` — FastMCP instance named "polaris".

### MCP Client
**Definition:** Code that connects to an MCP server, initialises a session, and calls tools.  
**In our project:** The MCP Inspector (graphical), `api/app/mcp_client.py` (programmatic Python).

### Host
**Definition:** The application that runs an MCP client — e.g., Claude Desktop, Cursor IDE, MCP Inspector.  
**In our project:** The MCP Inspector is the host during development.

### Tool
**Definition:** A callable function exposed by an MCP server with a name, description, and JSON Schema input/output.  
**In our project:** `list_notes`, `read_note`, `write_note`.

### Resource
**Definition:** A read-only data source an MCP server can expose (like a file or database row), accessed by URI.  
**In our project:** **Not implemented.** Resources would be a future enhancement.

### Prompt
**Definition:** A reusable prompt template an MCP server can provide to AI clients.  
**In our project:** **Not implemented.**

### Transport
**Definition:** The communication channel between MCP client and server. Options: STDIO, Streamable HTTP, SSE.  
**In our project:** **STDIO** when running `python -m app.mcp_server` directly. **Streamable HTTP** at `/mcp/` when running via FastAPI.

### FastMCP
**Definition:** A Python framework in the official `mcp` SDK that simplifies building MCP servers with decorators.  
**In our project:** `from mcp.server.fastmcp import FastMCP` — wraps all JSON-RPC handling automatically.

### JSON-RPC
**Definition:** A remote procedure call protocol using JSON. MCP uses JSON-RPC 2.0 for all messages.  
**In our project:** Every MCP message (initialize, tools/list, tools/call) is a JSON-RPC object.

### MCP Inspector
**Definition:** Official graphical tool (`npx @modelcontextprotocol/inspector`) for testing MCP servers.  
**In our project:** Used to validate all three tools, confirm CONNECTED status, invoke tools, and inspect raw requests/responses.

### STDIO Transport
**Definition:** MCP client launches the server as a subprocess and communicates via stdin/stdout pipes.  
**In our project:** Used when running `uv run python -m app.mcp_server` inside the Inspector command.

### Streamable HTTP Transport
**Definition:** MCP server runs as an HTTP endpoint. Client sends JSON-RPC via POST, receives responses as SSE or plain JSON.  
**In our project:** `/mcp/` endpoint in the FastAPI app. This is what `mcp_client.py` connects to.

---

## 6. Mentor Questions and Answers

---

### Q1. What is MCP?
**Short:** MCP is Model Context Protocol — a standard for AI models to discover and call tools via JSON-RPC. Like REST for browsers, but for AI models.  
**Detailed:** Developed by Anthropic, MCP defines a client/server architecture where the server exposes capabilities (tools, resources, prompts) with structured schemas. Any MCP-compatible client — AI model, test tool, or custom code — can discover and use them without custom integration per tool.  
**Code reference:** `api/app/mcp_server.py` — the entire file is the MCP server.

---

### Q2. Why did you use MCP?
**Short:** To make the notes tools accessible to any AI model with zero custom integration — because MCP is a standard.  
**Detailed:** If I built only a REST API, each AI integration would need custom code. With MCP, any client that speaks the protocol can discover and use all three tools automatically — including the official Inspector for testing.  
**Code reference:** `@mcp.tool()` decorators in `mcp_server.py`.

---

### Q3. Why not just use REST?
**Short:** REST is stateless HTTP for browsers; MCP is a stateful protocol designed for AI tool discovery and invocation. Both are used here for their respective clients.  
**Detailed:** Browsers use REST (`api/app/routes/notes.py`). AI models and the Inspector use MCP. We actually use both — the REST layer calls the same tool functions so there is no logic duplication.  
**Code reference:** `api/app/routes/notes.py` imports and calls `list_notes`, `read_note`, `write_note` from `mcp_server.py`.

---

### Q4. What is an MCP server?
**Short:** A process that exposes tools/resources/prompts over the MCP JSON-RPC protocol.  
**Detailed:** In this project it is the FastMCP instance `mcp = FastMCP("polaris")`. It handles session management, tool registration, schema generation, and routing of JSON-RPC calls.  
**Code reference:** `mcp_server.py` line 28: `mcp = FastMCP("polaris")`

---

### Q5. What is an MCP client?
**Short:** Code that connects to an MCP server, initialises a session, and calls tools.  
**Detailed:** Our `mcp_client.py` connects to `http://localhost:8000/mcp/`, calls `initialize`, then `list_tools`, then invokes `write_note` and `read_note` programmatically.  
**Code reference:** `api/app/mcp_client.py`

---

### Q6. What is FastMCP?
**Short:** A Python framework that wraps the MCP SDK, letting you register tools with decorators.  
**Detailed:** Instead of writing raw JSON-RPC handlers, FastMCP reads Python function signatures and docstrings to auto-generate tool schemas. `@mcp.tool()` on a function is all that's needed to expose it as an MCP tool.  
**Code reference:** `from mcp.server.fastmcp import FastMCP`

---

### Q7. What is a tool?
**Short:** A callable function with a name, JSON Schema inputs, and a return value — exposed by the MCP server.  
**Detailed:** In FastMCP, any Python function decorated with `@mcp.tool()` becomes a tool. The type hints become the JSON Schema. The docstring becomes the description. `list_notes`, `read_note`, `write_note` are the three tools.  
**Code reference:** `mcp_server.py` lines 58, 68, 85

---

### Q8. What is a resource?
**Short:** A read-only data source the AI can access by URI, like `file://notes/hello.md`.  
**Detailed:** No resources are implemented in this project. We could add them to expose each note as a readable MCP resource. Currently `resources/list` returns an empty list.  
**Code reference:** N/A — not implemented.

---

### Q9. What is a prompt?
**Short:** A reusable prompt template the server provides to AI clients.  
**Detailed:** Not implemented in this project. `prompts/list` returns empty.  
**Code reference:** N/A — not implemented.

---

### Q10. How does a tool get discovered?
**Short:** The client sends `tools/list` and the server responds with all registered tools and their JSON Schemas.  
**Detailed:** FastMCP maintains a tool registry. When `tools/list` is received, it iterates all registered tools and returns their names, descriptions (from docstrings), and input schemas (from type hints).  
**Code reference:** `@mcp.tool()` in `mcp_server.py` registers tools into FastMCP's internal registry.

---

### Q11. What happens during `tools/list`?
**Short:** Client asks "what can you do?", server replies with all tool names + schemas.  
**Detailed:** The MCP JSON-RPC call is `{"method": "tools/list", "params": {}}`. FastMCP returns: `{"result": {"tools": [{"name": "list_notes", "description": "...", "inputSchema": {...}}, ...]}}`.  
**Code reference:** Handled automatically by FastMCP. Visible in MCP Inspector under "Tools" tab.

---

### Q12. What happens when a tool is called?
**Short:** Client sends `tools/call` with the tool name and arguments → server validates → runs the Python function → returns result.  
**Detailed:** JSON-RPC `{"method": "tools/call", "params": {"name": "write_note", "arguments": {"name": "demo", "content": "hello"}}}` → FastMCP validates against the input schema → calls `write_note("demo", "hello")` → result is `"saved demo"` → MCP response `{"result": {"content": [{"type": "text", "text": "saved demo"}]}}`.  
**Code reference:** `write_note()` in `mcp_server.py` line 86.

---

### Q13. What protocol does MCP use?
**Short:** JSON-RPC 2.0 — a standard for remote procedure calls using JSON messages.  
**Detailed:** Every MCP message is a JSON object with `jsonrpc: "2.0"`, `id`, `method`, and `params`. This is the same protocol Ethereum uses for its node API.  
**Code reference:** Visible in `test_mcp_http.py` — we manually send a `{"jsonrpc": "2.0", "method": "initialize", ...}` POST.

---

### Q14. What transport are you using?
**Short:** Two transports: Streamable HTTP (via FastAPI) and STDIO (when run directly).  
**Detailed:** FastAPI mounts the MCP server at `/mcp/` for Streamable HTTP. Running `python -m app.mcp_server` triggers `mcp.run()` which defaults to STDIO. The Inspector command in README uses STDIO.  
**Code reference:** `main.py` line: `app.mount("/mcp", mcp.streamable_http_app())`. `mcp_server.py` line 108: `mcp.run()`.

---

### Q15. Why are you using STDIO for the Inspector command?
**Short:** The `npx @modelcontextprotocol/inspector uv run python -m app.mcp_server` command tells the Inspector to launch the server as a subprocess and communicate via pipes — that is STDIO transport.  
**Detailed:** STDIO is simpler for development — no need to start a separate server first. The Inspector handles starting the process and wiring up the stdin/stdout pipes automatically.  
**Code reference:** `api/README.md` — the Inspector command.

---

### Q16. Why can the browser not directly talk to a STDIO process?
**Short:** Browsers have no API to launch local processes or access stdin/stdout. They can only make HTTP requests.  
**Detailed:** STDIO transport is a process-level communication mechanism. Browsers are sandboxed — they cannot fork subprocesses. This is why we have the FastAPI REST layer as an HTTP bridge for the dashboard.  
**Code reference:** `frontend/src/lib/mcpApi.ts` — the browser uses `fetch()` to call REST endpoints.

---

### Q17. How does MCP Inspector connect?
**Short:** Either by launching the server as a subprocess (STDIO) or by connecting to the Streamable HTTP URL.  
**Detailed:** With the README command, Inspector starts `python -m app.mcp_server` and connects via STDIO. Alternatively, point Inspector at `http://localhost:8000/mcp/` to connect to the running FastAPI server over Streamable HTTP.  
**Code reference:** `api/README.md`.

---

### Q18. What does "Connected" mean in Inspector?
**Short:** The MCP `initialize` handshake succeeded — the client and server have agreed on protocol version and capabilities.  
**Detailed:** The Inspector sent `{"method": "initialize", "params": {"protocolVersion": "2024-11-05", ...}}` and received a valid response with the server name "polaris" and capabilities. Only after this can tools be listed and called.  
**Code reference:** `test_mcp_http.py` tests exactly this handshake.

---

### Q19. How did you test your server?
**Short:** Three ways: the official MCP Inspector graphically, pytest unit tests for the tool functions, and an HTTP transport test.  
**Detailed:** `test_mcp_tools.py` calls the Python functions directly (no HTTP). `test_mcp_http.py` sends the `initialize` JSON-RPC message over HTTP. `test_notes_api.py` tests the REST bridge route functions. 17 tests total, all passing.  
**Code reference:** `api/tests/` directory.

---

### Q20. What happens if the tool receives invalid input?
**Short:** `_safe()` raises `ValueError`. FastMCP catches it and returns an MCP error response. The REST layer catches it and returns HTTP 400.  
**Detailed:** For `read_note("../etc/passwd")`: `_safe()` regex fails immediately → `ValueError` raised → FastMCP wraps it in `{"isError": true, "content": [...]}`. Via REST: `api_read_note("../etc/passwd")` → `ValueError` → `HTTPException(400, detail="invalid note name: '../etc/passwd'")`.  
**Code reference:** `_safe()` in `mcp_server.py` lines 37–50. `api_read_note()` in `routes/notes.py` lines 51–58.

---

### Q21. How do you prevent path traversal?
**Short:** Two layers: strict allowlist regex, then `resolve()` + parent directory check.  
**Detailed:** `re.fullmatch(r"[A-Za-z0-9_-]{1,64}", name)` rejects anything with `..`, `/`, `%`, etc. Then `(NOTES_DIR / f"{name}.md").resolve()` canonicalises the path (follows symlinks, resolves `..`), and we check `NOTES_DIR.resolve() in candidate.parents`. Even if the regex were bypassed somehow, the path check would catch it.  
**Code reference:** `_safe()` in `mcp_server.py` lines 37–50.

---

### Q22. How does your frontend get real metrics?
**Short:** The `NotesPanel` component calls `mcpApi.ts` which calls `GET /api/notes` and `GET /api/mcp/info` on the FastAPI server.  
**Detailed:** `NotesPanel` on mount calls `loadNotes()` (GET /api/notes → Python `list_notes()`) and `loadMcpInfo()` (GET /api/mcp/info → FastMCP tool registry). Results are stored in React state and rendered. Loading/error/empty states are all handled.  
**Code reference:** `frontend/src/components/dashboard/NotesPanel.tsx`. `frontend/src/lib/mcpApi.ts`.

---

### Q23. Why shouldn't React directly implement MCP protocol logic?
**Short:** The MCP protocol is stateful (requires `initialize`, session management) and not HTTP-native. Browsers use `fetch()` — not MCP sessions.  
**Detailed:** MCP requires a stateful session — you must `initialize` first, then make calls within that session. This is not how browsers work. Also, the MCP SDK is Python/Node — not available in the browser. The REST layer is the correct separation.  
**Code reference:** `frontend/src/lib/mcpApi.ts` — uses simple `fetch()`. No MCP SDK.

---

### Q24. Why do you need a backend/API layer?
**Short:** To bridge the stateful MCP protocol and the stateless HTTP world the browser lives in.  
**Detailed:** The FastAPI REST layer (`routes/notes.py`) translates simple HTTP GET/POST requests into calls on the Python MCP tool functions. It also handles HTTP error codes (400, 404) properly.  
**Code reference:** `api/app/routes/notes.py`.

---

### Q25. What is the difference between MCP and REST?
**Short:** REST is stateless HTTP for browsers. MCP is a stateful JSON-RPC protocol for AI models.  
**Detailed:** See the comparison table in `MCP_IMPLEMENTATION.md` Section 11.  
**Code reference:** `api/app/routes/notes.py` (REST), `api/app/mcp_server.py` (MCP).

---

### Q26. What happens if the MCP server crashes?
**Short:** The FastAPI health endpoint returns 500. The frontend `NotesPanel` shows "Unable to load live metrics. Check the API connection."  
**Detailed:** If the uvicorn process crashes, all `/api/*` and `/mcp/` calls fail. The frontend `loadNotes()` catches the network error and sets `loadState: 'error'`, rendering the error state.  
**Code reference:** `mcpApi.ts` → `apiFetch()` try/catch. `NotesPanel.tsx` — error state rendering.

---

### Q27. How do you handle errors?
**Short:** Four layers: Python validation (`_safe()`), FastMCP MCP error response, FastAPI HTTP error response, React error state.  
**Detailed:** Python: `_safe()` raises `ValueError`. FastMCP: catches and returns `isError: true`. REST: catches and returns HTTP 400/404. Frontend: `apiFetch()` throws, `loadNotes()` catches and sets error state, component renders error UI.  
**Code reference:** `mcp_server.py`, `routes/notes.py`, `mcpApi.ts`, `NotesPanel.tsx`.

---

### Q28. How would you deploy this?
**Short:** Docker containers — one for FastAPI (Python MCP), one for Node.js auth, one for nginx serving the React build.  
**Detailed:** FastAPI with Gunicorn+uvicorn workers, Node with PM2, React built to static files served by nginx. Nginx reverse-proxies `/api/*` to FastAPI and `/api/auth/*` to Node. Add TLS, secrets management, and a proper database.  
**Code reference:** Currently no Dockerfile — future work.

---

### Q29. How would you secure it?
**Short:** Add authentication middleware to the MCP endpoint, use HTTPS, store notes in a proper database, add rate limiting.  
**Detailed:** For the MCP endpoint: API key middleware or OAuth2. For notes storage: PostgreSQL instead of filesystem. For transport: HTTPS via nginx TLS termination. For the frontend: refresh tokens, not just short-lived JWTs.  
**Code reference:** `authMiddleware.js` shows the pattern for auth middleware already implemented for auth routes.

---

### Q30. How would you add another tool?
**Short:** Write a Python function and add `@mcp.tool()` — that's it. The schema, Inspector support, and HTTP transport are automatic.  
**Detailed:** Example — add `delete_note`:
```python
@mcp.tool()
def delete_note(name: str) -> str:
    """Delete a note."""
    path = _safe(name)
    if not path.exists():
        raise FileNotFoundError(name)
    path.unlink()
    return f"deleted {name}"
```
Then add a corresponding `DELETE /api/notes/{name}` REST endpoint and a delete button in `NotesPanel.tsx`.  
**Code reference:** `mcp_server.py` — follow the same pattern as `write_note`.

---

### Q31. How would you add authentication?
**Short:** Add FastAPI dependency injection (`Depends(require_auth)`) on the REST router and an API key header check on the MCP endpoint.  
**Detailed:** For REST: use `authMiddleware.js` pattern ported to Python — JWT validation as a FastAPI dependency. For MCP: FastMCP supports custom middleware/hooks, or wrap the session manager with auth checks.  
**Code reference:** `backend/middleware/authMiddleware.js` — already implemented for auth routes.

---

### Q32. How would you scale it?
**Short:** Run multiple uvicorn workers behind a load balancer, use a shared database (not filesystem) for notes.  
**Detailed:** The current filesystem storage is local — won't work with multiple workers. Replace with PostgreSQL + SQLAlchemy. For the MCP session state, use Redis for session management across workers. Use nginx upstream load balancing.  
**Code reference:** `api/app/mcp_server.py` — `NOTES_DIR` would become a DB query.

---

### Q33. How would an AI assistant use this MCP server?
**Short:** Connect to it with an MCP client, call `tools/list` to discover tools, then call `write_note` to save context and `list_notes`/`read_note` to retrieve it.  
**Detailed:** An AI like Claude could use this as a "memory" system — saving important facts as notes with `write_note`, and reading them back later with `read_note`. Because MCP schemas are machine-readable, the AI can decide which tool to call and with what arguments from the schema alone.  
**Code reference:** `mcp_client.py` shows exactly this workflow.

---

### Q34. How does tool schema help an AI?
**Short:** The AI reads the JSON Schema to know what inputs are required and what the tool does — without needing human-written documentation.  
**Detailed:** FastMCP generates schemas like: `{"name": "write_note", "description": "Create or overwrite a note.", "inputSchema": {"type": "object", "properties": {"name": {"type": "string"}, "content": {"type": "string"}}, "required": ["name", "content"]}}`. The AI can extract field names, types, and the description, then decide to call it correctly.  
**Code reference:** Type hints on `write_note(name: str, content: str)` in `mcp_server.py`.

---

### Q35. What is discoverability in MCP?
**Short:** Any MCP client can call `tools/list` and immediately know all available tools without reading any docs.  
**Detailed:** This is MCP's key advantage over REST. A REST API requires a human to read documentation. An MCP server tells you its capabilities automatically. This is how AI models can use tools they've never seen before.  
**Code reference:** `tools/list` response — visible in MCP Inspector after connecting.

---

### Q36. What are the limitations of your current implementation?
**Short:** No auth on MCP endpoint, filesystem storage (not scalable), no HTTPS, in-memory user database.  
**Detailed:**
1. MCP endpoint at `/mcp/` is open — anyone on localhost can call tools
2. Notes stored as local files — won't scale across servers
3. User database is an in-memory array — reset on server restart
4. No HTTPS
5. Google Client ID hardcoded in frontend
6. No note size limits  
**Code reference:** `authController.js` line 7: `const usersDB = []`.

---

### Q37. What would you improve next?
**Short:** Add database persistence for notes and users, add auth on the MCP endpoint, add HTTPS.  
**Detailed:** Priority order: (1) PostgreSQL for notes and users, (2) JWT middleware on `/api/notes` routes, (3) Docker setup, (4) HTTPS with Let's Encrypt, (5) MCP prompt templates, (6) MCP resources for individual notes.  
**Code reference:** Entire `api/` and `backend/` — these are the areas to improve.

---

### Q38. What did MCP Inspector help you debug?
**Short:** It confirmed the MCP protocol was working — CONNECTED status, all three tools listed, tool invocations returning correct results.  
**Detailed:** Without Inspector, you would have to write a client to test the server. Inspector gave immediate visual feedback: (1) confirmed `initialize` worked, (2) showed all tools with their schemas, (3) let me invoke each tool and see raw JSON-RPC requests/responses.  
**Code reference:** MCP Inspector — `npx @modelcontextprotocol/inspector uv run python -m app.mcp_server`.

---

### Q39. Explain one complete request from frontend to MCP.
**Short:** User creates note → React calls `writeNote()` → `mcpApi.ts` → POST `/api/notes/hello` → FastAPI → Python `write_note()` → file saved.  
**Detailed:** See Section 10 in `MCP_IMPLEMENTATION.md` — the 14-step flow.  
**Code reference:** `NotesPanel.tsx` → `mcpApi.ts` → `routes/notes.py` → `mcp_server.py`.

---

### Q40. Show me where MCP is implemented in your code.

**Step by step:**

1. Open `api/app/mcp_server.py`
2. Show line 28: `mcp = FastMCP("polaris")` — "This creates the MCP server"
3. Show lines 58–65: `@mcp.tool() def list_notes()` — "This registers the first tool"
4. Show lines 37–50: `def _safe(name)` — "This is the security validator"
5. Open `api/app/main.py`
6. Show line: `app.mount("/mcp", mcp.streamable_http_app())` — "This exposes MCP over HTTP"
7. Run: `npx @modelcontextprotocol/inspector uv run python -m app.mcp_server`
8. In Inspector: Connect → see CONNECTED
9. Click "Tools" → see list_notes, read_note, write_note
10. Click `write_note` → fill name="demo", content="hello" → Run
11. Click `list_notes` → Run → see ["demo"] in the response
12. In browser: open `http://localhost:5173/dashboard`
13. Scroll to "MCP NOTES" panel → see real data loaded from the backend
14. Show network tab: `GET http://localhost:8000/api/notes` → response: `["demo"]`

---

## 7. Commands Cheat Sheet

```bash
# ── Python API (MCP + REST) ──────────────────────────────────────────
cd api

# Install dependencies
uv sync

# Start FastAPI + MCP server
uv run uvicorn app.main:app --reload --port 8000

# Start MCP Inspector (STDIO transport)
npx @modelcontextprotocol/inspector uv run python -m app.mcp_server

# Test the Python MCP client (FastAPI must be running)
uv run python -m app.mcp_client

# Run all tests
uv run pytest tests/ -v

# Lint
uv run ruff check app/

# ── Node.js Auth Backend ──────────────────────────────────────────────
cd backend

# Install
npm install

# Start
npm run dev

# ── React Frontend ───────────────────────────────────────────────────
cd frontend

# Install
npm install

# Start dev server
npm run dev

# Type check
npx tsc --noEmit

# Build production bundle
npm run build

# ── Quick health checks ──────────────────────────────────────────────
curl http://localhost:8000/health
curl http://localhost:8000/api/notes
curl http://localhost:8000/api/mcp/info
curl http://localhost:5001/api/health
```
