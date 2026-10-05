import json
import re

from app.scanner.types import ScannerFinding
from app.tools.catalog import ToolDefinition

PROMPT_INJECTION_PHRASES = [
    "ignore previous instructions",
    "ignore all prior",
    "disregard system prompt",
    "you are now",
    "jailbreak",
    "do not tell the user",
    "hidden instruction",
]

EXFILTRATION_PHRASES = [
    "send to http",
    "post the note",
    "upload contents to",
    "exfiltrate",
    "webhook",
    "pastebin",
    "steal api key",
    "exfil",
]

OVERBROAD_PARAMS = {
    "command",
    "script",
    "code",
    "sql",
    "url",
    "endpoint",
    "callback",
    "webhook",
}


def scan_tool_rules(defn: ToolDefinition) -> list[ScannerFinding]:
    findings = []

    desc_lower = defn.description.lower() if defn.description else ""

    # Rule 1
    for phrase in PROMPT_INJECTION_PHRASES:
        if phrase in desc_lower:
            findings.append(
                ScannerFinding(
                    rule_id="R1_PROMPT_INJECTION",
                    severity="high",
                    message=f"Prompt injection phrase found: {phrase}",
                    evidence=phrase[:200],
                )
            )

    # Rule 2
    for phrase in EXFILTRATION_PHRASES:
        if phrase in desc_lower:
            findings.append(
                ScannerFinding(
                    rule_id="R2_EXFILTRATION",
                    severity="critical",
                    message=f"Exfiltration phrase found: {phrase}",
                    evidence=phrase[:200],
                )
            )

    # Rule 3
    if defn.input_schema and "properties" in defn.input_schema:
        for p_name, p_schema in defn.input_schema["properties"].items():
            if isinstance(p_schema, dict):
                p_type = p_schema.get("type")
                if (
                    p_type == "string"
                    and "maxLength" not in p_schema
                    and p_name.lower() in OVERBROAD_PARAMS
                ):
                    findings.append(
                        ScannerFinding(
                            rule_id="R3_OVERBROAD_STRING",
                            severity="medium",
                            message=f"Overbroad string parameter without maxLength: {p_name}",
                            evidence=p_name[:200],
                        )
                    )

    # Rule 4
    desc_len = len(defn.description) if defn.description else 0
    if desc_len > 4096:
        findings.append(
            ScannerFinding(
                rule_id="R4_SIZE_CAP_DESCRIPTION",
                severity="medium",
                message="Description exceeds 4 KiB",
                evidence=f"Length: {desc_len}"[:200],
            )
        )

    input_str = (
        json.dumps(defn.input_schema, sort_keys=True, separators=(",", ":"))
        if defn.input_schema
        else "{}"
    )
    schema_size = len(input_str.encode("utf-8"))
    if schema_size > 32768:
        findings.append(
            ScannerFinding(
                rule_id="R4_SIZE_CAP_SCHEMA",
                severity="medium",
                message="Input schema exceeds 32 KiB",
                evidence=f"Size: {schema_size} bytes"[:200],
            )
        )

    # Rule 5
    if defn.input_schema and "properties" in defn.input_schema:
        for p_name, p_schema in defn.input_schema["properties"].items():
            if isinstance(p_schema, dict) and "description" in p_schema:
                p_desc = p_schema["description"]
                if isinstance(p_desc, str):
                    p_desc_lower = p_desc.lower()
                    for phrase in PROMPT_INJECTION_PHRASES + EXFILTRATION_PHRASES:
                        if phrase in p_desc_lower:
                            findings.append(
                                ScannerFinding(
                                    rule_id="R5_SUSPICIOUS_PARAM_DESC",
                                    severity="high",
                                    message=f"Suspicious phrase in parameter '{p_name}' description",
                                    evidence=phrase[:200],
                                )
                            )

    # Rule 6
    if not re.match(r"^[A-Za-z][A-Za-z0-9_]{0,63}$", defn.name):
        findings.append(
            ScannerFinding(
                rule_id="R6_TOOL_NAME_ANOMALY",
                severity="low",
                message="Tool name does not match expected format",
                evidence=defn.name[:200],
            )
        )

    return findings
