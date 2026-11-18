"""One short plain-English brief per incident, from the rows only.

This module does not call a model and does not add a cause that is not
already on the incident.
"""

from __future__ import annotations

import re
from collections import Counter
from datetime import datetime

from app.analyst.types import (
    KIND_A2A,
    KIND_AUTH,
    KIND_INJECTION,
    KIND_PIN,
    KIND_RATE_LIMIT,
    KIND_SCANNER,
    KIND_SCOPE,
    Incident,
    IncidentEvent,
)
from app.repos.common import as_utc

# One or two sentences. A little over is kept when cutting would drop a fact.
_TARGET = 220
_HARD = 260

_AUTH_ORDER = ("missing", "rejected", "malformed", "duplicate")
_AUTH_PHRASES = {
    "missing": "arrived with no API key",
    "rejected": "used a key the server does not recognise",
    "malformed": "sent a badly formed Authorization header",
    "duplicate": "sent more than one Authorization header",
}
_PIN_ORDER = ("pin_revoked", "pin_drift", "pin_scan_blocked", "pin_missing")
_PIN_PHRASES = {
    "pin_revoked": "the tool was revoked",
    "pin_drift": "the tool definition changed since it was approved",
    "pin_scan_blocked": "the scanner flagged the tool",
    "pin_missing": "the tool was never approved",
}
_SEVERITY_RANK = {
    "critical": 5,
    "high": 4,
    "medium": 3,
    "low": 2,
    "info": 1,
    "none": 0,
}

_SCOPE_REASON = re.compile(r"^insufficient_scope:([A-Za-z0-9_.:*-]+)$")
_SCAN_REASON = re.compile(r"^(\S+)\s+(\S+):")
_INJECTION_ACTION = re.compile(r"(?:^|\s)action=(blocked|cleaned)(?:\s|$)")
_RULE_ID = re.compile(r"^([A-Za-z]*)(\d+)$")
# Reasons are quoted only when they are short codes. Drop anything that
# could be a raw key, a bearer token, or an address.
_UNSAFE_REASON = re.compile(
    r"mcpg_|bearer\s|authorization\s*[:=]|\b(?:\d{1,3}\.){3}\d{1,3}\b|[0-9a-f]{32,}",
    re.IGNORECASE,
)


def incident_brief(incident: Incident) -> str:
    """Return one or two sentences describing this incident."""

    sentences = _sentences(incident)
    text = _fit(sentences)
    return _with_window(text, incident.first_seen, incident.last_seen)


def _sentences(incident: Incident) -> list[str]:
    kind = incident.kind
    if kind == KIND_AUTH:
        return _auth(incident)
    if kind == KIND_SCOPE:
        return _scope(incident)
    if kind == KIND_RATE_LIMIT:
        return _rate_limit(incident)
    if kind == KIND_PIN:
        return _pin(incident)
    if kind == KIND_INJECTION:
        return _injection(incident)
    if kind == KIND_SCANNER:
        return _scanner(incident)
    if kind == KIND_A2A:
        return _a2a(incident)
    return _other(incident.events)


def _auth(incident: Incident) -> list[str]:
    known: Counter[str] = Counter()
    other: list[IncidentEvent] = []
    codes: list[int] = []
    for event in incident.events:
        reason = (event.reason or "").strip()
        if reason in _AUTH_PHRASES:
            known[reason] += 1
            if event.status_code is not None:
                codes.append(event.status_code)
        else:
            other.append(event)
    if not known:
        return _other(incident.events)
    code = _shared_code(codes, default=401)
    ordered = [name for name in _AUTH_ORDER if known[name]]
    if len(ordered) == 1:
        name = ordered[0]
        count = known[name]
        lead = f"{_requests(count)} {_AUTH_PHRASES[name]}"
        sentences = [f"{lead} and {_was(count)} refused{_code(code)}."]
    else:
        parts = [f"{_requests(known[name])} {_AUTH_PHRASES[name]}" for name in ordered]
        total = sum(known.values())
        parts.append(f"they {_was(total)} refused{_code(code)}")
        sentences = [f"{_join(parts)}."]
    if other:
        sentences.extend(_other(other))
    return sentences


def _scope(incident: Incident) -> list[str]:
    scopes: Counter[str] = Counter()
    unmapped: list[IncidentEvent] = []
    other: list[IncidentEvent] = []
    codes: list[int] = []
    for event in incident.events:
        reason = (event.reason or "").strip()
        match = _SCOPE_REASON.fullmatch(reason)
        if match:
            scopes[match.group(1)] += 1
            if event.status_code is not None:
                codes.append(event.status_code)
        elif reason == "unmapped_tool":
            unmapped.append(event)
            if event.status_code is not None:
                codes.append(event.status_code)
        else:
            other.append(event)
    if not scopes and not unmapped:
        return _other(incident.events)
    covered = sum(scopes.values()) + len(unmapped)
    subject, pronoun = _actor(incident.key_prefixes, covered)
    have = "do" if pronoun == "they" else "does"
    code = _shared_code(codes, default=403)
    sentences: list[str] = []
    if len(scopes) == 1:
        scope, count = next(iter(scopes.items()))
        sentences.append(
            f"{subject} tried an action that needs {scope}, "
            f"which {pronoun} {have} not have, {_times(count)}{_code(code)}."
        )
    elif scopes:
        bits = [f"{scope} ({_times(count)})" for scope, count in scopes.most_common()]
        sentences.append(
            f"{subject} tried actions that need {_join(bits)}, "
            f"which {pronoun} {have} not have{_code(code)}."
        )
    if unmapped:
        tool_names = incident.tool_names if not scopes else []
        sentences.append(_unmapped(unmapped, subject, tool_names))
    if other:
        sentences.extend(_other(other))
    return sentences


def _unmapped(events: list[IncidentEvent], subject: str, tool_names: list[str]) -> str:
    count = len(events)
    tools = _names([event.tool_name for event in events]) or _names(tool_names)
    tail = "" if count == 1 else f" {_times(count)}"
    if len(tools) == 1:
        return (
            f"{subject} called {tools[0]}, which has no scope mapping, "
            f"so it was refused{tail}."
        )
    if len(tools) > 1:
        called = f"tools ({_join(tools)})"
    else:
        called = "a tool" if count == 1 else "tools"
    if count == 1:
        return (
            f"{subject} called {called}, which has no scope mapping, so it was refused."
        )
    return (
        f"{subject} called {called} that have no scope mapping, "
        f"so the calls were refused{tail}."
    )


def _rate_limit(incident: Incident) -> list[str]:
    count = incident.event_count or len(incident.events)
    codes = [
        event.status_code for event in incident.events if event.status_code is not None
    ]
    code = _shared_code(codes, default=429)
    refused = "1 was refused" if count == 1 else f"{count} were refused"
    prefixes = _names(incident.key_prefixes)
    if len(prefixes) == 1:
        subject = f"Key {prefixes[0]} sent requests faster than its limit"
    elif len(prefixes) > 1:
        subject = f"Keys {_join(prefixes)} sent requests faster than their limits"
    else:
        subject = "Requests arrived faster than the limit"
    return [f"{subject}; {refused}{_code(code)}."]


def _pin(incident: Incident) -> list[str]:
    drift: Counter[tuple[str, str]] = Counter()
    blocked: Counter[tuple[str, str]] = Counter()
    other: list[IncidentEvent] = []
    for event in incident.events:
        tool = _event_tool(event, incident.tool_names)
        reason = (event.reason or "").strip()
        if event.action == "tool.pin.drift":
            extra = "" if reason in {"", "pin_drift"} else _reason_code(reason)
            drift[(tool, extra)] += 1
            continue
        if reason in _PIN_PHRASES:
            blocked[(tool, reason)] += 1
            continue
        other.append(event)
    sentences: list[str] = []
    for (tool, extra), count in drift.items():
        sentence = (
            f"The live definition of {tool} no longer matches its approved fingerprint"
        )
        notes: list[str] = []
        if count > 1:
            notes.append(_times(count))
        if extra:
            notes.append(extra)
        if notes:
            sentence += f" ({', '.join(notes)})"
        sentences.append(sentence + ".")
    by_tool: dict[str, list[tuple[str, int]]] = {}
    for (tool, reason), count in blocked.items():
        by_tool.setdefault(tool, []).append((reason, count))
    for tool, rows in by_tool.items():
        rows.sort(key=lambda item: _PIN_ORDER.index(item[0]))
        if len(rows) == 1:
            reason, count = rows[0]
            sentences.append(
                f"The call to {tool} was blocked {_times(count)} "
                f"because {_PIN_PHRASES[reason]}."
            )
            continue
        bits = [
            f"{_times(count)} because {_PIN_PHRASES[reason]}" for reason, count in rows
        ]
        total = sum(count for _, count in rows)
        sentences.append(
            f"The call to {tool} was blocked {_times(total)}: {_join(bits)}."
        )
    if other:
        sentences.extend(_other(other))
    return sentences or _other(incident.events)


def _injection(incident: Incident) -> list[str]:
    tools = _names(incident.tool_names) or _names(
        [event.tool_name for event in incident.events]
    )
    tool = _join(tools) if tools else "a tool"
    blocked = 0
    cleaned = 0
    for event in incident.events:
        match = _INJECTION_ACTION.search(event.reason or "")
        if match is None:
            continue
        if match.group(1) == "blocked":
            blocked += 1
        else:
            cleaned += 1
    count = incident.event_count or len(incident.events)
    base = (
        f"The guard caught a prompt-injection pattern in the output of "
        f"{tool} {_times(count)}"
    )
    if blocked == count and cleaned == 0 and count > 0:
        return [base + " and blocked it."]
    if cleaned == count and blocked == 0 and count > 0:
        return [base + " and cleaned it."]
    sentences = [base + "."]
    if blocked and not cleaned:
        sentences.append(f"It blocked {blocked} of them.")
    elif cleaned and not blocked:
        sentences.append(f"It cleaned {cleaned} of them.")
    elif blocked or cleaned:
        notes = []
        if blocked:
            notes.append(f"blocked {blocked}")
        if cleaned:
            notes.append(f"cleaned {cleaned}")
        sentences.append(f"It {_join(notes)}.")
    return sentences


def _scanner(incident: Incident) -> list[str]:
    count = incident.event_count or len(incident.events)
    tools = _names(incident.tool_names) or _names(
        [event.tool_name for event in incident.events]
    )
    tool = _join(tools) if tools else "a tool"
    finding = "1 open finding" if count == 1 else f"{count} open findings"
    best: tuple[tuple[int, tuple[int, str]], str, str] | None = None
    for event in incident.events:
        match = _SCAN_REASON.match((event.reason or "").strip())
        if match is None:
            continue
        rule_id = match.group(1)
        severity = match.group(2)
        rank = (
            _SEVERITY_RANK.get(severity.lower(), -1),
            _rule_key(rule_id),
        )
        if best is None or rank > best[0]:
            best = (rank, rule_id, severity)
    sentence = f"The scanner has {finding} on {tool}."
    if best is None:
        return [sentence]
    _rank, rule_id, severity = best
    return [sentence, f"The highest is {rule_id} ({severity})."]


def _a2a(incident: Incident) -> list[str]:
    denied = 0
    failed = 0
    reasons: Counter[str] = Counter()
    for event in incident.events:
        action = event.action or ""
        if action == "a2a.denied":
            denied += 1
        elif action == "a2a.failed":
            failed += 1
        code = _reason_code(event.reason)
        if code:
            reasons[code] += 1
    count = denied + failed
    if count == 0:
        return _other(incident.events)
    noun = "delegation" if count == 1 else "delegations"
    if denied and not failed:
        verb = "was denied" if count == 1 else "were denied"
    elif failed and not denied:
        verb = "failed"
    else:
        verb = "was denied or failed" if count == 1 else "were denied or failed"
    sentence = f"{count} A2A {noun} {verb}"
    if not reasons:
        sentences = [sentence + "."]
    elif len(reasons) == 1:
        reason = next(iter(reasons))
        sentences = [f"{sentence}. Reason: {reason}."]
    else:
        bits = [f"{reason} ({n})" for reason, n in reasons.most_common(3)]
        sentences = [f"{sentence}. Reasons: {_join(bits)}."]
    leftover = [
        event
        for event in incident.events
        if event.action not in {"a2a.denied", "a2a.failed"}
    ]
    if leftover:
        sentences.extend(_other(leftover))
    return sentences


def _other(events: list[IncidentEvent]) -> list[str]:
    if not events:
        return ["No events are attached to this incident."]
    groups: Counter[tuple[str, str]] = Counter()
    for event in events:
        action = event.action or "event"
        groups[(action, _reason_code(event.reason))] += 1
    parts: list[str] = []
    for (action, reason), count in sorted(
        groups.items(), key=lambda item: (-item[1], item[0])
    ):
        noun = "event" if count == 1 else "events"
        if reason:
            parts.append(f"{count} denied {action} {noun} ({reason})")
        else:
            parts.append(f"{count} denied {action} {noun}")
    return [f"{_join(parts)}."]


def _fit(sentences: list[str]) -> str:
    kept = [sentence.strip() for sentence in sentences if sentence and sentence.strip()]
    if not kept:
        return "No events are attached to this incident."
    if len(kept) > 2:
        tail = "; ".join(part.removesuffix(".").strip() for part in kept[1:])
        first = kept[0] if kept[0].endswith(".") else f"{kept[0]}."
        kept = [first, f"{tail}."]
    while len(kept) > 1 and len(" ".join(kept)) > _TARGET:
        kept.pop()
    text = " ".join(kept)
    if len(text) <= _HARD:
        return text if text.endswith(".") else f"{text}."
    room = _TARGET - 1
    cut = text[:room]
    if " " in cut:
        cut = cut.rsplit(" ", 1)[0]
    cut = cut.rstrip(" ,;:.")
    return f"{cut}."


def _with_window(text: str, first: datetime, last: datetime) -> str:
    start = as_utc(first).strftime("%H:%M")
    end = as_utc(last).strftime("%H:%M")
    if start == end:
        return text
    clause = f"between {start} and {end}"
    body = text.removesuffix(".")
    candidate = f"{body} {clause}."
    if len(candidate) <= _TARGET:
        return candidate
    return text


def _requests(count: int) -> str:
    return "1 request" if count == 1 else f"{count} requests"


def _was(count: int) -> str:
    return "was" if count == 1 else "were"


def _times(count: int) -> str:
    return "1 time" if count == 1 else f"{count} times"


def _code(status: int | None) -> str:
    if status is None:
        return ""
    return f" ({status})"


def _shared_code(codes: list[int], *, default: int) -> int | None:
    if not codes:
        return default
    unique = set(codes)
    if len(unique) == 1:
        return codes[0]
    return None


def _actor(prefixes: list[str], count: int) -> tuple[str, str]:
    names = _names(prefixes)
    if len(names) == 1:
        return f"Key {names[0]}", "it"
    if len(names) > 1:
        return f"Keys {_join(names)}", "they"
    if count == 1:
        return "A request", "it"
    return "Requests", "they"


def _event_tool(event: IncidentEvent, tool_names: list[str]) -> str:
    if event.tool_name and event.tool_name.strip() and event.tool_name != "unknown":
        return event.tool_name
    names = _names(tool_names)
    if len(names) == 1:
        return names[0]
    return "a tool"


def _names(values: list[str | None]) -> list[str]:
    seen: set[str] = set()
    ordered: list[str] = []
    for value in values:
        if not value or not value.strip() or value == "unknown" or value in seen:
            continue
        seen.add(value)
        ordered.append(value)
    return ordered


def _reason_code(reason: str | None) -> str:
    if not reason:
        return ""
    text = " ".join(reason.split()).replace(". ", ", ").removesuffix(".")
    if not text or _UNSAFE_REASON.search(text):
        return ""
    if len(text) > 80:
        text = text[:80].rsplit(" ", 1)[0].rstrip(" ,;:.")
    return text


def _rule_key(rule_id: str) -> tuple[int, str]:
    match = _RULE_ID.fullmatch(rule_id)
    if match:
        return int(match.group(2)), match.group(1)
    return -1, rule_id


def _join(parts: list[str]) -> str:
    if not parts:
        return ""
    if len(parts) == 1:
        return parts[0]
    if len(parts) == 2:
        return f"{parts[0]} and {parts[1]}"
    return ", ".join(parts[:-1]) + ", and " + parts[-1]
