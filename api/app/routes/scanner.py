from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import authorize_route
from app.config import settings
from app.database import get_db
from app.repos.scanner import get_finding, list_findings_page
from app.services.scanner import run_scan_all, run_scan_one

router = APIRouter(
    prefix="/api/scanner",
    tags=["scanner"],
    dependencies=[Depends(authorize_route)],
)


class ScanStatsResponse(BaseModel):
    scan_id: str
    tools_scanned: int
    findings_open: int
    by_severity: dict[str, int]


class FindingResponse(BaseModel):
    id: str
    tool_name: str
    fingerprint: str
    rule_id: str
    severity: str
    message: str
    evidence: str | None
    created_at: datetime
    resolved_at: datetime | None
    scan_id: str | None


class FindingsPageResponse(BaseModel):
    items: list[FindingResponse]
    limit: int
    offset: int
    next_offset: int | None


def check_scanner_enabled():
    if not settings.scanner_enabled:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Scanner is disabled in configuration.",
        )


@router.get("/findings", response_model=FindingsPageResponse)
async def list_findings(
    tool_name: str | None = Query(None),
    severity: str | None = Query(None),
    rule_id: str | None = Query(None),
    open_only: bool = Query(True),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    session: AsyncSession = Depends(get_db),  # noqa: B008
):
    rows, has_more = await list_findings_page(
        session,
        tool_name=tool_name,
        severity=severity,
        rule_id=rule_id,
        open_only=open_only,
        limit=limit,
        offset=offset,
    )
    return FindingsPageResponse(
        items=[
            FindingResponse(
                id=r.id,
                tool_name=r.tool_name,
                fingerprint=r.fingerprint,
                rule_id=r.rule_id,
                severity=r.severity,
                message=r.message,
                evidence=r.evidence,
                created_at=r.created_at,
                resolved_at=r.resolved_at,
                scan_id=r.scan_id,
            )
            for r in rows
        ],
        limit=limit,
        offset=offset,
        next_offset=(offset + limit) if has_more else None,
    )


@router.get("/findings/{finding_id}", response_model=FindingResponse)
async def get_finding_by_id(
    finding_id: str,
    session: AsyncSession = Depends(get_db),  # noqa: B008
):
    finding = await get_finding(session, finding_id)
    if not finding:
        raise HTTPException(status_code=404, detail="Finding not found.")
    return FindingResponse(
        id=finding.id,
        tool_name=finding.tool_name,
        fingerprint=finding.fingerprint,
        rule_id=finding.rule_id,
        severity=finding.severity,
        message=finding.message,
        evidence=finding.evidence,
        created_at=finding.created_at,
        resolved_at=finding.resolved_at,
        scan_id=finding.scan_id,
    )


@router.post("/run", response_model=ScanStatsResponse)
async def scan_all():
    check_scanner_enabled()
    stats = await run_scan_all()
    return ScanStatsResponse(
        scan_id=stats.scan_id,
        tools_scanned=stats.tools_scanned,
        findings_open=stats.findings_open,
        by_severity=stats.by_severity,
    )


@router.post("/run/{tool_name}", response_model=ScanStatsResponse)
async def scan_tool_endpoint(tool_name: str):
    check_scanner_enabled()
    stats = await run_scan_one(tool_name)
    if not stats:
        raise HTTPException(status_code=404, detail="Tool not found.")
    return ScanStatsResponse(
        scan_id=stats.scan_id,
        tools_scanned=stats.tools_scanned,
        findings_open=stats.findings_open,
        by_severity=stats.by_severity,
    )
