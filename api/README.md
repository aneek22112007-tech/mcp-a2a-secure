## Running the API

Ensure dependencies are installed via `uv sync`.

- **FastAPI Server**: `uv run uvicorn app.main:app --reload --port 8000`
- **Stdio Inspector**: `npx @modelcontextprotocol/inspector uv run python -m app.mcp_server`
- **Test Client** (Run while FastAPI is active): `uv run python -m app.mcp_client`
