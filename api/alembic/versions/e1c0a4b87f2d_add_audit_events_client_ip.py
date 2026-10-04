"""add audit_events.client_ip

Revision ID: e1c0a4b87f2d
Revises: cc48301ff61d
Create Date: 2026-10-05 12:00:00.000000

"""

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "e1c0a4b87f2d"
down_revision = "cc48301ff61d"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("audit_events") as batch_op:
        batch_op.add_column(sa.Column("client_ip", sa.String(length=45), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("audit_events") as batch_op:
        batch_op.drop_column("client_ip")
