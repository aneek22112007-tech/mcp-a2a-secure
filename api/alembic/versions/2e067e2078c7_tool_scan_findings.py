"""tool_scan_findings

Revision ID: 2e067e2078c7
Revises: c8d4f1a06b27
Create Date: 2026-10-05 22:45:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "2e067e2078c7"
down_revision: str | Sequence[str] | None = "c8d4f1a06b27"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "tool_scan_findings",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("tool_name", sa.String(length=100), nullable=False),
        sa.Column("fingerprint", sa.String(length=64), nullable=False),
        sa.Column("rule_id", sa.String(length=100), nullable=False),
        sa.Column("severity", sa.String(length=16), nullable=False),
        sa.Column("message", sa.String(length=300), nullable=False),
        sa.Column("evidence", sa.String(length=200), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("resolved_at", sa.DateTime(), nullable=True),
        sa.Column("scan_id", sa.String(length=36), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_tool_scan_findings_tool_name"),
        "tool_scan_findings",
        ["tool_name"],
        unique=False,
    )
    op.create_index(
        op.f("ix_tool_scan_findings_fingerprint"),
        "tool_scan_findings",
        ["fingerprint"],
        unique=False,
    )
    op.create_index(
        "ix_tool_scan_findings_comp_resolved",
        "tool_scan_findings",
        ["tool_name", "fingerprint", "resolved_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_tool_scan_findings_comp_resolved", table_name="tool_scan_findings"
    )
    op.drop_index(
        op.f("ix_tool_scan_findings_fingerprint"), table_name="tool_scan_findings"
    )
    op.drop_index(
        op.f("ix_tool_scan_findings_tool_name"), table_name="tool_scan_findings"
    )
    op.drop_table("tool_scan_findings")
