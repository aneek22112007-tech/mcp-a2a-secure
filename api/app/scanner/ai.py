"""AI-assisted scanner pass.

Uses LLMBackend to analyze tool descriptions and input schemas for semantic
risks that rule-based scanners miss (e.g. social engineering, credential requests,
hidden instructions).
"""

from __future__ import annotations

import json
import logging
from typing import Any

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


def _evidence_in_tool(evidence: str, defn: ToolDefinition) -> bool:
    """Check if the quoted evidence actually appears in the tool's text."""
    ev = evidence.strip()
    if not ev:
        return False
    if ev in defn.name or ev in defn.description:
        return True
    try:
        schema_str = json.dumps(defn.input_schema or {}, ensure_ascii=False)
        if ev in schema_str:
            return True
    except Exception:
        pass
    return False


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

    system_prompt, user_prompt = build_scanner_prompt(
        defn.name, defn.description, defn.input_schema
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
    except Exception:
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
        logger.warning("AI scanner unknown verdict '%s' for tool %s", verdict, defn.name)
        return None

    if verdict == "safe":
        findings: list[ScannerFinding] = []
        _cache[cache_key] = findings
        return findings

    reason = str(data.get("reason", "")).strip()
    if not reason:
        reason = f"AI flagged tool as {verdict}"
    if len(reason) > 300:
        reason = reason[:297] + "..."

    raw_evidence = data.get("evidence")
    evidence: str | None = str(raw_evidence).strip() if raw_evidence else None

    # Evidence verification: must be a substring of sent tool text
    if evidence:
        if not _evidence_in_tool(evidence, defn):
            logger.info(
                "AI scanner evidence not found in tool %s; dropping evidence and downgrading",
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
        message=reason,
        evidence=evidence[:200] if evidence else None,
    )
    findings = [finding]
    _cache[cache_key] = findings
    return findings
