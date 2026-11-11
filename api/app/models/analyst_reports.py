"""Stored analyst explanations.

Only a reply that passed the output checks is inserted. The body is the
validated JSON, not the raw model text.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, utc_now
from app.models.types import UTCDateTime


class AnalystReport(Base):
    __tablename__ = "analyst_reports"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    incident_id: Mapped[str] = mapped_column(String(24), nullable=False, index=True)
    kind: Mapped[str] = mapped_column(String(16), nullable=False)
    severity: Mapped[str] = mapped_column(String(16), nullable=False)
    events_fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    event_count: Mapped[int] = mapped_column(Integer, nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    withheld_fields: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    provider: Mapped[str] = mapped_column(String(50), nullable=False)
    model: Mapped[str] = mapped_column(String(100), nullable=False)
    fell_back: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    latency_ms: Mapped[int] = mapped_column(Integer, nullable=False)
    request_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    key_prefix: Mapped[str | None] = mapped_column(String(20), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        UTCDateTime(), default=utc_now, nullable=False, index=True
    )
