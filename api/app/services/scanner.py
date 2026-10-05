import logging
import uuid
from collections import defaultdict
from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit.events import AuditRecord
from app.audit.sink import record_event
from app.database import async_session_maker
from app.models.tool_scan_findings import ToolScanFinding
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


async def _sync_findings_for_tool(
    session: AsyncSession,
    tool_name: str,
    fingerprint: str,
    drafts: list[ScannerFinding],
    scan_id: str,
) -> list[ToolScanFinding]:
    """Synchronize open findings for a tool, resolving old ones and inserting new ones without duplicates."""
    statement = select(ToolScanFinding).where(
        ToolScanFinding.tool_name == tool_name, ToolScanFinding.resolved_at.is_(None)
    )
    result = await session.execute(statement)
    open_findings = list(result.scalars().all())

    def sig(f):
        return (f.fingerprint, f.rule_id, f.message)

    open_dict = {sig(f): f for f in open_findings}

    # Always include a success marker for this fingerprint
    success_marker = ScannerFinding(
        rule_id="R0_SCANNED", severity="info", message="Scan complete", evidence=None
    )
    drafts.append(success_marker)

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
    for f in open_findings:
        if f.resolved_at is None:
            active.append(f)
    active.extend(new_db_findings)
    return active


async def run_scan_one(tool_name: str) -> ScanStats | None:
    defn = get_tool_definition(tool_name)
    if not defn:
        return None

    scan_id = str(uuid.uuid4())

    stats = ScanStats(
        scan_id=scan_id, tools_scanned=1, findings_open=0, by_severity=defaultdict(int)
    )

    fingerprint = fingerprint_tool(defn)

    try:
        drafts = scan_tool(defn)
    except Exception:
        logger.exception("Scan crashed for tool %s", defn.name)
        drafts = []

    async with async_session_maker() as session:
        active = await _sync_findings_for_tool(
            session, tool_name, fingerprint, drafts, scan_id
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
                            reason=f"finding {new_f.rule_id} for {tool_name}",
                        ),
                        required=False,
                    )
                except Exception:
                    logger.exception("Failed to emit audit event")

        stats.findings_open = len([f for f in active if f.rule_id != "R0_SCANNED"])
        for f in active:
            if f.rule_id != "R0_SCANNED":
                stats.by_severity[f.severity] += 1

    stats.by_severity = dict(stats.by_severity)
    return stats


async def run_scan_all() -> ScanStats:
    scan_id = str(uuid.uuid4())
    stats = ScanStats(
        scan_id=scan_id, tools_scanned=0, findings_open=0, by_severity=defaultdict(int)
    )

    definitions = list_tool_definitions()

    for defn in definitions:
        stats.tools_scanned += 1
        fingerprint = fingerprint_tool(defn)

        try:
            drafts = scan_tool(defn)
        except Exception:
            logger.exception("Scan crashed for tool %s", defn.name)
            drafts = []

        async with async_session_maker() as session:
            try:
                active = await _sync_findings_for_tool(
                    session, defn.name, fingerprint, drafts, scan_id
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
                                    reason=f"finding {new_f.rule_id} for {defn.name}",
                                ),
                                required=False,
                            )
                        except Exception:
                            logger.exception("Failed to emit audit event")

                stats.findings_open += len(
                    [f for f in active if f.rule_id != "R0_SCANNED"]
                )
                for f in active:
                    if f.rule_id != "R0_SCANNED":
                        stats.by_severity[f.severity] += 1
            except Exception:
                logger.exception("Failed to sync findings for tool %s", defn.name)

    try:
        await record_event(
            AuditRecord(
                action=ACTION_TOOL_SCAN_COMPLETED,
                status="ok",
                decision="allowed",
                reason=f"scanned={stats.tools_scanned} findings={stats.findings_open}",
            ),
            required=False,
        )
    except Exception:
        logger.exception("Failed to record audit event for scan completion")

    stats.by_severity = dict(stats.by_severity)
    return stats
