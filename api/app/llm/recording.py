"""Records of LLM calls.

``LLMCallRecorder`` logs each call. A later database writer for the
``llm_calls`` table can replace it with ``set_recorder()``.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Protocol

from app.audit.redaction import current_request_id, safe_reason
from app.sandbox.context import current_execution_context

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
    """Log each LLM call."""

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


class DbLLMCallRecorder(LLMCallRecorder):
    """Log each LLM call and persist to the llm_calls database table."""

    async def record(self, rec: LLMCallRecord) -> None:
        await super().record(rec)

        request_id = rec.request_id
        if not request_id:
            request_id = current_request_id()
        if not request_id:
            ctx = current_execution_context()
            if ctx:
                request_id = ctx.request_id

        key_prefix = rec.key_prefix
        if not key_prefix:
            ctx = current_execution_context()
            if ctx:
                key_prefix = ctx.key_prefix

        created_at = rec.created_at
        if created_at.tzinfo is None:
            created_at = created_at.replace(tzinfo=UTC)

        try:
            from app import database
            from app.models.llm_calls import LLMCall

            async with database.async_session_maker() as session:
                call_row = LLMCall(
                    model=rec.model or "unknown",
                    provider=rec.provider or "unknown",
                    purpose=rec.purpose[:50] if rec.purpose else "",
                    error=rec.error[:500] if rec.error else None,
                    input_tokens=rec.input_tokens,
                    output_tokens=rec.output_tokens,
                    latency_ms=float(rec.latency_ms),
                    status=rec.status or "unknown",
                    fell_back=bool(rec.fell_back),
                    key_prefix=key_prefix or "",
                    request_id=request_id or "",
                    created_at=created_at,
                )
                session.add(call_row)
                await session.commit()
        except Exception as exc:  # noqa: BLE001
            logger.error(
                "Failed to persist LLM call record type=%s", type(exc).__name__
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
