import logging
import uuid
from collections import defaultdict
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Literal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit.events import AuditRecord
from app.audit.redaction import safe_tool_name
from app.audit.sink import record_event
from app.config import settings
from app.database import async_session_maker
from app.models.tool_scan_findings import ToolScanFinding
from app.scanner.ai import ai_scan_tool
from app.scanner.engine import scan_tool
from app.scanner.types import ScannerFinding
from app.tools.catalog import (
    fingerprint_tool,
    get_tool_definition,
    list_tool_definitions,
)

logger = logging.getLogger(__name__)

ACTION_TOOL_SCAN_COMPLETED = "tool.scan.completed"
ACTION_TOOL_SCAN_FINDING = "tool.scan.finding"


@dataclass
class ScanStats:
    scan_id: str
    tools_scanned: int
    findings_open: int
    by_severity: dict[str, int]
    ai_checked: int = 0
    ai_unavailable: int = 0


async def _sync_findings_for_tool(
    session: AsyncSession,
    tool_name: str,
    fingerprint: str,
    drafts: list[ScannerFinding],
    scan_id: str,
    source: Literal["rule", "ai"] = "rule",
) -> list[ToolScanFinding]:
    """Synchronize open findings for a tool scoped by source (rule vs ai).

    Rule scans only inspect and resolve non-AI findings.
    AI scans only inspect and resolve AI findings.
    """
    statement = select(ToolScanFinding).where(
        ToolScanFinding.tool_name == tool_name, ToolScanFinding.resolved_at.is_(None)
    )
    result = await session.execute(statement)
    all_open_findings = list(result.scalars().all())

    if source == "rule":
        scoped_open = [f for f in all_open_findings if not f.rule_id.startswith("AI")]
    else:
        scoped_open = [f for f in all_open_findings if f.rule_id.startswith("AI")]

    if source == "ai":

        def sig(f):
            return (f.fingerprint, f.rule_id)

        open_dict = {sig(f): f for f in scoped_open}
        draft_dict = {(fingerprint, d.rule_id): d for d in drafts}
    else:

        def sig(f):
            return (f.fingerprint, f.rule_id, f.message)

        open_dict = {sig(f): f for f in scoped_open}
        draft_dict = {(fingerprint, d.rule_id, d.message): d for d in drafts}

    new_db_findings = []
    now = datetime.now(UTC)

    for sig_key, f in open_dict.items():
        if sig_key not in draft_dict:
            f.resolved_at = now

    for sig_key, d in draft_dict.items():
        if sig_key not in open_dict:
            msg = d.message[:300] if d.message else ""
            evd = d.evidence[:200] if d.evidence else None
            new_db_findings.append(
                ToolScanFinding(
                    tool_name=tool_name,
                    fingerprint=fingerprint,
                    rule_id=d.rule_id,
                    severity=d.severity,
                    message=msg,
                    evidence=evd,
                    created_at=now,
                    scan_id=scan_id,
                )
            )

    if new_db_findings:
        session.add_all(new_db_findings)

    active = []
    for f in all_open_findings:
        if f.resolved_at is None:
            active.append(f)
    active.extend(new_db_findings)
    return active


async def run_scan_one(tool_name: str, ai: bool = False) -> ScanStats | None:
    defn = get_tool_definition(tool_name)
    if not defn:
        return None

    scan_id = str(uuid.uuid4())

    stats = ScanStats(
        scan_id=scan_id,
        tools_scanned=1,
        findings_open=0,
        by_severity=defaultdict(int),
        ai_checked=0,
        ai_unavailable=0,
    )

    fingerprint = fingerprint_tool(defn)

    try:
        rule_drafts = scan_tool(defn)
    except Exception:
        logger.exception("Scan crashed for tool %s", defn.name)
        rule_drafts = []

    ai_drafts: list[ScannerFinding] | None = None
    if ai and settings.scanner_ai_enabled and settings.llm_enabled:
        ai_drafts = await ai_scan_tool(defn)
        if ai_drafts is not None:
            stats.ai_checked += 1
        else:
            stats.ai_unavailable += 1

    async with async_session_maker() as session:
        await _sync_findings_for_tool(
            session, tool_name, fingerprint, rule_drafts, scan_id, source="rule"
        )
        if ai and ai_drafts is not None:
            await _sync_findings_for_tool(
                session, tool_name, fingerprint, ai_drafts, scan_id, source="ai"
            )
        await session.commit()

        # Determine actual new findings this run
        statement = select(ToolScanFinding).where(ToolScanFinding.scan_id == scan_id)
        result = await session.execute(statement)
        for new_f in result.scalars().all():
            if new_f.severity not in {"none", "info"}:
                try:
                    await record_event(
                        AuditRecord(
                            action=ACTION_TOOL_SCAN_FINDING,
                            status="ok",
                            decision="allowed",
                            tool_name=safe_tool_name(tool_name),
                            reason=(
                                f"finding {new_f.rule_id} severity={new_f.severity}"
                            ),
                        ),
                        required=False,
                    )
                except Exception:
                    logger.exception("Failed to emit audit event")

        open_stmt = select(ToolScanFinding).where(
            ToolScanFinding.tool_name == tool_name,
            ToolScanFinding.resolved_at.is_(None),
        )
        active = list((await session.execute(open_stmt)).scalars().all())
        stats.findings_open = len(active)
        for f in active:
            stats.by_severity[f.severity] += 1

    audit_reason = f"scanned=1 findings={stats.findings_open}"
    if stats.ai_checked > 0 or stats.ai_unavailable > 0:
        audit_reason += (
            f" ai_checked={stats.ai_checked} ai_unavailable={stats.ai_unavailable}"
        )

    try:
        await record_event(
            AuditRecord(
                action=ACTION_TOOL_SCAN_COMPLETED,
                status="ok",
                decision="allowed",
                tool_name=safe_tool_name(tool_name),
                reason=audit_reason,
            ),
            required=False,
        )
    except Exception:
        logger.exception("Failed to record audit event for single tool scan completion")

    stats.by_severity = dict(stats.by_severity)
    return stats


async def run_scan_all(ai: bool = False) -> ScanStats:
    scan_id = str(uuid.uuid4())
    stats = ScanStats(
        scan_id=scan_id,
        tools_scanned=0,
        findings_open=0,
        by_severity=defaultdict(int),
        ai_checked=0,
        ai_unavailable=0,
    )

    definitions = list_tool_definitions()

    for defn in definitions:
        stats.tools_scanned += 1
        fingerprint = fingerprint_tool(defn)

        try:
            rule_drafts = scan_tool(defn)
        except Exception:
            logger.exception("Scan crashed for tool %s", defn.name)
            rule_drafts = []

        ai_drafts: list[ScannerFinding] | None = None
        if ai and settings.scanner_ai_enabled and settings.llm_enabled:
            ai_drafts = await ai_scan_tool(defn)
            if ai_drafts is not None:
                stats.ai_checked += 1
            else:
                stats.ai_unavailable += 1

        async with async_session_maker() as session:
            try:
                await _sync_findings_for_tool(
                    session, defn.name, fingerprint, rule_drafts, scan_id, source="rule"
                )
                if ai and ai_drafts is not None:
                    await _sync_findings_for_tool(
                        session,
                        defn.name,
                        fingerprint,
                        ai_drafts,
                        scan_id,
                        source="ai",
                    )
                await session.commit()

                # Audit newly inserted findings
                statement = select(ToolScanFinding).where(
                    ToolScanFinding.scan_id == scan_id,
                    ToolScanFinding.tool_name == defn.name,
                )
                result = await session.execute(statement)
                for new_f in result.scalars().all():
                    if new_f.severity not in {"none", "info"}:
                        try:
                            await record_event(
                                AuditRecord(
                                    action=ACTION_TOOL_SCAN_FINDING,
                                    status="ok",
                                    decision="allowed",
                                    tool_name=safe_tool_name(defn.name),
                                    reason=(
                                        f"finding {new_f.rule_id} "
                                        f"severity={new_f.severity}"
                                    ),
                                ),
                                required=False,
                            )
                        except Exception:
                            logger.exception("Failed to emit audit event")

                open_stmt = select(ToolScanFinding).where(
                    ToolScanFinding.tool_name == defn.name,
                    ToolScanFinding.resolved_at.is_(None),
                )
                active = list((await session.execute(open_stmt)).scalars().all())
                stats.findings_open += len(active)
                for f in active:
                    stats.by_severity[f.severity] += 1
            except Exception:
                logger.exception("Failed to sync findings for tool %s", defn.name)

    audit_reason = f"scanned={stats.tools_scanned} findings={stats.findings_open}"
    if stats.ai_checked > 0 or stats.ai_unavailable > 0:
        audit_reason += (
            f" ai_checked={stats.ai_checked} ai_unavailable={stats.ai_unavailable}"
        )

    try:
        await record_event(
            AuditRecord(
                action=ACTION_TOOL_SCAN_COMPLETED,
                status="ok",
                decision="allowed",
                reason=audit_reason,
            ),
            required=False,
        )
    except Exception:
        logger.exception("Failed to record audit event for scan completion")

    stats.by_severity = dict(stats.by_severity)
    return stats
