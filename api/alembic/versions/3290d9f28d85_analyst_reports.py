"""analyst_reports

Revision ID: 3290d9f28d85
Revises: f3b8c921d47e
Create Date: 2026-11-12 01:36:07.591760

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "3290d9f28d85"
down_revision: str | Sequence[str] | None = "f3b8c921d47e"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "analyst_reports",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("incident_id", sa.String(length=24), nullable=False),
        sa.Column("kind", sa.String(length=16), nullable=False),
        sa.Column("severity", sa.String(length=16), nullable=False),
        sa.Column("events_fingerprint", sa.String(length=64), nullable=False),
        sa.Column("event_count", sa.Integer(), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("withheld_fields", sa.Integer(), nullable=False),
        sa.Column("provider", sa.String(length=50), nullable=False),
        sa.Column("model", sa.String(length=100), nullable=False),
        sa.Column("fell_back", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("latency_ms", sa.Integer(), nullable=False),
        sa.Column("request_id", sa.String(length=64), nullable=True),
        sa.Column("key_prefix", sa.String(length=20), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_analyst_reports_incident_id"),
        "analyst_reports",
        ["incident_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_analyst_reports_created_at"),
        "analyst_reports",
        ["created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_analyst_reports_created_at"), table_name="analyst_reports")
    op.drop_index(op.f("ix_analyst_reports_incident_id"), table_name="analyst_reports")
    op.drop_table("analyst_reports")
