import uuid
from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    event,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, utc_now
from app.models.types import UTCDateTime

AUDIT_DECISION_ALLOWED = "allowed"
AUDIT_DECISION_DENIED = "denied"


class AuditEvent(Base):
    __tablename__ = "audit_events"
    __table_args__ = (
        CheckConstraint(
            "decision IN ('allowed', 'denied')",
            name="decision",
        ),
        Index("ix_audit_events_client_id_created_at", "client_id", "created_at"),
        Index("ix_audit_events_tool_name_created_at", "tool_name", "created_at"),
        Index("ix_audit_events_decision_created_at", "decision", "created_at"),
    )

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    client_id: Mapped[str | None] = mapped_column(
        ForeignKey("clients.id", ondelete="RESTRICT"), nullable=True, index=True
    )
    api_key_id: Mapped[str | None] = mapped_column(
        ForeignKey("api_keys.id", ondelete="SET NULL"), nullable=True, index=True
    )
    # Prefix copied at write time so attribution survives later key deletion.
    key_prefix: Mapped[str | None] = mapped_column(String(20), nullable=True)
    request_id: Mapped[str | None] = mapped_column(
        String(64), nullable=True, index=True
    )

    action: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    tool_name: Mapped[str | None] = mapped_column(
        String(100), nullable=True, index=True
    )
    args_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)

    decision: Mapped[str] = mapped_column(String(16), nullable=False)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(50), nullable=False)
    status_code: Mapped[int | None] = mapped_column(Integer, nullable=True)
    error_code: Mapped[str | None] = mapped_column(String(100), nullable=True)
    duration_ms: Mapped[float | None] = mapped_column(Float, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        UTCDateTime(), default=utc_now, nullable=False, index=True
    )


def _reject_audit_mutation(mapper, connection, target) -> None:
    # ORM sessions cannot update or delete rows. Core deletes used by
    # repos.audit.delete_events_before do not fire these events.
    del mapper, connection, target
    raise RuntimeError("audit_events is append-only")


event.listen(AuditEvent, "before_update", _reject_audit_mutation)
event.listen(AuditEvent, "before_delete", _reject_audit_mutation)
