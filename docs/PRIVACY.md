# Privacy

MCP Guard is a gateway in front of MCP tools. This note says what the gateway stores. It is the privacy policy linked from the sign-up page. The software license is in `LICENSE` at the root of the repository.

## What is stored

- **Accounts.** Sign-in and sign-up are handled by the existing auth service. This document does not change that service. Passwords are not written into the gateway audit log.
- **API keys.** A key is shown once at creation. The gateway stores a hash and a short prefix, not the secret.
- **Audit log.** Tool calls and auth decisions are recorded with the route, the tool name, a hash of the arguments, the key prefix, and the decision. Argument values and `Authorization` headers are not stored. Client IP addresses are stored for the same retention period as the rest of the audit row.
- **Notes.** Note text is stored as files under the notes directory on the host that runs the API.
- **Sandbox runs.** Each tool run records the tool name, the container image, the mode, timing, and an error type. It does not record file contents.

## What is not done

The gateway does not sell data, and it does not use tool arguments or note text to train a model. LLM calls run only when `LLM_ENABLED` is turned on, and then only to the configured local or fallback model.

## Retention

Audit rows, sandbox runs, and LLM call records are kept for the retention periods in the API settings (`AUDIT_RETENTION_DAYS`, `SANDBOX_RUN_RETENTION_DAYS`, `LLM_CALL_RETENTION_DAYS`). Operators delete a key with `DELETE /api/keys/{id}`. Deleting a key does not erase audit rows that already name its prefix.

## Contact

Questions about a deployment go to the operator of that deployment. This repository does not run a hosted service.
