"""Readiness of the configured LLM providers.

The Groq key is never included. ``groq_configured`` is only true or false.
"""

from __future__ import annotations

import logging

import httpx
from pydantic import BaseModel

from app.config import settings

logger = logging.getLogger(__name__)

_PROBE_TIMEOUT_SECONDS = 2.0


class LLMHealth(BaseModel):
    enabled: bool
    ollama_reachable: bool
    ollama_model: str
    ollama_model_present: bool
    groq_configured: bool


async def check_health() -> LLMHealth:
    """Report enablement, Ollama reachability, and whether Groq has a key."""

    reachable, model_present = await _probe_ollama()
    return LLMHealth(
        enabled=settings.llm_enabled,
        ollama_reachable=reachable,
        ollama_model=settings.ollama_model,
        ollama_model_present=model_present,
        groq_configured=_groq_configured(),
    )


def _groq_configured() -> bool:
    secret = settings.groq_api_key
    if secret is None:
        return False
    return bool(secret.get_secret_value().strip())


async def _probe_ollama() -> tuple[bool, bool]:
    url = f"{settings.ollama_base_url}/api/tags"
    try:
        async with httpx.AsyncClient(timeout=_PROBE_TIMEOUT_SECONDS) as client:
            response = await client.get(url)
    except (httpx.HTTPError, OSError) as exc:
        logger.warning("ollama health probe failed type=%s", type(exc).__name__)
        return False, False
    if response.status_code != 200:
        return True, False
    try:
        body = response.json()
    except ValueError:
        return True, False
    models = body.get("models") if isinstance(body, dict) else None
    if not isinstance(models, list):
        return True, False
    return True, _model_present(models, settings.ollama_model)


def _model_present(models: list[object], wanted: str) -> bool:
    for item in models:
        if not isinstance(item, dict):
            continue
        for key in ("name", "model"):
            value = item.get(key)
            if isinstance(value, str) and _name_matches(value, wanted):
                return True
    return False


def _name_matches(listed: str, wanted: str) -> bool:
    return listed == wanted or listed.startswith(f"{wanted}:")
