"""G1–G6 detection and sanitization rules for the prompt-injection guard."""

from __future__ import annotations

import base64
import re
from typing import NamedTuple

from app.audit.redaction import safe_reason
from app.guard.models import GuardFinding


class RuleMatch(NamedTuple):
    rule_id: str
    name: str
    severity: str
    description: str
    match_span: tuple[int, int]
    matched_text: str


# ---------------------------------------------------------------------------
# G1: Instruction Override (high)
# ---------------------------------------------------------------------------
_G1_PATTERNS = [
    re.compile(
        r"(?i)\b(?:ignore|disregard|forget|override|bypass|clear|reset)\s+(?:all\s+|any\s+)?"
        r"(?:previous|prior|above|preceding|initial|system)\s+"
        r"(?:instructions|directives|prompts|commands|rules)\b"
    ),
    re.compile(r"(?i)\boverride\s+system\s+(?:instructions|directives|prompts)\b"),
    re.compile(r"(?i)\b(?:new|updated)\s+system\s+instructions\s*:"),
    re.compile(r"(?i)\byou\s+are\s+now\s+in\s+developer\s+mode\b"),
    re.compile(r"(?i)\byou\s+are\s+now\s+(?:DAN|unfiltered|jailbroken|an\s+unrestricted\s+ai)\b"),
    re.compile(r"(?i)\bfrom\s+now\s+on,?\s+you\s+(?:must\s+)?(?:act|operate|behave)\s+as\b"),
]

# ---------------------------------------------------------------------------
# G2: Hidden System Prompts / Role Injection (high)
# ---------------------------------------------------------------------------
_G2_PATTERNS = [
    re.compile(r"(?i)\[system\]"),
    re.compile(r"(?i)<\|im_start\|>system"),
    re.compile(r"(?i)<system>"),
    re.compile(r"(?i)###\s*System\s*:"),
    re.compile(r"(?i)\bSYSTEM\s+PROMPT\s*:"),
    re.compile(
        r"(?i)<!--\s*.*?\b(?:system|ignore|instruction|prompt|directive)\b.*?-->",
        re.DOTALL,
    ),
]

# ---------------------------------------------------------------------------
# G3: Key / Credential Leak Requests (high)
# ---------------------------------------------------------------------------
_SECRET_TERMS = (
    r"(?:API_KEY|OPENAI_API_KEY|ANTHROPIC_API_KEY|GEMINI_API_KEY|JWT_SECRET|SECRET_KEY|"
    r"PRIVATE_KEY|ACCESS_KEY|BEARER_TOKEN|TOKEN|SECRET|PASSWORD|\.env|CREDENTIALS)"
)
_LEAK_VERBS = (
    r"(?:leak|reveal|print|output|display|show|send|exfiltrate|dump|echo|read|extract|transmit|expose)"
)

_G3_PATTERNS = [
    re.compile(rf"(?i)\b{_LEAK_VERBS}\b[^\n\r]*?(\b{_SECRET_TERMS}\b)"),
    re.compile(r"\b[A-Za-z0-9_]*(?:API_KEY|SECRET_KEY|JWT_SECRET)[A-Za-z0-9_]*\s*=\s*['\"][^'\"]{8,}['\"]"),
    re.compile(r"mcpg_[A-Za-z0-9_-]{16,}"),
    re.compile(r"ak_live_[A-Za-z0-9]{16,}"),
    re.compile(r"sk-[A-Za-z0-9]{20,}"),
    re.compile(r"-----BEGIN (?:RSA )?PRIVATE KEY-----"),
    re.compile(r"(?i)\bBearer\s+[A-Za-z0-9_.-]{20,}"),
]

# ---------------------------------------------------------------------------
# G4: Encoded / Obfuscated Payloads (medium, escalates to high if decoded is high)
# ---------------------------------------------------------------------------
_HEX_CHAIN_RE = re.compile(r"(?:\\x[0-9a-fA-F]{2}){4,}")
_ZERO_WIDTH_RE = re.compile(r"[\u200b-\u200f\u202a-\u202e\u2060-\u2064\ufeff]")
_B64_INSTRUCTION_RE = re.compile(r"(?i)\b(?:base64\s+decode|echo\s+.*\|\s*base64)\b")
_B64_TOKEN_RE = re.compile(r"(?<![A-Za-z0-9+/=])[A-Za-z0-9+/]{24,}={0,2}(?![A-Za-z0-9+/=])")

# ---------------------------------------------------------------------------
# G5: Exfiltration Links (high)
# ---------------------------------------------------------------------------
_G5_PATTERNS = [
    # Markdown image beacons
    re.compile(r"!\[.*?\]\((?:https?:)?//[^\s)]+\)"),
    # Sensitive exfiltration query parameters
    re.compile(r"https?://[^\s)]+[?&](?:key|token|secret|data|env|dump|creds|password)=[^\s)]*"),
    # Known exfiltration domains
    re.compile(
        r"(?i)https?://(?:[a-zA-Z0-9-]+\.)*(?:webhook\.site|requestbin|ngrok[a-zA-Z0-9-]*\.[a-z]+|"
        r"burpcollaborator\.net|oastify\.com|pipedream\.net|evil\.com|attacker\.com|evil\.example)(?:[:/][^\s]*)?"
    ),
    # curl / wget / fetch exfiltration commands
    re.compile(r"(?i)\b(?:curl|wget|fetch)\s+-[XFd].*?https?://[^\s]+"),
    re.compile(r"(?i)\b(?:curl|wget|fetch)\s+[^\n\r]*?https?://[^\s]+.*?(?:\$|\bdata\b|\bkey\b)"),
]

# ---------------------------------------------------------------------------
# G6: Unauthorized Tool / Delimiter Manipulation (medium)
# ---------------------------------------------------------------------------
_G6_PATTERNS = [
    re.compile(r"(?i)</?(?:tool_output|tool_result|function_results|tool_call)>"),
    re.compile(
        r"(?i)\b(?:call\s+tool\s+|execute\s+tool\s+|invoke\s+tool\s+|write_note\(|delegate_to_agent|<script\b)"
    ),
]


def _check_high_rules_only(text: str) -> list[RuleMatch]:
    """Check text only against high-severity rules G1, G2, G3, G5."""
    matches: list[RuleMatch] = []

    for pattern in _G1_PATTERNS:
        for m in pattern.finditer(text):
            matches.append(
                RuleMatch(
                    rule_id="G1",
                    name="Instruction Override",
                    severity="high",
                    description="Instruction override / system prompt disregard directive",
                    match_span=m.span(),
                    matched_text=m.group(0),
                )
            )

    for pattern in _G2_PATTERNS:
        for m in pattern.finditer(text):
            matches.append(
                RuleMatch(
                    rule_id="G2",
                    name="Hidden System Prompt",
                    severity="high",
                    description="Fake system or role boundary injection",
                    match_span=m.span(),
                    matched_text=m.group(0),
                )
            )

    for pattern in _G3_PATTERNS:
        for m in pattern.finditer(text):
            matches.append(
                RuleMatch(
                    rule_id="G3",
                    name="Credential Leak",
                    severity="high",
                    description="Credential leak request or exposed secret token",
                    match_span=m.span(),
                    matched_text=m.group(0),
                )
            )

    for pattern in _G5_PATTERNS:
        for m in pattern.finditer(text):
            matches.append(
                RuleMatch(
                    rule_id="G5",
                    name="Exfiltration Link",
                    severity="high",
                    description="Exfiltration URL, image beacon, or exfiltration command",
                    match_span=m.span(),
                    matched_text=m.group(0),
                )
            )

    return matches


def scan_text(text: str) -> list[RuleMatch]:
    """Scan text against all G1–G6 rules and return matched rule occurrences."""
    matches: list[RuleMatch] = []

    # 1. G1 High
    for pattern in _G1_PATTERNS:
        for m in pattern.finditer(text):
            matches.append(
                RuleMatch(
                    rule_id="G1",
                    name="Instruction Override",
                    severity="high",
                    description="Instruction override / system prompt disregard directive",
                    match_span=m.span(),
                    matched_text=m.group(0),
                )
            )

    # 2. G2 High
    for pattern in _G2_PATTERNS:
        for m in pattern.finditer(text):
            matches.append(
                RuleMatch(
                    rule_id="G2",
                    name="Hidden System Prompt",
                    severity="high",
                    description="Fake system or role boundary injection",
                    match_span=m.span(),
                    matched_text=m.group(0),
                )
            )

    # 3. G3 High
    for pattern in _G3_PATTERNS:
        for m in pattern.finditer(text):
            matches.append(
                RuleMatch(
                    rule_id="G3",
                    name="Credential Leak",
                    severity="high",
                    description="Credential leak request or exposed secret token",
                    match_span=m.span(),
                    matched_text=m.group(0),
                )
            )

    # 4. G4 Medium (or High if decoded payload matches high-severity rules)
    for m in _HEX_CHAIN_RE.finditer(text):
        matches.append(
            RuleMatch(
                rule_id="G4",
                name="Obfuscated Payload",
                severity="medium",
                description="Hex escape sequence obfuscation",
                match_span=m.span(),
                matched_text=m.group(0),
            )
        )

    for m in _ZERO_WIDTH_RE.finditer(text):
        matches.append(
            RuleMatch(
                rule_id="G4",
                name="Obfuscated Payload",
                severity="medium",
                description="Zero-width or invisible Unicode control characters",
                match_span=m.span(),
                matched_text=m.group(0),
            )
        )

    for m in _B64_INSTRUCTION_RE.finditer(text):
        matches.append(
            RuleMatch(
                rule_id="G4",
                name="Obfuscated Payload",
                severity="medium",
                description="Base64 decoding directive",
                match_span=m.span(),
                matched_text=m.group(0),
            )
        )

    for m in _B64_TOKEN_RE.finditer(text):
        token = m.group(0)
        # Attempt safe base64 decoding (up to 8 KB)
        is_high = False
        decoded_high_matches: list[RuleMatch] = []
        try:
            # Pad if needed
            padded = token + "=" * ((4 - len(token) % 4) % 4)
            decoded_bytes = base64.b64decode(padded[:8192], validate=True)
            decoded_str = decoded_bytes.decode("utf-8", errors="ignore")
            if decoded_str and len(decoded_str.strip()) >= 4:
                decoded_high_matches = _check_high_rules_only(decoded_str)
                if decoded_high_matches:
                    is_high = True
        except Exception:  # noqa: BLE001, S110
            pass

        if is_high:
            # Record G4 as high or record both G4 and the high-severity rules
            matches.append(
                RuleMatch(
                    rule_id="G4",
                    name="Obfuscated Payload",
                    severity="high",
                    description="Base64 encoded high-severity injection payload",
                    match_span=m.span(),
                    matched_text=token,
                )
            )
            for high_match in decoded_high_matches:
                matches.append(
                    RuleMatch(
                        rule_id=high_match.rule_id,
                        name=high_match.name,
                        severity="high",
                        description=f"{high_match.description} (decoded from Base64)",
                        match_span=m.span(),
                        matched_text=f"[Base64:{token[:12]}...]",
                    )
                )
        else:
            matches.append(
                RuleMatch(
                    rule_id="G4",
                    name="Obfuscated Payload",
                    severity="medium",
                    description="Standalone Base64 encoded token",
                    match_span=m.span(),
                    matched_text=token,
                )
            )

    # 5. G5 High
    for pattern in _G5_PATTERNS:
        for m in pattern.finditer(text):
            matches.append(
                RuleMatch(
                    rule_id="G5",
                    name="Exfiltration Link",
                    severity="high",
                    description="Exfiltration URL, image beacon, or exfiltration command",
                    match_span=m.span(),
                    matched_text=m.group(0),
                )
            )

    # 6. G6 Medium
    for pattern in _G6_PATTERNS:
        for m in pattern.finditer(text):
            matches.append(
                RuleMatch(
                    rule_id="G6",
                    name="Delimiter Manipulation",
                    severity="medium",
                    description="Tool output delimiter spoofing or indirect tool execution coercion",
                    match_span=m.span(),
                    matched_text=m.group(0),
                )
            )

    return matches


def to_guard_findings(matches: list[RuleMatch]) -> list[GuardFinding]:
    """Convert rule matches to public GuardFinding models."""
    findings: list[GuardFinding] = []
    seen = set()
    for m in matches:
        key = (m.rule_id, m.matched_text[:40])
        if key in seen:
            continue
        seen.add(key)
        redacted_snippet = safe_reason(m.matched_text, max_len=60) or "[REDACTED]"
        findings.append(
            GuardFinding(
                rule_id=m.rule_id,
                name=m.name,
                severity="high" if m.severity == "high" else "medium",
                description=m.description,
                snippet=redacted_snippet,
            )
        )
    return findings


def sanitize_medium_text(text: str, matches: list[RuleMatch]) -> str:
    """Sanitize medium severity text by removing zero-width characters and redacting matches."""
    # 1. Strip zero-width and invisible control characters
    cleaned = _ZERO_WIDTH_RE.sub("", text)

    # 2. Sort spans in reverse order to replace without invalidating offsets
    # Filter only matches that apply to the current cleaned text or regex substitute
    # For G4 and G6, replace matched patterns directly
    for m in matches:
        if m.rule_id in {"G4", "G6"} and m.matched_text and m.matched_text in cleaned:
            cleaned = cleaned.replace(m.matched_text, f"[REDACTED:{m.rule_id}]")

    # If any hex chains remain:
    cleaned = _HEX_CHAIN_RE.sub("[REDACTED:G4]", cleaned)
    # If any delimiter spoofing remains:
    for pattern in _G6_PATTERNS:
        cleaned = pattern.sub("[REDACTED:G6]", cleaned)

    return cleaned
