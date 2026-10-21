"""LLM call data model.

Persists every LLM invocation attempt for audit, monitoring, and retention.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, Float, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, synonym

from app.models.base import Base, utc_now
from app.models.types import UTCDateTime


class LLMCall(Base):
    __tablename__ = "llm_calls"
    __table_args__ = (
        Index("ix_llm_calls_provider_created_at", "provider", "created_at"),
        Index("ix_llm_calls_status_created_at", "status", "created_at"),
        Index("ix_llm_calls_key_prefix_created_at", "key_prefix", "created_at"),
    )

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    model: Mapped[str] = mapped_column(String(100), nullable=False)
    provider: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    purpose: Mapped[str] = mapped_column(String(50), nullable=False, default="")
    error: Mapped[str | None] = mapped_column(String(500), nullable=True)
    input_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    output_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    latency_ms: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    status: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    fell_back: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    key_prefix: Mapped[str | None] = mapped_column(
        String(20), nullable=True, default="", index=True
    )
    request_id: Mapped[str | None] = mapped_column(
        String(64), nullable=True, default="", index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        UTCDateTime(), default=utc_now, nullable=False, index=True
    )

    is_fallback = synonym("fell_back")

    @property
    def latency(self) -> float:
        return self.latency_ms

    @latency.setter
    def latency(self, val: float) -> None:
        self.latency_ms = val

    @property
    def timestamp(self) -> datetime:
        return self.created_at
