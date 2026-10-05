import uuid
from datetime import datetime

from sqlalchemy import Index, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base
from app.models.types import UTCDateTime


class ToolScanFinding(Base):
    __tablename__ = "tool_scan_findings"
    __table_args__ = (
        Index(
            "ix_tool_scan_findings_comp_resolved",
            "tool_name",
            "fingerprint",
            "resolved_at",
        ),
    )

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    tool_name: Mapped[str] = mapped_column(String(100), index=True)
    fingerprint: Mapped[str] = mapped_column(String(64), index=True)
    rule_id: Mapped[str] = mapped_column(String(100))
    severity: Mapped[str] = mapped_column(String(16))
    message: Mapped[str] = mapped_column(String(300))
    evidence: Mapped[str | None] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime)
    resolved_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    scan_id: Mapped[str | None] = mapped_column(String(36))
