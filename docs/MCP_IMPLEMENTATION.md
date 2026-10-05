# MCP Implementation in This Project

> **Project:** mcp-a2a-secure — a secure AI agent dashboard with live MCP integration  
> **Author:** Aneek  
> **MCP Server:** MCP Guard (Python / FastMCP)

---

## 1. What is MCP?

### Simple explanation

Imagine you have a smart AI assistant (like Claude or ChatGPT). You want it to read your files, write notes, or search your database. Without MCP, every AI app would connect to these systems in its own custom, incompatible way.

**MCP (Model Context Protocol)** is a standard that says: *"Here is a universal language for AI models to discover and call tools, read resources, and use prompts — regardless of which AI and which tool you are using."*

It is like **USB for AI tools** — one standard plug for everything.

### Technical explanation

MCP is an open protocol developed by Anthropic. It defines:
- A **JSON-RPC 2.0** message format
- A set of standardised **operations** (`tools/list`, `tools/call`, `resources/list`, `prompts/list`, etc.)
- A **client/server architecture** where the server exposes capabilities and the client (an AI or a test tool) discovers and uses them

### MCP vs REST API

| Aspect | REST API | MCP |
|---|---|---|
| Discovery | Manual (read docs) | Automatic (`tools/list`) |
| Schema | Ad-hoc per endpoint | Standardised JSON Schema per tool |
| Primary client | Browsers, mobile apps | AI models, MCP clients |
| Protocol | HTTP request/response | JSON-RPC over transport |
| State | Stateless | Stateful session (initialized first) |
| Tool invocation | `POST /api/action` | `tools/call` with schema-validated input |
| Purpose | General API access | AI model capability access |

This project uses **both**: MCP for AI/Inspector access, REST (FastAPI) for the browser dashboard.

---

## 2. Core MCP Concepts

### MCP Host
The **Host** is the environment that runs MCP clients. Examples: Claude Desktop, Cursor, the official MCP Inspector.  
*In this project:* The MCP Inspector (`npx @modelcontextprotocol/inspector`) is the host during development.

### MCP Client
The **Client** is the code inside the host that speaks the MCP protocol — it connects to a server, initialises a session, and calls tools.  
*In this project:* `api/app/mcp_client.py` is a programmatic Python MCP client. The Inspector is a graphical MCP client.

### MCP Server
The **Server** exposes tools, resources, and prompts over the MCP protocol.  
*In this project:* `api/app/mcp_server.py` — the **MCP Guard** server.

### Tools
**Tools** are functions the AI can call. Each tool has:
- A name
- An input schema (JSON Schema, auto-generated from Python type hints)
- A return value

*In this project:* `list_notes`, `read_note`, `write_note`.

### Resources
**Resources** are read-only data sources the AI can access (like files, database rows).  
*In this project:* **No resources are implemented.** The `resources/list` operation returns an empty list.

### Prompts
**Prompts** are reusable prompt templates the AI can request.  
*In this project:* **No prompts are implemented.** The `prompts/list` operation returns an empty list.

### Transport
**Transport** is how messages travel between client and server. Options:
- **STDIO** — client launches server as subprocess, communicates via stdin/stdout
- **Streamable HTTP** — server runs as HTTP endpoint, client sends JSON-RPC over HTTP POST and receives responses as SSE or plain JSON
- **SSE** — legacy Server-Sent Events transport

*In this project:* **Two transports are used:**
1. **Streamable HTTP** — when running via FastAPI (`uv run uvicorn app.main:app`), the MCP server is reachable at `http://localhost:8000/mcp/`. This is what the MCP Inspector uses.
2. **STDIO** — when running directly (`uv run python -m app.mcp_server`), FastMCP defaults to STDIO transport. This is what the Inspector command in the README runs.

### JSON-RPC / Protocol Communication
MCP messages are **JSON-RPC 2.0** objects:

```json
// Request (client → server)
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "list_notes",
    "arguments": {}
  }
}

// Response (server → client)
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [{ "type": "text", "text": "[\"demo\", \"hello\"]" }],
    "isError": false
  }
}
```

---

## 3. MCP Architecture in THIS PROJECT

```mermaid
graph TD
    A[Browser / User] -->|HTTP| B[React Dashboard :5173]
    A2[MCP Inspector / AI Model] -->|MCP Streamable HTTP| E

    B -->|GET/POST /api/*| C[FastAPI :8000]
    B2[Auth Flow] -->|POST /api/auth/*| D[Node.js Auth :5001]

    C -->|imports & calls directly| F[list_notes / read_note / write_note]
    E[/mcp/ endpoint] -->|MCP JSON-RPC| F

    F -->|reads/writes| G[(data/notes/*.md)]

    subgraph Python MCP Layer [api/ — Python FastAPI + FastMCP]
        C
        E
        F
        H[FastMCP — MCP Guard]
    end

    subgraph "Node Auth Layer (backend/)"
        D
    end

    subgraph "Frontend (frontend/)"
        B
    end
```

**Key insight:** The MCP tools (`list_notes`, `read_note`, `write_note`) are plain Python functions. They are registered with FastMCP as tools **and** called directly by the REST router. There is no logic duplication.

---

## 4. Folder Structure

```
mcp-a2a-secure/
│
├── api/                          ← Python MCP + REST server
│   ├── app/
│   │   ├── __init__.py
│   │   ├── config.py             ← Pydantic settings (app name, CORS, env)
│   │   ├── main.py               ← FastAPI app + mounts MCP + REST router
│   │   ├── mcp_server.py         ← FastMCP server: tools + security helper
│   │   ├── mcp_client.py         ← Programmatic Python MCP client demo
│   │   └── routes/
│   │       ├── __init__.py
│   │       └── notes.py          ← REST bridge: /api/notes, /api/mcp/info
│   ├── data/
│   │   └── notes/                ← Markdown note files (real data)
│   ├── tests/
│   │   ├── test_health.py        ← GET /health test
│   │   ├── test_mcp_http.py      ← MCP initialize via HTTP
│   │   ├── test_mcp_tools.py     ← Unit tests for MCP tool functions
│   │   └── test_notes_api.py     ← Unit tests for REST bridge functions
│   └── pyproject.toml            ← Python deps: fastapi, mcp, uvicorn
│
├── backend/                      ← Node.js auth service
│   ├── server.js                 ← Express app: /api/auth/*
│   ├── routes/authRoutes.js
│   ├── controllers/authController.js
│   └── middleware/authMiddleware.js
│
├── frontend/                     ← React/Vite dashboard
│   └── src/
│       ├── lib/
│       │   ├── api.ts            ← Auth API client (Node backend)
│       │   └── mcpApi.ts     ← MCP Guard MCP API client (FastAPI backend)
│       ├── components/dashboard/
│       │   ├── NotesPanel.tsx    ← REAL DATA — calls mcpApi.ts
│       │   └── ... (other components use mock data)
│       ├── store/dashboardStore.ts ← Zustand store, mostly mock data
│       └── data/dashboardMockData.ts ← Mock data for all other panels
│
└── docs/
    ├── MCP_IMPLEMENTATION.md     ← This file
    └── MCP_VIVA_NOTES.md         ← Mentor/viva Q&A
```

---

## 5. MCP Server Implementation — Line by Line

File: [`api/app/mcp_server.py`](../api/app/mcp_server.py)

### 5.1 Imports

```python
import re
from pathlib import Path
from mcp.server.fastmcp import FastMCP
```

| Import | Why |
|---|---|
| `re` | Used in `_safe()` to validate note names with a regex |
| `pathlib.Path` | Cross-platform filesystem path operations |
| `FastMCP` | The MCP server framework from the official `mcp` Python SDK |

**Mentor answer:** "We import FastMCP from the official Python MCP SDK. It lets us define tools using plain Python functions with type hints."

---

### 5.2 Storage directory

```python
NOTES_DIR = Path(__file__).parent.parent / "data" / "notes"
NOTES_DIR.mkdir(parents=True, exist_ok=True)
```

- `__file__` is `api/app/mcp_server.py`
- `.parent.parent` is `api/`
- So `NOTES_DIR` = `api/data/notes/`
- `mkdir(parents=True, exist_ok=True)` creates the directory if it doesn't exist — no error if it already exists

**Why:** MCP tools need somewhere to persist notes. We use the filesystem. In production, this would be a database.

---

### 5.3 Server initialisation

```python
mcp = FastMCP("mcp-guard")
mcp.settings.streamable_http_path = "/"
```

- `FastMCP("mcp-guard")` creates the MCP server instance named "mcp-guard"
- The name appears in the Inspector when you connect
- `streamable_http_path = "/"` means the Streamable HTTP endpoint will be at the root of where it is mounted — when mounted at `/mcp` in FastAPI, it responds at `/mcp/`

**Mentor answer:** "FastMCP is a high-level wrapper around the MCP SDK that lets us register tools with simple decorators instead of writing raw JSON-RPC handlers."

---

### 5.4 Security helper — `_safe()`

```python
def _safe(name: str) -> Path:
    return resolve_note_path(NOTES_DIR, name)
```

`_safe` is a wrapper. The checks live in `app/tools/notes.py`, which the sandbox image can run without the rest of the API:

Two layers of defence:

1. **Allowlist regex** — only `[A-Za-z0-9_-]`, 1–64 chars. Rejects `../`, `%2F`, spaces, null bytes.
2. **Path resolution check** — even if someone bypasses the regex, we `resolve()` the candidate (follows symlinks, collapses `..`) and verify it still lives inside `NOTES_DIR`.

**Why two checks?** A simple `".." in name` check is bypassable with encoded paths like `..%2F`. The `resolve()` check is the true security guarantee.

**Mentor answer:** "We validate note names with a strict allowlist regex AND verify the resolved path stays inside the notes directory. This prevents path traversal attacks."

---

### 5.5 Tool: `list_notes`

```python
@mcp.tool()
async def list_notes(ctx: Context | None = None) -> list[str]:
    """List saved notes. Returns the note names (without the .md suffix) sorted lexicographically."""
    return await run_tool("list_notes", {}, mcp_context=ctx)
```

- `@mcp.tool()` registers this function as an MCP tool
- FastMCP reads the return type and docstring to build the JSON Schema. `ctx` is a FastMCP context parameter and is left out of that schema
- The body does not touch the filesystem. `run_tool` runs `app.tools.notes.list_notes` in the sandbox. Names are the sorted stems of `*.md` files
- REST reaches the same function through `gateway._dispatch` → `mcp.call_tool`. MCP `tools/call` reaches it through FastMCP and never enters the gateway

**Input:** none
**Output:** `["apple", "demo", "hello"]` (sorted list of note names)
**Error cases:** sandbox unavailable (503 on REST), timeout (504 on REST)

---

### 5.6 Tool: `read_note`

```python
@mcp.tool()
async def read_note(name: str, ctx: Context | None = None) -> str:
    """Read one note. Args: name - The note name (without .md)."""
    return await run_tool("read_note", {"name": name}, mcp_context=ctx)
```

- The sandbox runner calls `validate_note_name` and `resolve_note_path`, then reads the file
- An invalid name becomes `ValueError`. A missing note becomes `FileNotFoundError("Note not found.")`
- FastMCP turns a tool exception into `str(exc)`, so sandbox failures use fixed messages

**Input:** `name: str` — note name, e.g. `"hello"`
**Output:** `str` — full Markdown content
**Error cases:** `ValueError` (invalid name), `FileNotFoundError` (not found), sandbox 503/504 on the REST gateway

---

### 5.7 Tool: `write_note`

```python
@mcp.tool()
async def write_note(name: str, content: str, ctx: Context | None = None) -> str:
    """Create or overwrite a note. Returns 'saved {name}'."""
    return await run_tool(
        "write_note",
        {"name": name, "content": content},
        mcp_context=ctx,
    )
```

- The sandbox runner validates `name`, creates the notes directory, and writes `{name}.md`
- Returns `saved {name}`
- The notes mount is read-write for this tool and read-only for `list_notes` and `read_note`
- Compose should set `SANDBOX_NOTES_SOURCE=volume:<name>` so the runner writes into a named volume instead of a host directory

**Input:** `name: str`, `content: str`
**Output:** `"saved hello"`
**Error cases:** `ValueError` (invalid name), sandbox unavailable, sandbox timeout

---

### 5.8 Entry-point

```python
if __name__ == "__main__":
    mcp.run()
```

When run directly (`python -m app.mcp_server`), FastMCP defaults to **STDIO transport**. This is what the MCP Inspector subprocess command uses.

When imported by `main.py`, `mcp.run()` is NOT called — instead `mcp.streamable_http_app()` is mounted as a FastAPI sub-application.

---

## 6. Every MCP Tool

### Tool 1: `list_notes`

| Property | Value |
|---|---|
| Tool name | `list_notes` |
| Purpose | List all saved notes |
| Input | None |
| Output type | `list[str]` |
| Output example | `["apple", "demo", "hello"]` |
| Error cases | OS read error (rare) |
| Defined in | `api/app/mcp_server.py` line 59 |

**Example MCP call via Inspector:**
```
Tool: list_notes
Arguments: {}
Response: ["demo", "hello"]
```

---

### Tool 2: `read_note`

| Property | Value |
|---|---|
| Tool name | `read_note` |
| Purpose | Read the content of one note |
| Input | `name: str` — note name without `.md` |
| Input validation | Regex + path resolution in `_safe()` |
| Output type | `str` |
| Output example | `"# Hello\nworld"` |
| Error — invalid name | `ValueError: invalid note name: '../x'` |
| Error — not found | `FileNotFoundError` |
| Defined in | `api/app/mcp_server.py` line 69 |

---

### Tool 3: `write_note`

| Property | Value |
|---|---|
| Tool name | `write_note` |
| Purpose | Create or overwrite a note |
| Input | `name: str`, `content: str` |
| Input validation | `name` validated via `_safe()` |
| Output type | `str` |
| Output example | `"saved hello"` |
| Error — invalid name | `ValueError: invalid note name: '../x'` |
| Defined in | `api/app/mcp_server.py` line 86 |

---

## 7. Resources

**No MCP resources are currently implemented.**

The `resources/list` MCP operation returns an empty list `[]`. Resources could be added in the future (e.g., exposing each note as a readable MCP resource at `notes://hello`), but this has not been built.

---

## 8. Prompts

**No MCP prompts are currently implemented.**

The `prompts/list` MCP operation returns an empty list `[]`. Prompts could be added in the future (e.g., a `summarize_note` prompt template), but this has not been built.

---

## 9. MCP Inspector

### What it is
The **MCP Inspector** is the official graphical debugging tool for MCP servers. It is provided by the MCP project team (`@modelcontextprotocol/inspector`). Think of it as Postman for MCP.

### How to start it
```bash
cd api
npx @modelcontextprotocol/inspector uv run python -m app.mcp_server
```

This command tells the Inspector to:
1. Launch `uv run python -m app.mcp_server` as a subprocess (STDIO transport)
2. Open a web UI (usually at `http://localhost:5173` or similar)

Alternatively, connect it to the running FastAPI server:
```bash
# Start the FastAPI server first:
uv run uvicorn app.main:app --reload --port 8000

# Then open Inspector and set URL to:
http://localhost:8000/mcp/
```

### What "Connected" means
When the Inspector shows **CONNECTED**, it has successfully:
1. Opened a transport connection
2. Sent the `initialize` JSON-RPC message
3. Received a valid `initialize` response with the server's capabilities

### How `tools/list` works
The Inspector sends:
```json
{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}
```
FastMCP responds with the schema of all registered tools — names, descriptions, and JSON Schema for inputs.

### How to invoke a tool
1. Click the tool name in Inspector
2. Fill in the input fields
3. Click "Run Tool"
4. See the raw request and response

---

## 10. Complete Request Flow

**Example: User types a new note on the dashboard**

```
1. User fills "New Note" form in NotesPanel (React component)
2. Clicks "Save Note"
3. NotesPanel calls: writeNote("hello", "# Hello\nworld")
4.   → mcpApi.ts: POST http://localhost:8000/api/notes/hello
                       body: {"content": "# Hello\nworld"}
5.     → FastAPI router (notes.py): api_write_note("hello", NoteBody(...))
6.       → gateway.call_tool("write_note", {"name": "hello", "content": "# Hello\nworld"})
7.         → write_note calls run_tool. Docker starts one container, or in-process mode runs app.tools.notes in a worker thread
8.           → the runner checks the name and writes hello.md under the notes mount (/notes in the container)
9.         → returns "saved hello"
10.      → REST router returns: {"name": "hello", "content": "# Hello\nworld"}
11.    → mcpApi.ts returns NoteDetail object
12.  → NotesPanel calls loadNotes() → refreshes list
13. → NotesPanel calls openNote("hello") → calls readNote("hello") → GET /api/notes/hello
14. → Dashboard shows the note content in the reader pane
```

The **same `write_note` function** is reachable via:
- REST: `PUT /api/notes/hello`, which enters through the gateway
- MCP: `tools/call { name: "write_note", arguments: { name: "hello", content: "..." } }`, which does not enter the gateway

Both paths call `run_tool`. With `SANDBOX_NOTES_SOURCE=volume:<name>`, Compose shares one named volume between the API and the runner. Unset, the container bind-mounts `NOTES_DIR`.

---

## 11. MCP vs REST API — Comparison

| Feature | REST (this project) | MCP (this project) |
|---|---|---|
| Endpoint | `GET /api/notes`, `POST /api/notes/:name` | `tools/call` → `list_notes`, `write_note` |
| Client | Browser (React) | MCP Inspector, AI model, `mcp_client.py` |
| Protocol | HTTP | JSON-RPC 2.0 over Streamable HTTP or STDIO |
| Discovery | Manual (know the URL) | Automatic (`tools/list` returns all tools + schemas) |
| Schema | Implicit (read the code) | Explicit JSON Schema per tool |
| Stateful? | No | Yes (requires `initialize` first) |
| Authentication | None currently | None currently |

**Why both?** The browser cannot maintain an MCP session — browsers are not MCP clients. We use REST for the browser dashboard and MCP for AI/Inspector access. The Python tool functions are shared.

---

## 12. Why MCP is Useful in This Project

1. **Standardised tool interface** — any MCP-compatible AI (Claude, GPT, Gemini) can connect and use the notes tools without custom integration.
2. **Discoverability** — `tools/list` exposes all capabilities with schemas. The AI does not need documentation.
3. **Schema-validated input** — FastMCP generates JSON Schema from Python type hints. The MCP client validates inputs before calling the tool.
4. **Inspector support** — the official MCP Inspector provides a zero-code way to test every tool.
5. **Separation of concerns** — MCP handles AI/tool protocol; REST handles browser/human protocol. Each serves its audience.
6. **Extensibility** — adding a new tool is one decorated Python function. The schema, Inspector support, and error handling are automatic.

---

## 13. Security

### IMPLEMENTED

| Security Measure | Where | How |
|---|---|---|
| Note name allowlist | `_safe()` in `mcp_server.py` | Regex `[A-Za-z0-9_-]{1,64}` |
| Path traversal prevention | `_safe()` in `mcp_server.py` | `resolve()` + parent check |
| CORS restriction | `main.py` | Only `http://localhost:5173` allowed |
| Password hashing | `authController.js` | bcrypt with salt rounds=10 |
| JWT auth | `authController.js` + `authMiddleware.js` | HS256, 1h expiry |
| HttpOnly cookies | `authController.js` | Prevents JS cookie access |

### FUTURE IMPROVEMENTS (not yet implemented)

- MCP endpoint authentication (currently open)
- HTTPS in production
- Rate limiting on MCP tool calls
- Input sanitisation on `content` field
- Note file size limits
- Audit logging of tool calls
- Secrets management (currently uses `.env` fallbacks)

---

## 14. Error Handling

| Scenario | Handled by | Response |
|---|---|---|
| Invalid note name (REST) | `_safe()` → `ValueError` → REST returns HTTP 400 | `{"detail": "invalid note name: '../x'"}` |
| Note not found (REST) | `FileNotFoundError` → REST returns HTTP 404 | `{"detail": "Note 'x' not found"}` |
| Invalid note name (MCP) | `_safe()` → `ValueError` → FastMCP returns MCP error | `{"isError": true, "content": [...]}` |
| Note not found (MCP) | `FileNotFoundError` → FastMCP returns MCP error | `{"isError": true, "content": [...]}` |
| API offline (frontend) | `mcpApi.ts` catch block | Component shows error state |
| Loading (frontend) | React state machine | Component shows "Loading live metrics…" |
| Empty notes (frontend) | Empty array check | Component shows "No notes available yet." |

---

## 15. Testing

### Test files

| File | What it tests | Count |
|---|---|---|
| `tests/test_health.py` | `GET /health` returns 200 + `{"status": "ok"}` | 1 |
| `tests/test_mcp_http.py` | MCP `initialize` over Streamable HTTP | 1 |
| `tests/test_mcp_tools.py` | `list_notes`, `read_note`, `write_note` as Python functions | 7 |
| `tests/test_notes_api.py` | REST bridge route functions directly | 8 |

### Run all tests
```bash
cd api
uv run pytest tests/ -v
```

Expected: **17 passed**

---

## 16. Production Considerations

> These are **future improvements**, not current implementation.

| Concern | Current state | Production fix |
|---|---|---|
| MCP auth | No auth | Add API key middleware or OAuth |
| HTTPS | HTTP only | TLS termination via nginx/load balancer |
| Process management | Manual uvicorn | systemd / Docker / Kubernetes |
| Notes storage | Local filesystem | PostgreSQL / S3 |
| Logging | Console only | Structured JSON logs (structlog) |
| Rate limiting | None | fastapi-limiter |
| Secrets | .env fallbacks | HashiCorp Vault / AWS Secrets Manager |
| CORS | localhost only | Domain-specific origin list |
| Users DB | In-memory array | PostgreSQL |

---

## Code-to-Concept Mapping

| Concept | File | Function / Class | What it does |
|---|---|---|---|
| MCP Server | `api/app/mcp_server.py` | `FastMCP("mcp-guard")` | Initialises the named MCP server |
| Tool registration | `api/app/mcp_server.py` | `@mcp.tool()` | Registers Python function as MCP tool |
| Tool: list notes | `api/app/mcp_server.py` | `list_notes()` | Returns sorted list of note names |
| Tool: read note | `api/app/mcp_server.py` | `read_note(name)` | Returns note content as string |
| Tool: write note | `api/app/mcp_server.py` | `write_note(name, content)` | Writes/overwrites a note file |
| Security validator | `api/app/mcp_server.py` | `_safe(name)` | Allowlist regex + path traversal check |
| FastAPI app | `api/app/main.py` | `app = FastAPI(...)` | Main ASGI app |
| MCP lifecycle | `api/app/main.py` | `lifespan()` | Starts/stops the session manager |
| MCP HTTP mount | `api/app/main.py` | `app.mount("/mcp", ...)` | Mounts MCP Streamable HTTP transport |
| REST bridge | `api/app/routes/notes.py` | `api_list_notes()` etc. | HTTP endpoints calling MCP tool functions |
| MCP info endpoint | `api/app/routes/notes.py` | `api_mcp_info()` | Returns live server/tool metadata |
| Storage | `api/data/notes/` | `.md` files | Persisted note files |
| Frontend API client | `frontend/src/lib/mcpApi.ts` | `listNotes()` etc. | Typed HTTP client for REST bridge |
| Live dashboard panel | `frontend/src/components/dashboard/NotesPanel.tsx` | `NotesPanel` | Only component with real data |
| MCP client (demo) | `api/app/mcp_client.py` | `main()` | Programmatic Python MCP client |
| Inspector | CLI | `npx @modelcontextprotocol/inspector` | Graphical MCP test/debug tool |
