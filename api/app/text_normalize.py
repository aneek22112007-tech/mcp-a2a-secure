"""Shared text normalization utilities for security scanning and guard validation (P8 B5a).

Provides:
- strip_invisible: removes zero-width, bidi isolates, and invisible control characters.
- fold_confusables: maps common look-alike Cyrillic and Greek Unicode characters to ASCII.
- normalize_for_scan: NFKC -> strip_invisible -> fold_confusables.
- decode_base64_blobs: safely detects and recursively decodes base64 tokens with bounds.
"""

from __future__ import annotations

import base64
import binascii
import re
import unicodedata

# ---------------------------------------------------------------------------
# Invisible / Zero-Width Character Stripping
# ---------------------------------------------------------------------------

_INVISIBLE_RE = re.compile(
    r"[\u00ad\u034f\u180e\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]"
)


def strip_invisible(text: str) -> str:
    """Remove zero-width, bidi-control, and invisible characters from text."""
    if not text:
        return ""
    return _INVISIBLE_RE.sub("", text)


# ---------------------------------------------------------------------------
# Confusable Folding
# ---------------------------------------------------------------------------

CONFUSABLES_MAP: dict[str, str] = {
    # Cyrillic lowercase
    "\u0430": "a",  # Cyrillic small letter a
    "\u0435": "e",  # Cyrillic small letter ie
    "\u043e": "o",  # Cyrillic small letter o
    "\u0440": "p",  # Cyrillic small letter er
    "\u0441": "c",  # Cyrillic small letter es
    "\u0443": "y",  # Cyrillic small letter u
    "\u0445": "x",  # Cyrillic small letter ha
    "\u0456": "i",  # Cyrillic small letter byelorussian-ukrainian i
    "\u0458": "j",  # Cyrillic small letter je
    "\u0455": "s",  # Cyrillic small letter dze
    "\u0501": "d",  # Cyrillic small letter komi de
    "\u0261": "g",  # Latin small letter script g
    # Cyrillic uppercase equivalents
    "\u0410": "A",  # Cyrillic capital letter a
    "\u0412": "B",  # Cyrillic capital letter ve
    "\u0415": "E",  # Cyrillic capital letter ie
    "\u041a": "K",  # Cyrillic capital letter ka
    "\u041c": "M",  # Cyrillic capital letter em
    "\u041d": "H",  # Cyrillic capital letter en
    "\u041e": "O",  # Cyrillic capital letter o
    "\u0420": "P",  # Cyrillic capital letter er
    "\u0421": "C",  # Cyrillic capital letter es
    "\u0422": "T",  # Cyrillic capital letter te
    "\u0423": "Y",  # Cyrillic capital letter u
    "\u0425": "X",  # Cyrillic capital letter ha
    "\u0406": "I",  # Cyrillic capital letter byelorussian-ukrainian i
    "\u0408": "J",  # Cyrillic capital letter je
    "\u0405": "S",  # Cyrillic capital letter dze
    "\u0500": "D",  # Cyrillic capital letter komi de
    # Greek lowercase
    "\u03bf": "o",  # Greek small letter omicron
    "\u03b1": "a",  # Greek small letter alpha
    "\u03b5": "e",  # Greek small letter epsilon
    "\u03b9": "i",  # Greek small letter iota
    "\u03ba": "k",  # Greek small letter kappa
    "\u03bd": "v",  # Greek small letter nu
    "\u03c1": "p",  # Greek small letter rho
    "\u03c4": "t",  # Greek small letter tau
    "\u03c5": "u",  # Greek small letter upsilon
    "\u03c7": "x",  # Greek small letter chi
    # Greek uppercase equivalents
    "\u039f": "O",  # Greek capital letter omicron
    "\u0391": "A",  # Greek capital letter alpha
    "\u0395": "E",  # Greek capital letter epsilon
    "\u0399": "I",  # Greek capital letter iota
    "\u039a": "K",  # Greek capital letter kappa
    "\u039d": "N",  # Greek capital letter nu
    "\u03a1": "P",  # Greek capital letter rho
    "\u03a4": "T",  # Greek capital letter tau
    "\u03a5": "Y",  # Greek capital letter upsilon
    "\u03a7": "X",  # Greek capital letter chi
}

_CONFUSABLES_TRANSLATION_TABLE = str.maketrans(CONFUSABLES_MAP)


def fold_confusables(text: str) -> str:
    """Map common look-alike Unicode characters to ASCII."""
    if not text:
        return ""
    return text.translate(_CONFUSABLES_TRANSLATION_TABLE)


# ---------------------------------------------------------------------------
# Pipeline Normalization
# ---------------------------------------------------------------------------


def normalize_for_scan(text: str) -> str:
    """Normalize text for scanning in exact sequence: NFKC -> strip invisibles -> fold confusables."""
    if not text:
        return ""
    nfkc = unicodedata.normalize("NFKC", text)
    stripped = strip_invisible(nfkc)
    return fold_confusables(stripped)


# ---------------------------------------------------------------------------
# Base64 Decoding
# ---------------------------------------------------------------------------

_B64_TOKEN_RE = re.compile(
    r"(?<![A-Za-z0-9+/_\-=])([A-Za-z0-9+/_\-]{4,}={0,2})(?![A-Za-z0-9+/_\-=])"
)
_B64_TRANSLATION_TABLE = str.maketrans("-_", "+/")


def _decode_single_token(tok: str, max_bytes: int) -> str | None:
    """Attempt safe base64 decoding of a single candidate token."""
    # Check for invalid internal padding
    if "=" in tok[:-2]:
        return None

    # Enforce token length bound to avoid unbounded memory / decoding
    max_token_len = (max_bytes * 4 // 3) + 8
    if len(tok) > max_token_len:
        return None

    rem = len(tok) % 4
    if rem == 1:
        # A single trailing base64 character is mathematically invalid
        return None
    padded = tok + "=" * ((4 - rem) % 4)

    # Translate URL-safe characters to standard base64
    trans = padded.translate(_B64_TRANSLATION_TABLE)

    try:
        raw_bytes = base64.b64decode(trans.encode("ascii"), validate=True)
    except (binascii.Error, ValueError):
        return None

    if len(raw_bytes) > max_bytes or not raw_bytes:
        return None

    try:
        decoded_text = raw_bytes.decode("utf-8")
    except UnicodeDecodeError:
        return None

    # Check that at least 85% of characters are printable (including common whitespace)
    printable_count = sum(
        1 for c in decoded_text if (c.isprintable() or c in "\t\n\r") and c != "\ufffd"
    )
    if (printable_count / len(decoded_text)) < 0.85:
        return None

    return decoded_text


def decode_base64_blobs(
    text: str, max_depth: int = 2, max_bytes: int = 8192
) -> list[str]:
    """Find and recursively decode standard and URL-safe base64 tokens in text.

    - Bounded by max_depth and max_bytes.
    - Requires at least 85% printable characters.
    - Handles nested base64 encodings recursively up to max_depth.
    """
    if max_depth <= 0 or not text or not isinstance(text, str):
        return []

    results: list[str] = []
    seen: set[str] = set()

    def _traverse(target_text: str, current_depth: int) -> None:
        if current_depth <= 0 or not target_text:
            return

        for match in _B64_TOKEN_RE.finditer(target_text):
            candidate = match.group(1)
            decoded = _decode_single_token(candidate, max_bytes=max_bytes)
            if decoded is not None and decoded not in seen:
                seen.add(decoded)
                results.append(decoded)
                if current_depth > 1:
                    _traverse(decoded, current_depth - 1)

    _traverse(text, max_depth)
    return results
