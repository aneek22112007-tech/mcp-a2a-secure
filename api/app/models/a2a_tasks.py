"""A2A task lifecycle model.

Records one manager-to-worker delegation per task.  The task ID is the
correlation anchor; individual audit_events rows reference it via
request_id = task_id.  This table is *not* append-only: the status and
result columns are updated as the task progresses.  Audit rows remain
immutable; this table is the mutable progress record.
"""

import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, utc_now
from app.models.types import UTCDateTime

# Valid status transitions (enforced in the repo helper, not by a DB check):
#   pending -> running -> completed | failed | cancelled
A2A_STATUS_PENDING = "pending"
A2A_STATUS_RUNNING = "running"
A2A_STATUS_COMPLETED = "completed"
A2A_STATUS_FAILED = "failed"
A2A_STATUS_CANCELLED = "cancelled"
A2A_STATUS_BLOCKED = "blocked"

A2A_VALID_STATUSES = frozenset(
    {
        A2A_STATUS_PENDING,
        A2A_STATUS_RUNNING,
        A2A_STATUS_COMPLETED,
        A2A_STATUS_FAILED,
        A2A_STATUS_CANCELLED,
        A2A_STATUS_BLOCKED,
    }
)


class A2ATask(Base):
    """One delegated notes task.

    ``task_id`` is propagated to every audit_events row via request_id so the
    audit log can be correlated with the task lifecycle without storing the
    worker API key anywhere outside the database api_keys table.
    """

    __tablename__ = "a2a_tasks"
    __table_args__ = (
        Index("ix_a2a_tasks_status_created_at", "status", "created_at"),
        Index(
            "ix_a2a_tasks_manager_client_created_at", "manager_client_id", "created_at"
        ),
    )

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )

    # Who submitted the task (the caller of POST /api/a2a/tasks/run)
    manager_client_id: Mapped[str | None] = mapped_column(
        ForeignKey("clients.id", ondelete="SET NULL"), nullable=True, index=True
    )
    manager_key_prefix: Mapped[str | None] = mapped_column(String(20), nullable=True)

    # The server-configured worker key prefix — never the raw key value.
    worker_key_prefix: Mapped[str | None] = mapped_column(String(20), nullable=True)

    # Comma-separated list of delegated scopes (safe to store; no secrets)
    delegated_scopes: Mapped[str | None] = mapped_column(Text, nullable=True)

    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default=A2A_STATUS_PENDING, index=True
    )

    # The task text submitted by the user (not the worker key)
    task_input: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Safe result / error message — never contains secrets
    result: Mapped[str | None] = mapped_column(Text, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Correlation IDs
    manager_request_id: Mapped[str | None] = mapped_column(
        String(64), nullable=True, index=True
    )

    created_at: Mapped[datetime] = mapped_column(
        UTCDateTime(), default=utc_now, nullable=False, index=True
    )
    started_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)
