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


def extract_all_strings(obj) -> list[str]:
    strings = []
    if isinstance(obj, str):
        strings.append(obj)
    elif isinstance(obj, dict):
        for k, v in obj.items():
            strings.append(k)
            strings.extend(extract_all_strings(v))
    elif isinstance(obj, list):
        for item in obj:
            strings.extend(extract_all_strings(item))
    return strings


def normalise_text(text: str) -> str:
    return re.sub(r"[^a-z0-9]", "", text.lower())


NORMAL_PROMPT_PHRASES = [normalise_text(p) for p in PROMPT_INJECTION_PHRASES]
NORMAL_EXFIL_PHRASES = [normalise_text(p) for p in EXFILTRATION_PHRASES]


def scan_tool_rules(defn: ToolDefinition) -> list[ScannerFinding]:
    findings = []

    all_strings = []
    if defn.name:
        all_strings.append(defn.name)
    if defn.description:
        all_strings.append(defn.description)
    if defn.input_schema:
        all_strings.extend(extract_all_strings(defn.input_schema))
    if defn.output_schema:
        all_strings.extend(extract_all_strings(defn.output_schema))

    norm_strings = [(s, normalise_text(s)) for s in all_strings]

    # Rule 1 & Rule 2 & Rule 5 across everything
    for orig, norm in norm_strings:
        if not norm:
            continue
        for p_idx, phrase in enumerate(NORMAL_PROMPT_PHRASES):
            if phrase in norm:
                findings.append(
                    ScannerFinding(
                        rule_id="R1_PROMPT_INJECTION",
                        severity="high",
                        message="Prompt injection phrase found.",
                        evidence=orig[:200],
                    )
                )
                break  # avoid duplicate findings for same string

        for e_idx, phrase in enumerate(NORMAL_EXFIL_PHRASES):
            if phrase in norm:
                findings.append(
                    ScannerFinding(
                        rule_id="R2_EXFILTRATION",
                        severity="critical",
                        message="Exfiltration phrase found.",
                        evidence=orig[:200],
                    )
                )
                break

    # Rule 3
    if isinstance(defn.input_schema, dict) and "properties" in defn.input_schema:
        props = defn.input_schema["properties"]
        if isinstance(props, dict):
            for p_name, p_schema in props.items():
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
                                message=f"Overbroad string parameter: {p_name}"[:300],
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
