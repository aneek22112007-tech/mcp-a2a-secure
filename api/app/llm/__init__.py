"""LLM backend used by MCP Guard agents.

The model advises. Gateway checks stay in ordinary code.
"""

from app.llm.backend import (
    LLMBackend,
    LLMDisabledError,
    LLMInvocation,
    LLMUnavailableError,
)
from app.llm.health import LLMHealth, check_health
from app.llm.recording import (
    LLMCallRecord,
    LLMCallRecorder,
    get_recorder,
    set_recorder,
)

__all__ = [
    "LLMBackend",
    "LLMCallRecord",
    "LLMCallRecorder",
    "LLMDisabledError",
    "LLMHealth",
    "LLMInvocation",
    "LLMUnavailableError",
    "check_health",
    "get_recorder",
    "set_recorder",
]
