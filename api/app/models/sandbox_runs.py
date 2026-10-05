import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, utc_now
from app.models.types import UTCDateTime


class SandboxRun(Base):
    __tablename__ = "sandbox_runs"
    __table_args__ = (
        Index("ix_sandbox_runs_status_created_at", "status", "created_at"),
    )

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    client_id: Mapped[str | None] = mapped_column(
        ForeignKey("clients.id", ondelete="SET NULL"), nullable=True, index=True
    )
    audit_event_id: Mapped[str | None] = mapped_column(
        ForeignKey("audit_events.id", ondelete="SET NULL"), nullable=True, index=True
    )

    status: Mapped[str] = mapped_column(
        String(50), nullable=False, default="pending", index=True
    )

    tool_name: Mapped[str | None] = mapped_column(
        String(100), nullable=True, index=True
    )
    mode: Mapped[str | None] = mapped_column(String(16), nullable=True)
    image: Mapped[str | None] = mapped_column(String(255), nullable=True)
    transport: Mapped[str | None] = mapped_column(String(8), nullable=True)
    args_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    request_id: Mapped[str | None] = mapped_column(
        String(64), nullable=True, index=True
    )
    api_key_id: Mapped[str | None] = mapped_column(
        ForeignKey("api_keys.id", ondelete="SET NULL"), nullable=True, index=True
    )
    key_prefix: Mapped[str | None] = mapped_column(String(20), nullable=True)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    output_bytes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    error_type: Mapped[str | None] = mapped_column(String(50), nullable=True)

    exit_code: Mapped[int | None] = mapped_column(Integer, nullable=True)
    error_metadata: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        UTCDateTime(), default=utc_now, nullable=False, index=True
    )
    started_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)
