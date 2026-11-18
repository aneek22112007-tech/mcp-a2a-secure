"""AI scanner pass exercised with a fixed reply, never a live model."""

from __future__ import annotations

import json

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

import app.services.scanner as scanner_service
from app.config import settings
from app.llm.backend import LLMBackend, LLMInvocation
from app.main import app
from app.models import Base
from app.models.tool_scan_findings import ToolScanFinding
from app.scanner.ai import RULE_ID_AI, ai_scan_tool, clear_ai_cache
from app.services.scanner import run_scan_one
from app.tools.catalog import ToolDefinition, fingerprint_tool, get_tool_definition

pytestmark = pytest.mark.anyio

_AUTH = {"Authorization": "Bearer mcpg_admin"}


def _reply(text: str) -> LLMInvocation:
    return LLMInvocation(
        text=text,
        provider="fixed",
        model="fixed",
        latency_ms=1,
        input_tokens=1,
        output_tokens=1,
        fell_back=False,
    )


def _patch_reply(monkeypatch, text: str) -> None:
    async def invoke(self, messages, purpose="scanner.ai", **kwargs):
        return _reply(text)

    monkeypatch.setattr(LLMBackend, "invoke", invoke)


@pytest.fixture(autouse=True)
def _clear_scanner_cache():
    clear_ai_cache()
    yield
    clear_ai_cache()


def _sample_tool() -> ToolDefinition:
    return ToolDefinition(
        name="notes_reader",
        description="Read a note from the vault.",
        input_schema={"type": "object", "properties": {}},
        output_schema=None,
    )


def _enable_ai(monkeypatch) -> None:
    monkeypatch.setattr(settings, "scanner_enabled", True)
    monkeypatch.setattr(settings, "scanner_ai_enabled", True)
    monkeypatch.setattr(settings, "llm_enabled", True)


async def test_valid_json_returns_one_capped_finding(monkeypatch):
    _enable_ai(monkeypatch)
    monkeypatch.setattr(settings, "scanner_ai_max_severity", "low")
    tool = _sample_tool()
    _patch_reply(
        monkeypatch,
        json.dumps(
            {
                "verdict": "malicious",
                "category": "hidden_instruction",
                "reason": "asks the caller to ignore the note boundary",
                "evidence": "Read a note",
            }
        ),
    )

    findings = await ai_scan_tool(tool)

    assert findings is not None
    assert len(findings) == 1
    assert findings[0].rule_id == RULE_ID_AI
    assert findings[0].severity == settings.scanner_ai_max_severity


async def test_invalid_json_or_empty_reply_returns_no_findings(monkeypatch):
    _enable_ai(monkeypatch)
    tool = _sample_tool()

    _patch_reply(monkeypatch, "not json at all")
    assert await ai_scan_tool(tool) is None

    clear_ai_cache()
    _patch_reply(monkeypatch, "   ")
    assert await ai_scan_tool(tool) is None


async def test_no_issues_json_returns_no_findings(monkeypatch):
    _enable_ai(monkeypatch)
    _patch_reply(
        monkeypatch,
        json.dumps(
            {
                "verdict": "safe",
                "category": "none",
                "reason": "no issues",
                "evidence": "",
            }
        ),
    )

    assert await ai_scan_tool(_sample_tool()) == []


async def test_second_scan_of_same_tool_does_not_duplicate_finding(
    monkeypatch, tmp_path
):
    _enable_ai(monkeypatch)
    tool = get_tool_definition("list_notes")
    assert tool is not None
    evidence = tool.description.strip().splitlines()[0]
    replies = [
        json.dumps(
            {
                "verdict": "suspicious",
                "category": "other",
                "reason": "first reason stays",
                "evidence": evidence,
            }
        ),
        json.dumps(
            {
                "verdict": "suspicious",
                "category": "other",
                "reason": "second reason must not insert",
                "evidence": evidence,
            }
        ),
    ]
    cursor = {"index": 0}

    async def invoke(self, messages, purpose="scanner.ai", **kwargs):
        text = replies[cursor["index"]]
        cursor["index"] += 1
        return _reply(text)

    monkeypatch.setattr(LLMBackend, "invoke", invoke)

    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path}/scanner_ai.db")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    monkeypatch.setattr(scanner_service, "async_session_maker", maker)

    first = await run_scan_one(tool.name, ai=True)
    clear_ai_cache()
    second = await run_scan_one(tool.name, ai=True)
    assert first is not None and second is not None
    assert cursor["index"] == 2

    async with maker() as session:
        result = await session.execute(
            select(ToolScanFinding).where(
                ToolScanFinding.tool_name == tool.name,
                ToolScanFinding.rule_id == RULE_ID_AI,
            )
        )
        rows = list(result.scalars().all())

    await engine.dispose()

    assert len(rows) == 1
    assert rows[0].fingerprint == fingerprint_tool(tool)
    assert rows[0].rule_id == RULE_ID_AI
    assert "first reason stays" in rows[0].message


async def test_ai_scan_route_returns_409_when_disabled(monkeypatch):
    monkeypatch.setattr(settings, "scanner_enabled", True)
    monkeypatch.setattr(settings, "scanner_ai_enabled", False)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/scanner/run",
            params={"ai": "true"},
            headers=_AUTH,
        )
    assert response.status_code == 409
