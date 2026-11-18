"""AI-assisted scanner pass.

Uses LLMBackend to analyze tool descriptions and input schemas for semantic
risks that rule-based scanners miss (e.g. social engineering, credential requests,
hidden instructions).
"""

from __future__ import annotations

import json
import logging

from langchain_core.messages import HumanMessage, SystemMessage

from app.config import settings
from app.llm.backend import LLMBackend, LLMDisabledError, LLMUnavailableError
from app.scanner.ai_prompt import build_scanner_prompt
from app.scanner.types import ScannerFinding, Severity
from app.tools.catalog import ToolDefinition, fingerprint_tool

logger = logging.getLogger(__name__)

RULE_ID_AI = "AI1_SEMANTIC_POISONING"

_cache: dict[tuple[str, str], list[ScannerFinding]] = {}


def clear_ai_cache() -> None:
    """Clear the in-memory AI scan cache."""
    _cache.clear()


def _cap_severity(severity: Severity) -> Severity:
    ranks: dict[str, int] = {"low": 1, "medium": 2, "high": 3, "critical": 4}
    max_sev = settings.scanner_ai_max_severity
    max_rank = ranks.get(max_sev, 2)
    current_rank = ranks.get(severity, 2)
    if current_rank > max_rank:
        return max_sev
    return severity


def _evidence_in_sent_text(
    evidence: str, name: str, safe_desc: str, safe_schema: str
) -> bool:
    """Check if the quoted evidence appears in the exact text sent in the prompt."""
    ev = evidence.strip()
    if not ev:
        return False
    return ev in name or ev in safe_desc or ev in safe_schema


async def ai_scan_tool(defn: ToolDefinition) -> list[ScannerFinding] | None:
    """Run the AI scanner pass on one tool definition.

    Returns:
        list[ScannerFinding] if the LLM successfully evaluated the tool.
        None if the LLM was disabled, unreachable, or timed out (meaning "not checked").
    """
    if not settings.scanner_ai_enabled or not settings.llm_enabled:
        return None

    fp = fingerprint_tool(defn)
    cache_key = (defn.name, fp)
    if cache_key in _cache:
        return list(_cache[cache_key])

    safe_desc = (defn.description or "")[:4000]
    try:
        schema_str = json.dumps(defn.input_schema or {}, indent=2, sort_keys=True)
    except (TypeError, ValueError):
        schema_str = "{}"
    safe_schema = schema_str[:4000]

    system_prompt, user_prompt = build_scanner_prompt(
        defn.name, safe_desc, defn.input_schema
    )
    messages = [
        SystemMessage(content=system_prompt),
        HumanMessage(content=user_prompt),
    ]

    backend = LLMBackend()
    try:
        inv = await backend.invoke(messages, purpose="scanner.ai")
    except (LLMDisabledError, LLMUnavailableError):
        return None
    except Exception:
        logger.exception("AI scan invocation crashed for tool %s", defn.name)
        return None

    text = inv.text.strip()
    if text.startswith("```"):
        lines = text.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].startswith("```"):
            lines = lines[:-1]
        text = "\n".join(lines).strip()

    try:
        data = json.loads(text)
    except (json.JSONDecodeError, ValueError):
        logger.warning(
            "AI scanner returned invalid JSON for tool %s: %s",
            defn.name,
            text[:200],
        )
        return None

    if not isinstance(data, dict):
        return None

    verdict = str(data.get("verdict", "")).strip().lower()
    if verdict not in {"safe", "suspicious", "malicious"}:
        logger.warning(
            "AI scanner unknown verdict '%s' for tool %s", verdict, defn.name
        )
        return None

    if verdict == "safe":
        findings: list[ScannerFinding] = []
        _cache[cache_key] = findings
        return findings

    reason = str(data.get("reason", "")).strip()
    if not reason or len(reason) > 300:
        logger.warning(
            "AI scanner reply rejected: reason is missing or exceeds 300 chars (len=%d) for tool %s",
            len(reason),
            defn.name,
        )
        return None

    category = str(data.get("category", "")).strip() or "other"
    message = f"{category}: {reason}"[:300]

    raw_evidence = data.get("evidence")
    evidence: str | None = str(raw_evidence).strip() if raw_evidence else None

    # Evidence verification: must be a substring of sent tool text
    if evidence and not _evidence_in_sent_text(
        evidence, defn.name, safe_desc, safe_schema
    ):
        logger.info(
            "AI scanner evidence not found in sent text for tool %s; dropping evidence and downgrading",
            defn.name,
        )
        evidence = None
        if verdict == "malicious":
            verdict = "suspicious"

    severity: Severity = "high" if verdict == "malicious" else "medium"
    severity = _cap_severity(severity)

    finding = ScannerFinding(
        rule_id=RULE_ID_AI,
        severity=severity,
        message=message,
        evidence=evidence[:200] if evidence else None,
    )
    findings = [finding]
    _cache[cache_key] = findings
    return findings
