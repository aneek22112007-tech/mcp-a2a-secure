"""a2a_tasks table

Revision ID: f3b8c921d47e
Revises: 2e067e2078c7
Create Date: 2026-11-08 17:30:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f3b8c921d47e"
down_revision: str | Sequence[str] | None = "4c8f1e9a2b7d"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "a2a_tasks",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("manager_client_id", sa.String(length=36), nullable=True),
        sa.Column("manager_key_prefix", sa.String(length=20), nullable=True),
        sa.Column("worker_key_prefix", sa.String(length=20), nullable=True),
        sa.Column("delegated_scopes", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("task_input", sa.Text(), nullable=True),
        sa.Column("result", sa.Text(), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("manager_request_id", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["manager_client_id"],
            ["clients.id"],
            name=op.f("fk_a2a_tasks_manager_client_id_clients"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_a2a_tasks")),
    )
    op.create_index(
        op.f("ix_a2a_tasks_created_at"), "a2a_tasks", ["created_at"], unique=False
    )
    op.create_index(op.f("ix_a2a_tasks_status"), "a2a_tasks", ["status"], unique=False)
    op.create_index(
        "ix_a2a_tasks_status_created_at",
        "a2a_tasks",
        ["status", "created_at"],
        unique=False,
    )
    op.create_index(
        op.f("ix_a2a_tasks_manager_client_id"),
        "a2a_tasks",
        ["manager_client_id"],
        unique=False,
    )
    op.create_index(
        "ix_a2a_tasks_manager_client_created_at",
        "a2a_tasks",
        ["manager_client_id", "created_at"],
        unique=False,
    )
    op.create_index(
        op.f("ix_a2a_tasks_manager_request_id"),
        "a2a_tasks",
        ["manager_request_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_a2a_tasks_manager_request_id"), table_name="a2a_tasks")
    op.drop_index("ix_a2a_tasks_manager_client_created_at", table_name="a2a_tasks")
    op.drop_index(op.f("ix_a2a_tasks_manager_client_id"), table_name="a2a_tasks")
    op.drop_index("ix_a2a_tasks_status_created_at", table_name="a2a_tasks")
    op.drop_index(op.f("ix_a2a_tasks_status"), table_name="a2a_tasks")
    op.drop_index(op.f("ix_a2a_tasks_created_at"), table_name="a2a_tasks")
    op.drop_table("a2a_tasks")
