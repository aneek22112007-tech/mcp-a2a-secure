"""Check a model reply before it is stored or shown.

A reply that fails any check raises AnalystOutputError. There is no second prompt.
"""

from __future__ import annotations

import json
import re
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from app.analyst.errors import AnalystOutputError
from app.config import settings
from app.guard.rules import scan_text
from app.text_normalize import normalize_for_scan

# Same pattern as notes_agent._THINK_RE. Copied so this module does not import the agent.
_THINK_RE = re.compile(r"<think>.*?</think>", re.DOTALL | re.IGNORECASE)
_FENCE_RE = re.compile(r"^```(?:json)?\s*\n?(.*?)\n?```$", re.DOTALL | re.IGNORECASE)
_LEAK_RE = re.compile(r"mcpg_|https?://", re.IGNORECASE)
_SEPARATORS = re.compile(r"[_.:-]+")
_UNSAFE = frozenset({"high", "critical"})

_Step = Annotated[str, Field(min_length=1, max_length=200)]


class TimelineItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str = Field(min_length=1, max_length=240)
    refs: list[str] = Field(min_length=1, max_length=10)


class ReportBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    summary: str = Field(min_length=1, max_length=600)
    timeline: list[TimelineItem] = Field(min_length=1, max_length=6)
    likely_cause: str = Field(max_length=400)
    impact: str = Field(max_length=400)
    next_steps: list[_Step] = Field(max_length=4)
    confidence: Literal["low", "medium", "high"]


def _reject(reason: str) -> None:
    raise AnalystOutputError(reason)


def _strip_wrappers(text: str) -> str:
    stripped = _THINK_RE.sub("", text).strip()
    fenced = _FENCE_RE.fullmatch(stripped)
    if fenced is not None:
        return fenced.group(1).strip()
    return stripped


def _joined(body: ReportBody) -> str:
    parts = [body.summary, body.likely_cause, body.impact, *body.next_steps]
    parts.extend(item.text for item in body.timeline)
    return "\n".join(parts)


def _unsafe(text: str) -> bool:
    if _LEAK_RE.search(text):
        return True
    view = _SEPARATORS.sub(" ", normalize_for_scan(text))
    for sample in (text, view):
        for match in scan_text(sample):
            if match.severity in _UNSAFE:
                return True
    return False


def parse_report(text: str, *, refs: set[str]) -> ReportBody:
    """Accept one JSON object whose timeline cites only ``refs``."""

    if len(text) > settings.analyst_max_output_chars:
        _reject("too_long")
    raw = _strip_wrappers(text)
    try:
        loaded = json.loads(raw)
    except json.JSONDecodeError:
        _reject("not_json")
    if not isinstance(loaded, dict):
        _reject("not_json")
    try:
        body = ReportBody.model_validate(loaded)
    except ValidationError:
        _reject("invalid_shape")
    for item in body.timeline:
        for ref in item.refs:
            if ref not in refs:
                _reject("unknown_ref")
    if _unsafe(_joined(body)):
        _reject("unsafe_output")
    return body
