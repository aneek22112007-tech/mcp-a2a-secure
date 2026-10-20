"""Records of LLM calls.

``LLMCallRecorder`` logs each call. A later database writer for the
``llm_calls`` table can replace it with ``set_recorder()``.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime
from typing import Protocol

from app.audit.redaction import safe_reason

logger = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class LLMCallRecord:
    """One LLM attempt. ``error`` is an exception type name, never a secret."""

    provider: str
    model: str
    purpose: str
    status: str
    latency_ms: int
    input_tokens: int | None
    output_tokens: int | None
    fell_back: bool
    key_prefix: str | None
    request_id: str | None
    error: str | None
    created_at: datetime


class LLMCallRecorder:
    """Log each LLM call. Does not write to the database."""

    async def record(self, rec: LLMCallRecord) -> None:
        logger.info(
            "llm call provider=%s model=%s purpose=%s status=%s latency_ms=%s "
            "input_tokens=%s output_tokens=%s fell_back=%s key_prefix=%s "
            "request_id=%s error=%s",
            safe_reason(rec.provider) or "-",
            safe_reason(rec.model) or "-",
            safe_reason(rec.purpose) or "-",
            safe_reason(rec.status) or "-",
            rec.latency_ms,
            rec.input_tokens if rec.input_tokens is not None else "-",
            rec.output_tokens if rec.output_tokens is not None else "-",
            rec.fell_back,
            safe_reason(rec.key_prefix) or "-",
            safe_reason(rec.request_id) or "-",
            safe_reason(rec.error) or "-",
        )


class SupportsLLMRecord(Protocol):
    """Anything with ``record`` can replace the default logger."""

    async def record(self, rec: LLMCallRecord) -> None: ...


_recorder: SupportsLLMRecord = LLMCallRecorder()


def get_recorder() -> SupportsLLMRecord:
    return _recorder


def set_recorder(recorder: SupportsLLMRecord) -> None:
    """Install a recorder. A future ``llm_calls`` writer uses this hook."""

    global _recorder
    _recorder = recorder
