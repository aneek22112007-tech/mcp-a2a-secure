"""tool_pins

Revision ID: c8d4f1a06b27
Revises: 5e3bcda88e06
Create Date: 2026-10-05 22:10:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c8d4f1a06b27"
down_revision: str | Sequence[str] | None = "5e3bcda88e06"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "tool_pins",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("tool_name", sa.String(length=100), nullable=False),
        sa.Column("fingerprint", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("implementation_digest", sa.String(length=64), nullable=True),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("approved_by_api_key_id", sa.String(length=36), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("note", sa.String(length=500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["approved_by_api_key_id"],
            ["api_keys.id"],
            name="fk_tool_pins_approved_by_api_key_id_api_keys",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_tool_pins"),
        sa.UniqueConstraint("tool_name", name="uq_tool_pins_tool_name"),
    )
    op.create_index(
        "ix_tool_pins_approved_by_api_key_id",
        "tool_pins",
        ["approved_by_api_key_id"],
        unique=False,
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_tool_pins_approved_by_api_key_id", table_name="tool_pins")
    op.drop_table("tool_pins")
