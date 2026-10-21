"""llm_calls

Revision ID: 4c8f1e9a2b7d
Revises: 2e067e2078c7
Create Date: 2026-10-21 10:30:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "4c8f1e9a2b7d"
down_revision: str | Sequence[str] | None = "2e067e2078c7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "llm_calls",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("model", sa.String(length=100), nullable=False),
        sa.Column("provider", sa.String(length=50), nullable=False),
        sa.Column(
            "purpose",
            sa.String(length=50),
            nullable=False,
            server_default=sa.text("''"),
        ),
        sa.Column("error", sa.String(length=500), nullable=True),
        sa.Column("input_tokens", sa.Integer(), nullable=True),
        sa.Column("output_tokens", sa.Integer(), nullable=True),
        sa.Column(
            "latency_ms", sa.Float(), nullable=False, server_default=sa.text("0.0")
        ),
        sa.Column("status", sa.String(length=50), nullable=False),
        sa.Column(
            "fell_back", sa.Boolean(), nullable=False, server_default=sa.text("0")
        ),
        sa.Column("key_prefix", sa.String(length=20), nullable=True),
        sa.Column("request_id", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_llm_calls_provider"),
        "llm_calls",
        ["provider"],
        unique=False,
    )
    op.create_index(
        op.f("ix_llm_calls_status"),
        "llm_calls",
        ["status"],
        unique=False,
    )
    op.create_index(
        op.f("ix_llm_calls_key_prefix"),
        "llm_calls",
        ["key_prefix"],
        unique=False,
    )
    op.create_index(
        op.f("ix_llm_calls_request_id"),
        "llm_calls",
        ["request_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_llm_calls_created_at"),
        "llm_calls",
        ["created_at"],
        unique=False,
    )
    op.create_index(
        "ix_llm_calls_provider_created_at",
        "llm_calls",
        ["provider", "created_at"],
        unique=False,
    )
    op.create_index(
        "ix_llm_calls_status_created_at",
        "llm_calls",
        ["status", "created_at"],
        unique=False,
    )
    op.create_index(
        "ix_llm_calls_key_prefix_created_at",
        "llm_calls",
        ["key_prefix", "created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_llm_calls_key_prefix_created_at", table_name="llm_calls")
    op.drop_index("ix_llm_calls_status_created_at", table_name="llm_calls")
    op.drop_index("ix_llm_calls_provider_created_at", table_name="llm_calls")
    op.drop_index(op.f("ix_llm_calls_created_at"), table_name="llm_calls")
    op.drop_index(op.f("ix_llm_calls_request_id"), table_name="llm_calls")
    op.drop_index(op.f("ix_llm_calls_key_prefix"), table_name="llm_calls")
    op.drop_index(op.f("ix_llm_calls_status"), table_name="llm_calls")
    op.drop_index(op.f("ix_llm_calls_provider"), table_name="llm_calls")
    op.drop_table("llm_calls")
