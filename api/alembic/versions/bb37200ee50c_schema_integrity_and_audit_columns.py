"""schema integrity and audit columns

Revision ID: bb37200ee50c
Revises: 7a767168a9ab
Create Date: 2026-10-03 01:01:30.845003

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "bb37200ee50c"
down_revision: str | Sequence[str] | None = "7a767168a9ab"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add API-key integrity columns and audit attribution fields.

    Existing rows are backfilled before NOT NULL constraints are applied.
    Audit rows are kept; only new columns and constraints are introduced.
    """

    op.execute("UPDATE api_keys SET scopes = '[]' WHERE scopes IS NULL OR scopes = ''")

    with op.batch_alter_table("api_keys") as batch_op:
        batch_op.add_column(sa.Column("name", sa.String(length=255), nullable=True))

    op.execute("UPDATE api_keys SET name = 'legacy-key' WHERE name IS NULL")

    with op.batch_alter_table("api_keys") as batch_op:
        batch_op.alter_column(
            "name",
            existing_type=sa.String(length=255),
            nullable=False,
        )
        batch_op.alter_column(
            "scopes",
            existing_type=sa.String(length=255),
            type_=sa.JSON(),
            existing_nullable=True,
            nullable=False,
            server_default=sa.text("'[]'"),
        )
        batch_op.create_unique_constraint(
            batch_op.f("uq_api_keys_key_hash"), ["key_hash"]
        )

    with op.batch_alter_table("audit_events") as batch_op:
        batch_op.add_column(
            sa.Column("key_prefix", sa.String(length=20), nullable=True)
        )
        batch_op.add_column(sa.Column("decision", sa.String(length=16), nullable=True))
        batch_op.add_column(sa.Column("reason", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("status_code", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("duration_ms", sa.Float(), nullable=True))

    op.execute(
        "UPDATE audit_events SET decision = "
        "CASE WHEN status = 'denied' THEN 'denied' ELSE 'allowed' END "
        "WHERE decision IS NULL"
    )

    with op.batch_alter_table("audit_events") as batch_op:
        batch_op.alter_column(
            "decision",
            existing_type=sa.String(length=16),
            nullable=False,
        )
        batch_op.create_check_constraint(
            batch_op.f("ck_audit_events_decision"),
            "decision IN ('allowed', 'denied')",
        )
        batch_op.create_index(
            "ix_audit_events_client_id_created_at",
            ["client_id", "created_at"],
            unique=False,
        )
        batch_op.create_index(
            "ix_audit_events_decision_created_at",
            ["decision", "created_at"],
            unique=False,
        )
        batch_op.create_index(
            "ix_audit_events_tool_name_created_at",
            ["tool_name", "created_at"],
            unique=False,
        )
        batch_op.drop_constraint(
            batch_op.f("fk_audit_events_client_id_clients"), type_="foreignkey"
        )
        batch_op.create_foreign_key(
            batch_op.f("fk_audit_events_client_id_clients"),
            "clients",
            ["client_id"],
            ["id"],
            ondelete="RESTRICT",
        )


def downgrade() -> None:
    """Reverse integrity columns without dropping audit or client rows."""

    with op.batch_alter_table("audit_events") as batch_op:
        batch_op.drop_constraint(
            batch_op.f("fk_audit_events_client_id_clients"), type_="foreignkey"
        )
        batch_op.create_foreign_key(
            batch_op.f("fk_audit_events_client_id_clients"),
            "clients",
            ["client_id"],
            ["id"],
            ondelete="SET NULL",
        )
        batch_op.drop_constraint(batch_op.f("ck_audit_events_decision"), type_="check")
        batch_op.drop_index("ix_audit_events_tool_name_created_at")
        batch_op.drop_index("ix_audit_events_decision_created_at")
        batch_op.drop_index("ix_audit_events_client_id_created_at")
        batch_op.drop_column("duration_ms")
        batch_op.drop_column("status_code")
        batch_op.drop_column("reason")
        batch_op.drop_column("decision")
        batch_op.drop_column("key_prefix")

    with op.batch_alter_table("api_keys") as batch_op:
        batch_op.drop_constraint(batch_op.f("uq_api_keys_key_hash"), type_="unique")
        batch_op.alter_column(
            "scopes",
            existing_type=sa.JSON(),
            type_=sa.String(length=255),
            existing_nullable=False,
            nullable=True,
            server_default=None,
        )
        batch_op.drop_column("name")
