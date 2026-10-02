import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, utc_now


class AuditEvent(Base):
    __tablename__ = "audit_events"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    client_id: Mapped[str | None] = mapped_column(
        ForeignKey("clients.id", ondelete="SET NULL"), nullable=True, index=True
    )
    api_key_id: Mapped[str | None] = mapped_column(
        ForeignKey("api_keys.id", ondelete="SET NULL"), nullable=True, index=True
    )
    request_id: Mapped[str | None] = mapped_column(
        String(64), nullable=True, index=True
    )

    action: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    tool_name: Mapped[str | None] = mapped_column(
        String(100), nullable=True, index=True
    )
    args_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)

    status: Mapped[str] = mapped_column(
        String(50), nullable=False
    )  # e.g. success, denied, failed
    error_code: Mapped[str | None] = mapped_column(String(100), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False, index=True
    )
