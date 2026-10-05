from datetime import UTC, datetime

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.tool_scan_findings import ToolScanFinding
from app.repos.common import normalize_page


async def add_findings(session: AsyncSession, findings: list[ToolScanFinding]) -> None:
    if findings:
        session.add_all(findings)


async def resolve_open_for_tool(session: AsyncSession, tool_name: str) -> int:
    statement = (
        update(ToolScanFinding)
        .where(
            ToolScanFinding.tool_name == tool_name,
            ToolScanFinding.resolved_at.is_(None),
        )
        .values(resolved_at=datetime.now(UTC))
    )
    result = await session.execute(statement)
    return int(result.rowcount)


async def count_open_blocking(
    session: AsyncSession, tool_name: str, fingerprint: str, severities: list[str]
) -> int:
    if not severities:
        return 0
    statement = (
        select(func.count())
        .select_from(ToolScanFinding)
        .where(
            ToolScanFinding.tool_name == tool_name,
            ToolScanFinding.fingerprint == fingerprint,
            ToolScanFinding.resolved_at.is_(None),
            ToolScanFinding.severity.in_(severities),
        )
    )
    result = await session.execute(statement)
    return int(result.scalar_one())


async def list_findings_page(
    session: AsyncSession,
    *,
    tool_name: str | None = None,
    severity: str | None = None,
    rule_id: str | None = None,
    open_only: bool = True,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[ToolScanFinding], bool]:
    limit, offset = normalize_page(limit, offset)

    statement = select(ToolScanFinding)
    if tool_name:
        statement = statement.where(ToolScanFinding.tool_name == tool_name)
    if severity:
        statement = statement.where(ToolScanFinding.severity == severity)
    if rule_id:
        statement = statement.where(ToolScanFinding.rule_id == rule_id)
    if open_only:
        statement = statement.where(ToolScanFinding.resolved_at.is_(None))

    statement = statement.order_by(
        ToolScanFinding.created_at.desc(), ToolScanFinding.id.desc()
    )
    statement = statement.limit(limit + 1).offset(offset)

    result = await session.execute(statement)
    rows = list(result.scalars().all())
    has_more = len(rows) > limit
    return rows[:limit], has_more


async def get_finding(session: AsyncSession, finding_id: str) -> ToolScanFinding | None:
    return await session.get(ToolScanFinding, finding_id)
