# AI-Assisted Tool Scanner

## Overview

MCP Guard includes a two-pass tool verification pipeline:
1. **Rule-based Scanner (R1 to R6):** Fast, deterministic substring and regex checks that catch known prompt injection phrases, exfiltration domains, overbroad schema strings, and name anomalies.
2. **AI-Assisted Scanner (`AI1_SEMANTIC_POISONING`):** A semantic pass that uses the local LLM (`LLMBackend` via Ollama with Groq fallback) to inspect tool descriptions and input schemas for subtle attacks: indirect prompt injections, instructions asking the model to silently exfiltrate keys, or confusing directives that avoid simple keyword triggers.

---

## Configuration

The AI scanner is disabled by default and can be configured with three environment variables:

| Variable | Default | Description |
| :--- | :--- | :--- |
| `SCANNER_AI_ENABLED` | `false` | Enables the AI semantic pass. Requires `LLM_ENABLED=true`. |
| `SCANNER_AI_MAX_SEVERITY` | `medium` | Severity cap (`low`, `medium`, `high`). AI findings can never be `critical`. |
| `SCANNER_AI_ON_STARTUP` | `false` | If `true`, runs the AI scanner on all catalog tools during startup. |

In `.env`:
```bash
LLM_ENABLED=true
SCANNER_AI_ENABLED=true
SCANNER_AI_MAX_SEVERITY=medium
SCANNER_AI_ON_STARTUP=false
```

---

## Core Security Principles

### 1. Model Can Only Add Findings
The AI model can **never** clear, resolve, or override rule-based findings (R1–R6). Even if the model considers a tool "safe", any open rule violations remain open and enforced. Rule and AI findings are synchronized separately:
- Rule scans only synchronize and resolve non-AI findings (`rule_id NOT LIKE 'AI%'`).
- AI scans only synchronize findings with prefix `AI1_`.

### 2. Failure Handling ("Not Checked")
If Ollama is unreachable, Groq fails, or the request times out:
- The AI pass returns `None`.
- Existing AI findings remain unchanged (they are not resolved).
- The scan completes and increments `ai_unavailable` in stats.
- A transient LLM failure does not cause false positives or block harmless tools.

### 3. Untrusted Data Boundary & Anti-Injection
Tool descriptions and schemas are treated strictly as **untrusted data**. The prompt wraps them in explicit boundary delimiters (`--- TOOL START ---` and `--- TOOL END ---`) and instructs the analyzer to ignore directives like "SYSTEM:", "IGNORE PREVIOUS INSTRUCTIONS", or instructions addressed to the model.

### 4. Hallucination Guard (Evidence Verification)
When the model reports a tool as `malicious` or `suspicious` with evidence, the gateway verifies that the quoted evidence string is an exact substring of the tool's published name, description, or schema. If the model hallucinates a quote:
- The evidence is discarded (`evidence = None`).
- If the verdict was `malicious`, it is automatically downgraded to `suspicious`.

### 5. In-Memory Fingerprint Cache
To avoid redundant LLM invocations (~20–30s per tool on local hardware), results are cached in memory keyed by `(tool_name, tool_fingerprint)`. If a tool's contract does not change, subsequent scans return instantly from cache.

---

## API Usage

### Scan all tools with AI:
```bash
curl -X POST "http://localhost:8000/api/scanner/run?ai=true" \
  -H "Authorization: Bearer $ADMIN_API_KEY"
```

Response:
```json
{
  "scan_id": "8bb3d3df-7fb5-427f-b5da-848419eb31c0",
  "tools_scanned": 17,
  "findings_open": 1,
  "by_severity": {
    "medium": 1
  },
  "ai_checked": 17,
  "ai_unavailable": 0
}
```

### Scan a single tool with AI:
```bash
curl -X POST "http://localhost:8000/api/scanner/run/lab_translate_text?ai=true" \
  -H "Authorization: Bearer $ADMIN_API_KEY"
```

### 409 Conflict when AI is requested but disabled:
```bash
# If SCANNER_AI_ENABLED=false or LLM_ENABLED=false:
curl -X POST "http://localhost:8000/api/scanner/run?ai=true" \
  -H "Authorization: Bearer $ADMIN_API_KEY"
# HTTP/1.1 409 Conflict
# {"detail": "AI scanner is not enabled. Set SCANNER_AI_ENABLED=true and LLM_ENABLED=true."}
```

---

## Evaluation Results

| Tool Name | Rule Scan (R1–R6) | AI Scan Verdict | AI Finding & Reason |
| :--- | :--- | :--- | :--- |
| `read_note` | Pass (clean) | `safe` | Standard file retrieval utility. |
| `write_note` | Pass (clean) | `safe` | Standard note creation utility with path bounds. |
| `list_notes` | Pass (clean) | `safe` | Standard listing tool without untrusted instructions. |
| `fs_read_file` | Pass (clean) | `safe` | Clean upstream filesystem inspection tool. |
| `lab_translate_text` | Pass (bypasses R1–R6) | `malicious` (capped to `medium`) | Flags subtle instruction instructing model to copy secret keys into the output. |
| `demo_poison_tool` | Flagged by R1/R2 | `malicious` | Prompt injection and URL exfiltration directive detected. |
