"""sandbox_runs_execution_columns

Revision ID: 5e3bcda88e06
Revises: e1c0a4b87f2d
Create Date: 2026-10-05 18:43:55.281780

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "5e3bcda88e06"
down_revision: str | Sequence[str] | None = "e1c0a4b87f2d"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table("sandbox_runs") as batch_op:
        batch_op.add_column(
            sa.Column("tool_name", sa.String(length=100), nullable=True)
        )
        batch_op.add_column(sa.Column("mode", sa.String(length=16), nullable=True))
        batch_op.add_column(sa.Column("image", sa.String(length=255), nullable=True))
        batch_op.add_column(sa.Column("transport", sa.String(length=8), nullable=True))
        batch_op.add_column(
            sa.Column("args_hash", sa.String(length=255), nullable=True)
        )
        batch_op.add_column(
            sa.Column("request_id", sa.String(length=64), nullable=True)
        )
        batch_op.add_column(
            sa.Column("api_key_id", sa.String(length=36), nullable=True)
        )
        batch_op.add_column(
            sa.Column("key_prefix", sa.String(length=20), nullable=True)
        )
        batch_op.add_column(sa.Column("duration_ms", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("output_bytes", sa.Integer(), nullable=True))
        batch_op.add_column(
            sa.Column("error_type", sa.String(length=50), nullable=True)
        )

        batch_op.create_foreign_key(
            "fk_sandbox_runs_api_key_id",
            "api_keys",
            ["api_key_id"],
            ["id"],
            ondelete="SET NULL",
        )
        batch_op.create_index(op.f("ix_sandbox_runs_tool_name"), ["tool_name"])
        batch_op.create_index(op.f("ix_sandbox_runs_request_id"), ["request_id"])
        batch_op.create_index(op.f("ix_sandbox_runs_api_key_id"), ["api_key_id"])
        batch_op.create_index(op.f("ix_sandbox_runs_created_at"), ["created_at"])
        batch_op.create_index(
            "ix_sandbox_runs_status_created_at", ["status", "created_at"]
        )


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table("sandbox_runs") as batch_op:
        batch_op.drop_index("ix_sandbox_runs_status_created_at")
        batch_op.drop_index(op.f("ix_sandbox_runs_created_at"))
        batch_op.drop_index(op.f("ix_sandbox_runs_api_key_id"))
        batch_op.drop_index(op.f("ix_sandbox_runs_request_id"))
        batch_op.drop_index(op.f("ix_sandbox_runs_tool_name"))
        batch_op.drop_constraint("fk_sandbox_runs_api_key_id", type_="foreignkey")

        batch_op.drop_column("error_type")
        batch_op.drop_column("output_bytes")
        batch_op.drop_column("duration_ms")
        batch_op.drop_column("key_prefix")
        batch_op.drop_column("api_key_id")
        batch_op.drop_column("request_id")
        batch_op.drop_column("args_hash")
        batch_op.drop_column("transport")
        batch_op.drop_column("image")
        batch_op.drop_column("mode")
        batch_op.drop_column("tool_name")
