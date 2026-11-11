# Privacy

MCP Guard is a gateway that sits in front of MCP tools. This page lists what it stores and where data goes. The sign-up page links here. The software licence is in `LICENSE` at the root of the repository.

## What is stored

- **Accounts.** The sign-in service in `backend/` keeps accounts in memory only: email, a bcrypt hash of the password, and for Google sign-in the name and picture URL. Accounts are lost when that service restarts. A signed session token is set as an HTTP-only cookie for one hour.
- **API keys.** A key looks like `mcpg_<prefix>_<secret>` and is shown once, when it is created. The gateway stores the 8-character prefix and an HMAC-SHA256 hash of the secret part made with the server pepper, never the raw key. It also stores the key name, scopes, and created, expiry, last-used and revoked times. Revoking a key with `DELETE /api/keys/{id}` sets `revoked_at`; the row is kept.
- **Audit log.** Each request and tool call records the request id, client IP, key prefix, action, tool name, decision and reason, status, timing, and a hash of the arguments. Argument values and `Authorization` headers are not stored.
- **Sandbox runs.** Each tool run records the tool name, mode, image, status, timing, output size, error type and exit code, with the same request id, key prefix and argument hash. Tool output is not stored.
- **LLM calls.** Each model call records the purpose, provider, model, status, latency, token counts, whether it fell back, and any error. Prompts and replies are not stored in this table.
- **Analyst reports.** A row is stored only after the reply passes the checks. `body` is that validated JSON, not the raw model text. The row also stores the incident id, kind, severity, event fingerprint, event count, how many fields were withheld, provider, model, whether it fell back, latency, the explain request id, the caller key prefix, and the time. It does not store client IPs, argument values, or raw keys.
- **A2A tasks.** An agent-to-agent task stores the task text, the result or error, the delegated scopes, the manager and worker key prefixes, and its times.
- **Notes.** Note text is stored as files in the notes folder (`NOTES_DIR`, by default `api/data/notes/`) on the machine that runs the API.
- **Tool pins and scanner findings.** Tool fingerprints, approval details, and scanner findings about tool descriptions.

## Where data goes

Everything stays on the machine running MCP Guard, with one exception. When `LLM_ENABLED=true`, the agents send their prompts, which can include note text and task text, to the local Ollama model. The incident analyst sends a smaller document: action names, status codes, reasons, tool names, and key prefixes. It does not send client IPs, client ids, key ids, argument hashes, request ids, or raw keys. If Ollama is not reachable and `GROQ_API_KEY` is set, those prompts, including that incident document, go to Groq's hosted API instead. Nothing is sold or used to train a model.

## Retention

`AUDIT_RETENTION_DAYS` (default 90), `SANDBOX_RUN_RETENTION_DAYS` (default 90) and `LLM_CALL_RETENTION_DAYS` (default 30) set how long audit rows, sandbox runs and LLM call rows are kept. Analyst reports use `LLM_CALL_RETENTION_DAYS` as well. Old rows are deleted only when `ENABLE_RETENTION_SCHEDULER=true`. An operator can also run `scripts/prune_audit.py`, which deletes old audit rows and sandbox runs but not LLM call rows or analyst reports. Otherwise rows are kept. Notes, API keys, A2A tasks and tool pins have no automatic retention.

## Contact

This repository does not run a hosted service. Questions about a deployment go to whoever runs it.
