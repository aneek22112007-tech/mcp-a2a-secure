"""audit append only sqlite and utc columns

A future batch rebuild of audit_events on SQLite would drop these triggers.
Recreate them in that migration. SQLite has no SET LOCAL, so the delete
trigger calls mcpg_audit_retention(), which the application registers on
each connection. A raw SQLite client has no such function and fails closed.

Revision ID: 9db563fdadd8
Revises: 3290d9f28d85
Create Date: 2026-11-12 14:19:26.519199

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "9db563fdadd8"
down_revision: str | Sequence[str] | None = "3290d9f28d85"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# audit_events columns at revision 3290d9f28d85, except api_key_id.
# IS matches NULL to NULL, so only an api_key_id clear is allowed.
_UNCHANGED_COLUMNS = (
    "id",
    "client_id",
    "request_id",
    "action",
    "tool_name",
    "args_hash",
    "status",
    "error_code",
    "created_at",
    "key_prefix",
    "decision",
    "reason",
    "status_code",
    "duration_ms",
    "client_ip",
)

_POSTGRES_TO_TIMESTAMPTZ = (
    (
        "ALTER TABLE tool_scan_findings ALTER COLUMN created_at "
        "TYPE timestamptz USING created_at AT TIME ZONE 'UTC'"
    ),
    (
        "ALTER TABLE tool_scan_findings ALTER COLUMN resolved_at "
        "TYPE timestamptz USING resolved_at AT TIME ZONE 'UTC'"
    ),
    (
        "ALTER TABLE llm_calls ALTER COLUMN created_at "
        "TYPE timestamptz USING created_at AT TIME ZONE 'UTC'"
    ),
)

_POSTGRES_TO_TIMESTAMP = (
    (
        "ALTER TABLE tool_scan_findings ALTER COLUMN created_at "
        "TYPE timestamp without time zone USING created_at AT TIME ZONE 'UTC'"
    ),
    (
        "ALTER TABLE tool_scan_findings ALTER COLUMN resolved_at "
        "TYPE timestamp without time zone USING resolved_at AT TIME ZONE 'UTC'"
    ),
    (
        "ALTER TABLE llm_calls ALTER COLUMN created_at "
        "TYPE timestamp without time zone USING created_at AT TIME ZONE 'UTC'"
    ),
)


def _sqlite_update_trigger() -> str:
    same_row = "\n           AND ".join(
        f"OLD.{name} IS NEW.{name}" for name in _UNCHANGED_COLUMNS
    )
    return f"""
    CREATE TRIGGER audit_events_append_only_update
    BEFORE UPDATE ON audit_events
    FOR EACH ROW
    WHEN NOT (
           OLD.api_key_id IS NOT NULL
       AND NEW.api_key_id IS NULL
       AND {same_row}
    )
    BEGIN
        SELECT RAISE(ABORT, 'audit_events is append-only');
    END
    """


_SQLITE_DELETE_TRIGGER = """
CREATE TRIGGER audit_events_append_only_delete
BEFORE DELETE ON audit_events
FOR EACH ROW
WHEN IFNULL(mcpg_audit_retention(), 0) != 1
BEGIN
    SELECT RAISE(ABORT, 'audit_events is append-only');
END
"""


def upgrade() -> None:
    dialect = op.get_bind().dialect.name
    if dialect == "sqlite":
        op.execute(_sqlite_update_trigger())
        op.execute(_SQLITE_DELETE_TRIGGER)
        return
    if dialect != "postgresql":
        return
    for statement in _POSTGRES_TO_TIMESTAMPTZ:
        op.execute(statement)


def downgrade() -> None:
    dialect = op.get_bind().dialect.name
    if dialect == "sqlite":
        op.execute("DROP TRIGGER IF EXISTS audit_events_append_only_delete")
        op.execute("DROP TRIGGER IF EXISTS audit_events_append_only_update")
        return
    if dialect != "postgresql":
        return
    for statement in _POSTGRES_TO_TIMESTAMP:
        op.execute(statement)
