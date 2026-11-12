"""G1–G6 detection and sanitization rules for the prompt-injection guard."""

from __future__ import annotations

import re
from typing import NamedTuple

from app.audit.redaction import safe_reason
from app.guard.models import GuardFinding
from app.text_normalize import decode_base64_blobs, normalize_for_scan


class RuleMatch(NamedTuple):
    rule_id: str
    name: str
    severity: str
    description: str
    match_span: tuple[int, int]
    matched_text: str


class _SpanMatch:
    """A forward match that exposes span() and group(0), like a regex match."""

    __slots__ = ("_end", "_start", "_text")

    def __init__(self, start: int, end: int, text: str) -> None:
        self._start = start
        self._end = end
        self._text = text

    def span(self) -> tuple[int, int]:
        return (self._start, self._end)

    def group(self, index: int = 0) -> str:
        if index != 0:
            raise IndexError(index)
        return self._text


_G2_COMMENT_WORD_RE = re.compile(
    r"(?i)\b(?:system|ignore|instruction|prompt|directive)\b"
)


class _HtmlCommentFinder:
    """A comment runs from <!-- to the --> that follows the first keyword.

    The keyword may sit after an earlier -->. One search from each opener
    keeps ``<!--`` repeated with no keyword on one forward pass.
    """

    def finditer(self, text: str):
        start = 0
        length = len(text)
        while start < length:
            open_at = text.find("<!--", start)
            if open_at < 0:
                return
            keyword = _G2_COMMENT_WORD_RE.search(text, open_at + 4)
            if keyword is None:
                return
            close_at = text.find("-->", keyword.end())
            if close_at < 0:
                return
            end = close_at + 3
            yield _SpanMatch(open_at, end, text[open_at:end])
            start = end


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
    re.compile(
        r"(?i)\byou\s+are\s+now\s+(?:DAN|unfiltered|jailbroken|an\s+unrestricted\s+ai)\b"
    ),
    re.compile(
        r"(?i)\bfrom\s+now\s+on,?\s+you\s+(?:must\s+)?(?:act|operate|behave)\s+as\b"
    ),
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
    # The first keyword after <!-- closes at the next --> after that keyword.
    _HtmlCommentFinder(),
]

# ---------------------------------------------------------------------------
# G3: Key / Credential Leak Requests (high)
# ---------------------------------------------------------------------------
_SECRET_TERMS = (
    r"(?:API_KEY|OPENAI_API_KEY|ANTHROPIC_API_KEY|GEMINI_API_KEY|JWT_SECRET|SECRET_KEY|"
    r"PRIVATE_KEY|ACCESS_KEY|BEARER_TOKEN|TOKEN|SECRET|PASSWORD|\.env|CREDENTIALS)"
)
_LEAK_VERBS = r"(?:leak|reveal|print|output|display|show|send|exfiltrate|dump|echo|read|extract|transmit|expose)"
_LEAK_VERB_RE = re.compile(rf"(?i)\b{_LEAK_VERBS}\b")
_LEAK_TERM_RE = re.compile(rf"(?i)\b{_SECRET_TERMS}\b")


class _LeakFinder:
    """On each line, every verb matches the next secret term. One pass, no window."""

    def finditer(self, text: str):
        for offset, line in _line_spans(text):
            segment, _dropped = _strip_cr(line)
            verbs = list(_LEAK_VERB_RE.finditer(segment))
            if not verbs:
                continue
            terms = list(_LEAK_TERM_RE.finditer(segment))
            if not terms:
                continue
            term_index = 0
            for verb in verbs:
                while (
                    term_index < len(terms) and terms[term_index].start() < verb.end()
                ):
                    term_index += 1
                if term_index >= len(terms):
                    break
                term = terms[term_index]
                start = offset + verb.start()
                end = offset + term.end()
                yield _SpanMatch(start, end, text[start:end])


_G3_PATTERNS = [
    _LeakFinder(),
    re.compile(
        r"\b[A-Za-z0-9_]*(?:API_KEY|SECRET_KEY|JWT_SECRET)[A-Za-z0-9_]*\s*=\s*['\"][^'\"]{8,}['\"]"
    ),
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
_HEX_TOKEN_RE = re.compile(r"^[0-9a-fA-F]+$")
_ZERO_WIDTH_RE = re.compile(r"[\u200b-\u200f\u202a-\u202e\u2060-\u2064\ufeff]")
# The decode phrase is fixed length. Echo walks the rest of the line.
_B64_DECODE_RE = re.compile(r"(?i)\bbase64\s+decode\b")
_ECHO_WORD_RE = re.compile(r"(?i)\becho\b")
_B64_TOKEN_RE = re.compile(
    r"(?<![A-Za-z0-9+/=])[A-Za-z0-9+/]{24,}={0,2}(?![A-Za-z0-9+/=])"
)

# ---------------------------------------------------------------------------
# G5: Exfiltration Links (high)
# ---------------------------------------------------------------------------
_URL_TOKEN_RE = re.compile(r"https?://[^\s)]+")
_URL_PARAM_RE = re.compile(
    r"[?&](?:key|token|secret|data|env|dump|creds|password)=[^\s)?&]*"
)


class _UrlParamFinder:
    """Each URL token is consumed once. At most one match is yielded per URL token."""

    def finditer(self, text: str):
        for token in _URL_TOKEN_RE.finditer(text):
            url = token.group(0)
            if _URL_PARAM_RE.search(url) is not None:
                yield _SpanMatch(token.start(), token.end(), url)


def _line_spans(text: str):
    """Yield (offset, line) without the line break."""
    offset = 0
    length = len(text)
    while True:
        newline = text.find("\n", offset)
        if newline < 0:
            yield offset, text[offset:]
            return
        yield offset, text[offset:newline]
        offset = newline + 1
        if offset >= length:
            return


def _strip_cr(line: str) -> tuple[str, int]:
    if line.endswith("\r"):
        return line[:-1], 1
    return line, 0


def _pipe_base64_spans(line: str) -> list[tuple[int, int]]:
    """| then optional spaces or tabs, then base64. One forward pass."""
    spans: list[tuple[int, int]] = []
    start = 0
    length = len(line)
    lowered = line.lower()
    while start < length:
        pipe = line.find("|", start)
        if pipe < 0:
            return spans
        cursor = pipe + 1
        while cursor < length and line[cursor] in " \t":
            cursor += 1
        if lowered.startswith("base64", cursor) and _after_word(line, cursor + 6):
            spans.append((pipe, cursor + 6))
            start = cursor + 6
            continue
        start = pipe + 1
    return spans


def _after_word(text: str, index: int) -> bool:
    return index >= len(text) or not (text[index].isalnum() or text[index] == "_")


class _B64EchoFinder:
    """Each echo matches the next | base64 on that same line."""

    def finditer(self, text: str):
        for offset, line in _line_spans(text):
            segment, _dropped = _strip_cr(line)
            echos = list(_ECHO_WORD_RE.finditer(segment))
            if not echos:
                continue
            pipes = _pipe_base64_spans(segment)
            if not pipes:
                continue
            pipe_index = 0
            for echo in echos:
                echo_end = echo.end()
                if echo_end >= len(segment) or segment[echo_end] not in " \t":
                    continue
                while pipe_index < len(pipes) and pipes[pipe_index][0] < echo_end:
                    pipe_index += 1
                if pipe_index >= len(pipes):
                    break
                start = offset + echo.start()
                end = offset + pipes[pipe_index][1]
                yield _SpanMatch(start, end, text[start:end])


def _skip_space(text: str, index: int) -> int:
    length = len(text)
    while index < length and text[index] in " \t\r\n":
        index += 1
    return index


def _line_end_at(text: str, index: int) -> int:
    """Index of the next line break. A carriage return is only sought up to a newline."""
    length = len(text)
    newline = text.find("\n", index)
    if newline < 0:
        newline = length
    carriage = text.find("\r", index, newline)
    if carriage >= 0:
        return carriage
    return newline


class _LineEnds:
    """Remember the break for this line so each command does not scan it again."""

    __slots__ = ("_end", "_text")

    def __init__(self, text: str) -> None:
        self._text = text
        self._end = -1

    def at(self, index: int) -> int:
        if index <= self._end:
            return self._end
        self._end = _line_end_at(self._text, index)
        return self._end


_CURL_WORD_RE = re.compile(r"(?i)\b(?:curl|wget|fetch)\b")
_HTTP_URL_RE = re.compile(r"https?://\S+")
_CURL_MARKER_RE = re.compile(r"\$|\bdata\b|\bkey\b", re.IGNORECASE)
_CURL_FLAGS = frozenset("XFDxfd")


def _next_is_curl_flag(text: str, index: int) -> bool:
    if index + 1 >= len(text) or text[index] != "-":
        return False
    return text[index + 1] in _CURL_FLAGS


class _CurlFlagFinder:
    """Skip whitespace, including newlines, then require -[XFd] and a URL on that line."""

    def finditer(self, text: str):
        position = 0
        length = len(text)
        lines = _LineEnds(text)
        # A URL search that fails covers the rest of that line.
        clear_end = -1
        clear_from = 0
        while position < length:
            command = _CURL_WORD_RE.search(text, position)
            if command is None:
                return
            landed = _skip_space(text, command.end())
            if landed > command.end() and _next_is_curl_flag(text, landed):
                line_end = lines.at(landed)
                search_from = landed + 2
                if not (line_end == clear_end and search_from >= clear_from):
                    url = _HTTP_URL_RE.search(text, search_from, line_end)
                    if url is not None:
                        start = command.start()
                        end = url.end()
                        yield _SpanMatch(start, end, text[start:end])
                        position = end
                        clear_end = -1
                        continue
                    clear_end = line_end
                    clear_from = search_from
            position = command.end()


class _CurlMarkerFinder:
    """After skipped whitespace, a URL on that line and a marker through the line end."""

    def finditer(self, text: str):
        position = 0
        length = len(text)
        lines = _LineEnds(text)
        # A marker search that fails covers the rest of that line.
        clear_end = -1
        clear_from = 0
        while position < length:
            command = _CURL_WORD_RE.search(text, position)
            if command is None:
                return
            landed = _skip_space(text, command.end())
            if landed > command.end():
                line_end = lines.at(landed)
                if not (line_end == clear_end and landed >= clear_from):
                    url = _HTTP_URL_RE.search(text, landed, line_end)
                    if url is not None:
                        marker = _CURL_MARKER_RE.search(text, url.start(), line_end)
                        if marker is not None:
                            start = command.start()
                            end = marker.end()
                            yield _SpanMatch(start, end, text[start:end])
                            position = end
                            clear_end = -1
                            continue
                        clear_end = line_end
                        clear_from = url.start()
                    else:
                        clear_end = line_end
                        clear_from = landed
            position = command.end()


class _MarkdownImageFinder:
    """Find ![, then the first ]( on that line, then a URL and the closing paren.

    One forward pass. Each line end is found once per line, and each URL
    run (up to a space, tab, ) or the line end) is scanned once, however
    many "![" openers point into it.
    """

    def finditer(self, text: str):
        start = 0
        length = len(text)
        lines = _LineEnds(text)
        stops = _UrlRunEnds(text)
        while start < length:
            open_at = text.find("![", start)
            if open_at < 0:
                return
            line_end = lines.at(open_at)
            close_at = text.find("](", open_at + 2, line_end)
            if close_at < 0:
                start = line_end + 1
                continue
            end = _markdown_image_end(text, close_at + 2, line_end, stops)
            if end < 0:
                start = close_at + 2
                continue
            yield _SpanMatch(open_at, end, text[open_at:end])
            start = end


class _UrlRunEnds:
    """Remember where the last URL run stopped.

    URL starts only move forward, so a start inside the last run stops at
    the same place and is not scanned again.
    """

    __slots__ = ("_from", "_stop", "_text")

    def __init__(self, text: str) -> None:
        self._text = text
        self._from = -1
        self._stop = -1

    def at(self, index: int, limit: int) -> int:
        if self._from <= index < self._stop and self._stop <= limit:
            return self._stop
        text = self._text
        cursor = index
        while cursor < limit and text[cursor] not in " \t)":
            cursor += 1
        self._from = index
        self._stop = cursor
        return cursor


def _markdown_image_end(text: str, index: int, limit: int, stops: _UrlRunEnds) -> int:
    if text.startswith("https://", index):
        cursor = index + 8
    elif text.startswith("http://", index):
        cursor = index + 7
    elif text.startswith("//", index):
        cursor = index + 2
    else:
        return -1
    if cursor >= limit or text[cursor] in " \t)":
        return -1
    cursor = stops.at(cursor, limit)
    if cursor >= limit or text[cursor] != ")":
        return -1
    return cursor + 1


_G5_PATTERNS = [
    # ![ then the first ]( on that line, then the URL.
    _MarkdownImageFinder(),
    # One pass over each URL token, then a parameter search inside that token.
    _UrlParamFinder(),
    # Known exfiltration domains
    re.compile(
        r"(?i)https?://(?:[a-zA-Z0-9-]+\.)*(?:webhook\.site|requestbin|ngrok[a-zA-Z0-9-]*\.[a-z]+|"
        r"burpcollaborator\.net|oastify\.com|pipedream\.net|evil\.com|attacker\.com|evil\.example)(?:[:/][^\s]*)?"
    ),
    _CurlFlagFinder(),
    _CurlMarkerFinder(),
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

    for m in _B64_DECODE_RE.finditer(text):
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

    for m in _B64EchoFinder().finditer(text):
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

        # Skip pure hexadecimal tokens (SHA-256 fingerprints, hashes, request IDs)
        if _HEX_TOKEN_RE.fullmatch(token):
            continue

        decoded_blobs = decode_base64_blobs(token)
        # Skip tokens that do not decode to valid, mostly printable text
        if not decoded_blobs:
            continue

        is_high = False
        decoded_high_matches: list[RuleMatch] = []
        for decoded_str in decoded_blobs:
            high_matches = _check_high_rules_only(decoded_str)
            if high_matches:
                is_high = True
                decoded_high_matches.extend(high_matches)

        if is_high:
            # Record G4 as high and record the high-severity rules
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

    # Check any decoded Base64 blobs from the entire text that contain high-severity payloads
    seen_high_descriptions = {
        (m.rule_id, m.description) for m in matches if m.severity == "high"
    }
    for decoded_str in decode_base64_blobs(text):
        for high_match in _check_high_rules_only(decoded_str):
            desc = f"{high_match.description} (decoded from Base64)"
            if (high_match.rule_id, desc) not in seen_high_descriptions:
                seen_high_descriptions.add((high_match.rule_id, desc))
                if not any(m.rule_id == "G4" and m.severity == "high" for m in matches):
                    matches.append(
                        RuleMatch(
                            rule_id="G4",
                            name="Obfuscated Payload",
                            severity="high",
                            description="Base64 encoded high-severity injection payload",
                            match_span=(0, 0),
                            matched_text="[Base64]",
                        )
                    )
                matches.append(
                    RuleMatch(
                        rule_id=high_match.rule_id,
                        name=high_match.name,
                        severity="high",
                        description=desc,
                        match_span=(0, 0),
                        matched_text="[Base64]",
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

    # 7. Normalized Unicode Scan
    normalized_text = normalize_for_scan(text)
    if normalized_text:
        raw_high_signatures = {
            (m.rule_id, m.matched_text.strip().lower())
            for m in matches
            if m.severity == "high"
        }
        seen_norm_signatures: set[tuple[str, str]] = set()

        for norm_match in _check_high_rules_only(normalized_text):
            sig = (norm_match.rule_id, norm_match.matched_text.strip().lower())
            if sig not in raw_high_signatures and sig not in seen_norm_signatures:
                seen_norm_signatures.add(sig)
                matches.append(
                    RuleMatch(
                        rule_id=norm_match.rule_id,
                        name=norm_match.name,
                        severity="high",
                        description=f"{norm_match.description} (after unicode normalization)",
                        match_span=norm_match.match_span,
                        matched_text=norm_match.matched_text,
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
