from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, utc_now
from app.models.types import UTCDateTime

if TYPE_CHECKING:
    from app.models.api_keys import ApiKey

CLIENT_STATUS_ACTIVE = "active"
CLIENT_STATUS_INACTIVE = "inactive"


class Client(Base):
    __tablename__ = "clients"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(
        String(50), default=CLIENT_STATUS_ACTIVE, nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        UTCDateTime(), default=utc_now, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        UTCDateTime(), default=utc_now, onupdate=utc_now, nullable=False
    )

    api_keys: Mapped[list[ApiKey]] = relationship(
        "ApiKey", back_populates="client", cascade="all, delete-orphan"
    )
