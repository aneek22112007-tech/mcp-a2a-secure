## Running the API

Ensure dependencies are installed via `uv sync`.

Run the API from this directory so log lines include the request id:

```bash
uv run uvicorn app.main:app --log-config log_config.json
```

Records created outside a request use `rid=-`.

- **Stdio Inspector**: `npx @modelcontextprotocol/inspector uv run python -m app.mcp_server`
- **Test Client** (Run while FastAPI is active): `uv run python -m app.mcp_client`
