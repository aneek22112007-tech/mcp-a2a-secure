"""audit events append only pg

Revision ID: cc48301ff61d
Revises: bb37200ee50c
Create Date: 2026-10-05 00:00:00.000000

"""

from alembic import op

# revision identifiers, used by Alembic.
revision = "cc48301ff61d"
down_revision = "bb37200ee50c"
branch_labels = None
depends_on = None


def upgrade() -> None:
    if op.get_bind().dialect.name != "postgresql":
        return
    op.execute("""
    CREATE OR REPLACE FUNCTION mcp_guard_audit_events_guard() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF TG_OP = 'DELETE' THEN
        IF current_setting('mcp_guard.audit_retention', true) = 'on' THEN RETURN OLD; END IF;
        RAISE EXCEPTION 'audit_events is append-only' USING ERRCODE = 'insufficient_privilege';
      END IF;
      IF TG_OP = 'UPDATE' THEN
        IF OLD.api_key_id IS NOT NULL AND NEW.api_key_id IS NULL
           AND (to_jsonb(NEW) - 'api_key_id') = (to_jsonb(OLD) - 'api_key_id') THEN
          RETURN NEW;  -- FK ON DELETE SET NULL from api_keys
        END IF;
        RAISE EXCEPTION 'audit_events is append-only' USING ERRCODE = 'insufficient_privilege';
      END IF;
      RETURN NULL;
    END $$;
    """)
    op.execute("""
    CREATE TRIGGER audit_events_append_only BEFORE UPDATE OR DELETE ON audit_events
      FOR EACH ROW EXECUTE FUNCTION mcp_guard_audit_events_guard();
    """)
    op.execute("""
    CREATE OR REPLACE FUNCTION mcp_guard_audit_events_no_truncate() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'audit_events is append-only' USING ERRCODE = 'insufficient_privilege'; END $$;
    """)
    op.execute("""
    CREATE TRIGGER audit_events_no_truncate BEFORE TRUNCATE ON audit_events
      FOR EACH STATEMENT EXECUTE FUNCTION mcp_guard_audit_events_no_truncate();
    """)


def downgrade() -> None:
    if op.get_bind().dialect.name != "postgresql":
        return
    op.execute("DROP TRIGGER IF EXISTS audit_events_no_truncate ON audit_events;")
    op.execute("DROP FUNCTION IF EXISTS mcp_guard_audit_events_no_truncate();")
    op.execute("DROP TRIGGER IF EXISTS audit_events_append_only ON audit_events;")
    op.execute("DROP FUNCTION IF EXISTS mcp_guard_audit_events_guard();")
