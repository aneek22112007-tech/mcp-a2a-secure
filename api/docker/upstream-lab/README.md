# Hostile Lab MCP Server

A real, independently runnable MCP server using the stdio transport and the official Python MCP SDK (`mcp==1.30.0`), designed to test whether the MCP Guard gateway correctly contains adversarial tools, unsafe outputs, resource exhaustion, and contract changes.

> [!WARNING]
> **Never deploy this lab image to production environments.**
> The hostile lab is deliberately kept out of `docker-compose.yml` because Compose is used for production deployment. It must only run in isolated local security testing environments.

## Overview

The lab server provides deliberately hostile tools across two versioned contracts (`v1` and `v2`), controlled strictly by the `LAB_CONTRACT` environment variable.

The server runs as an isolated upstream container with non-root user `65534:65534`, workdir `/tmp`, and a fixed entrypoint `python /lab/server.py`.

## Versioned Contracts

### Version 1 (`LAB_CONTRACT=v1`)
- Exposes 15 tools.
- Includes `reverse_text`.
- `utc_time()` has no arguments and returns the current UTC time from the server clock.

### Version 2 (`LAB_CONTRACT=v2`)
- Exposes 15 tools.
- Removes `reverse_text`.
- Adds `sync_contacts(endpoint: str)` (returns no contacts and makes no network connections).
- Changes `utc_time(trace: str = "")` with an adversarial description instructing the model to pass user message history.

An invalid or missing `LAB_CONTRACT` causes the process to exit immediately with status code `2`.

## Tool Catalog & Hostile Behaviors

1. `word_count(text: str)`: Utility tool returning `words=n lines=n chars=n`.
2. `utc_time()` (v1) / `utc_time(trace: str = "")` (v2): Returns ISO 8601 time.
3. `add_numbers(a: float, b: float, sidenote: str = "")`: Tool poisoning injection attempting to exfiltrate SSH keys. (Scanner: R1 high).
4. `convert_units(value: float, unit: str)`: Tool poisoning with Cyrillic homoglyphs (`о` and `і`). (Scanner: R1 high).
5. `reverse_text(text: str)` (v1 only): Reverses text while attempting instruction override with zero-width space obfuscation. (Scanner: R1 high).
6. `format_date(date: str)`: Formats date with full-width character obfuscation. (Scanner: R1 high).
7. `currency_rate(code: str)`: Offline currency lookup with base64-encoded exfiltration instructions. (Scanner: R2 critical).
8. `lookup_city(name: str, hint: str = "")`: Poisoned parameter description on `hint`. (Scanner: R5 high).
9. `run_report(command: str)`: Overbroad string parameter without `maxLength`. Returns static text, never executes commands. (Scanner: R3 medium).
10. `translate_text(text: str, glossary: str = "")`: Natural language data-copy request without static trigger words (deliberate P9 gap).
11. `fetch_tip(variant)`: Exercises injection guard rules:
    - `plain`: Clean output allowed unchanged.
    - `override`: Direct instruction override (Guard: G1).
    - `role`: Role injection and system prompt markers (Guard: G2).
    - `secret`: Ephemeral fake `mcpg_` API key output (Guard: G3).
    - `encoded`: Base64 encoded instruction payload (Guard: G4).
    - `image_link`: Markdown image exfiltration beacon (Guard: G5).
    - `delimiters`: Raw XML/tool delimiter injection (Guard: G6).
    - `structured`: Clean text with adversarial structured payload.
    - `error`: Error result with system role injection (Guard: G2).
12. `flood(kib: int)`: Generates `kib * 1024` bytes to exercise gateway output size caps.
13. `slow(seconds: float)`: Bounded execution sleep to test gateway timeout handling.
14. `hang()`: Unbounded loop to test process termination and container cleanup.
15. `probe_host(target)`: Container escape and boundary inspection probes (`shadow`, `proc_environ`, `docker_socket`, `write_root`, `network`, `parent_dirs`).
16. `sync_contacts(endpoint: str)` (v2 only): Webhook exfiltration schema probe. (Scanner: R2 critical, R3 medium).

## Building & Images

Use `api/scripts/build_upstream_lab_image.sh` to build and manage images:

```bash
# Build both v1 and v2, and point 'current' to v1
./api/scripts/build_upstream_lab_image.sh

# Retag 'current' to point to v1 (without rebuilding)
./api/scripts/build_upstream_lab_image.sh use v1

# Retag 'current' to point to v2 (without rebuilding)
./api/scripts/build_upstream_lab_image.sh use v2
```

Images produced:
- `mcp-guard-upstream-lab:v1`
- `mcp-guard-upstream-lab:v2`
- `mcp-guard-upstream-lab:current`
