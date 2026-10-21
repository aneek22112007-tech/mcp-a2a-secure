"""Chat model adapter.

Ollama is the primary provider. Groq is used only when Ollama cannot be
reached or the call times out. A bad or empty reply is not a reason to
switch providers.
"""

from __future__ import annotations

import asyncio
import logging
import time
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime

from langchain_core.messages import BaseMessage
from langchain_groq import ChatGroq
from langchain_ollama import ChatOllama

from app.config import settings
from app.llm.recording import LLMCallRecord, get_recorder

logger = logging.getLogger(__name__)

_FALLBACK_NAMES = frozenset(
    {
        "APIConnectionError",
        "APITimeoutError",
        "ConnectError",
        "ConnectTimeout",
        "ConnectionError",
        "ConnectionRefusedError",
        "NetworkError",
        "PoolTimeout",
        "ReadTimeout",
        "TimeoutError",
        "TimeoutException",
        "WriteTimeout",
    }
)
_MAX_CAUSE_DEPTH = 8


class LLMDisabledError(RuntimeError):
    """LLM calls are turned off. Set LLM_ENABLED=true to use the backend."""


class LLMUnavailableError(RuntimeError):
    """The model could not answer. The message is safe to show to a client."""


@dataclass(frozen=True, slots=True)
class LLMInvocation:
    """Text returned by one ``invoke`` call, plus the provider that produced it."""

    text: str
    provider: str
    model: str
    latency_ms: int
    input_tokens: int | None
    output_tokens: int | None
    fell_back: bool


class LLMBackend:
    """Primary ChatOllama model, with ChatGroq as a connection fallback."""

    def get_chat_model(self) -> ChatOllama:
        """Return the primary Ollama chat model.

        Thinking mode is off so the reply is the message content and the
        call stays inside ``LLM_TIMEOUT_SECONDS``.
        """

        if not settings.llm_enabled:
            raise LLMDisabledError("LLM is disabled. Set LLM_ENABLED=true.")
        return ChatOllama(
            model=settings.ollama_model,
            base_url=settings.ollama_base_url,
            temperature=0,
            reasoning=False,
            num_predict=1024,
            validate_model_on_init=False,
            client_kwargs={"timeout": settings.llm_timeout_seconds},
        )

    async def invoke(
        self,
        messages: Sequence[BaseMessage],
        *,
        purpose: str,
        key_prefix: str | None = None,
        request_id: str | None = None,
    ) -> LLMInvocation:
        """Call the primary model, then Groq only on a connection or timeout.

        Records every successful and failed attempt.
        """

        if not settings.llm_enabled:
            await _record(
                provider="",
                model="",
                purpose=purpose,
                status="disabled",
                latency_ms=0,
                input_tokens=None,
                output_tokens=None,
                fell_back=False,
                key_prefix=key_prefix,
                request_id=request_id,
                error="LLMDisabledError",
            )
            raise LLMDisabledError("LLM is disabled. Set LLM_ENABLED=true.")

        started = time.perf_counter()
        try:
            message = await _call(self.get_chat_model(), messages)
        except Exception as exc:
            latency_ms = _elapsed_ms(started)
            await _record(
                provider="ollama",
                model=settings.ollama_model,
                purpose=purpose,
                status="error",
                latency_ms=latency_ms,
                input_tokens=None,
                output_tokens=None,
                fell_back=False,
                key_prefix=key_prefix,
                request_id=request_id,
                error=type(exc).__name__,
            )
            _log_failure("ollama", exc, purpose, request_id)
            if not _is_connection_or_timeout(exc):
                raise LLMUnavailableError("The LLM call failed.") from exc
            return await self._fallback(
                messages,
                purpose=purpose,
                key_prefix=key_prefix,
                request_id=request_id,
            )

        return await _success(
            message,
            provider="ollama",
            model=settings.ollama_model,
            started=started,
            fell_back=False,
            purpose=purpose,
            key_prefix=key_prefix,
            request_id=request_id,
        )

    def _groq_model(self) -> ChatGroq:
        secret = settings.groq_api_key
        if secret is None or not secret.get_secret_value().strip():
            raise LLMUnavailableError("Groq is not configured.")
        return ChatGroq(
            model=settings.groq_model,
            groq_api_key=secret.get_secret_value(),
            timeout=settings.llm_timeout_seconds,
            max_retries=0,
            temperature=0,
            max_tokens=1024,
        )

    async def _fallback(
        self,
        messages: Sequence[BaseMessage],
        *,
        purpose: str,
        key_prefix: str | None,
        request_id: str | None,
    ) -> LLMInvocation:
        try:
            model = self._groq_model()
        except LLMUnavailableError:
            raise LLMUnavailableError(
                "Ollama is unreachable and Groq is not configured."
            ) from None

        started = time.perf_counter()
        try:
            message = await _call(model, messages)
        except Exception as exc:
            await _record(
                provider="groq",
                model=settings.groq_model,
                purpose=purpose,
                status="error",
                latency_ms=_elapsed_ms(started),
                input_tokens=None,
                output_tokens=None,
                fell_back=True,
                key_prefix=key_prefix,
                request_id=request_id,
                error=type(exc).__name__,
            )
            _log_failure("groq", exc, purpose, request_id)
            raise LLMUnavailableError("The LLM call failed.") from exc

        return await _success(
            message,
            provider="groq",
            model=settings.groq_model,
            started=started,
            fell_back=True,
            purpose=purpose,
            key_prefix=key_prefix,
            request_id=request_id,
        )


def _is_connection_or_timeout(exc: BaseException) -> bool:
    """True for a connection failure or a timeout, including a wrapped one."""

    current: BaseException | None = exc
    seen: set[int] = set()
    depth = 0
    while current is not None and id(current) not in seen and depth < _MAX_CAUSE_DEPTH:
        seen.add(id(current))
        depth += 1
        if isinstance(current, BaseExceptionGroup):
            return any(_is_connection_or_timeout(item) for item in current.exceptions)
        if isinstance(current, (TimeoutError, ConnectionError)):
            return True
        if type(current).__name__ in _FALLBACK_NAMES:
            return True
        cause = current.__cause__
        if cause is None and not current.__suppress_context__:
            cause = current.__context__
        current = cause
    return False


async def _call(model: ChatOllama | ChatGroq, messages: Sequence[BaseMessage]):
    return await asyncio.wait_for(
        model.ainvoke(list(messages)),
        timeout=settings.llm_timeout_seconds,
    )


async def _success(
    message: object,
    *,
    provider: str,
    model: str,
    started: float,
    fell_back: bool,
    purpose: str,
    key_prefix: str | None,
    request_id: str | None,
) -> LLMInvocation:
    text = _message_text(message)
    input_tokens, output_tokens = _token_counts(message)
    latency_ms = _elapsed_ms(started)
    await _record(
        provider=provider,
        model=model,
        purpose=purpose,
        status="ok",
        latency_ms=latency_ms,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        fell_back=fell_back,
        key_prefix=key_prefix,
        request_id=request_id,
        error=None,
    )
    return LLMInvocation(
        text=text,
        provider=provider,
        model=model,
        latency_ms=latency_ms,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        fell_back=fell_back,
    )


async def _record(**kwargs: object) -> None:
    created_at = kwargs.pop("created_at", None)
    if not isinstance(created_at, datetime):
        created_at = datetime.now(UTC)
    record = LLMCallRecord(created_at=created_at, **kwargs)  # type: ignore[arg-type]
    try:
        await get_recorder().record(record)
    except Exception as exc:  # noqa: BLE001
        logger.error("llm recorder failed type=%s", type(exc).__name__)


def _log_failure(
    provider: str,
    exc: BaseException,
    purpose: str,
    request_id: str | None,
) -> None:
    logger.warning(
        "llm call failed provider=%s type=%s purpose=%s request_id=%s",
        provider,
        type(exc).__name__,
        purpose,
        request_id or "-",
    )


def _elapsed_ms(started: float) -> int:
    return max(0, int((time.perf_counter() - started) * 1000))


def _message_text(message: object) -> str:
    content = getattr(message, "content", "")
    text = _content_text(content)
    if text:
        return text
    extra = getattr(message, "additional_kwargs", None) or {}
    if isinstance(extra, dict):
        for key in ("reasoning_content", "reasoning", "thinking"):
            value = extra.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
    return ""


def _content_text(content: object) -> str:
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        parts: list[str] = []
        for block in content:
            if isinstance(block, str):
                parts.append(block)
            elif isinstance(block, dict) and isinstance(block.get("text"), str):
                parts.append(block["text"])
        return "\n".join(part for part in parts if part).strip()
    return ""


def _token_counts(message: object) -> tuple[int | None, int | None]:
    usage = getattr(message, "usage_metadata", None)
    if not usage:
        meta = getattr(message, "response_metadata", None) or {}
        if isinstance(meta, dict):
            usage = meta.get("token_usage") or meta.get("usage") or None
    if not usage:
        return None, None
    return (
        _as_int(_usage_value(usage, "input_tokens", "prompt_tokens")),
        _as_int(_usage_value(usage, "output_tokens", "completion_tokens")),
    )


def _usage_value(usage: object, *names: str) -> object:
    for name in names:
        if isinstance(usage, dict) and usage.get(name) is not None:
            return usage[name]
        value = getattr(usage, name, None)
        if value is not None:
            return value
    return None


def _as_int(value: object) -> int | None:
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float) and value.is_integer():
        return int(value)
    return None
