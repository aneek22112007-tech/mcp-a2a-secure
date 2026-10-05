# MCP Guard Data Model

This document outlines the core data model for MCP Guard, which includes clients, API keys, audit events, sandbox execution runs, and tool pins.

## Entity Relationship Diagram

```mermaid
erDiagram
    clients ||--o{ api_keys : "has many"
    clients ||--o{ audit_events : "generates"
    clients ||--o{ sandbox_runs : "owns"
    api_keys ||--o{ tool_pins : "approves"
    tool_pins ||--o{ tool_scan_findings : "is scanned"
    
    clients {
        string id PK "UUID"
        string name "Client name (max 255)"
        string status "active/inactive (max 50)"
        datetime created_at "UTC timestamp"
        datetime updated_at "UTC timestamp"
    }

    api_keys {
        string id PK "UUID"
        string client_id FK "References clients.id"
        string name "Key name (max 255)"
        string key_prefix "Prefix of the key (max 50)"
        string key_hash "Hashed key (max 255)"
        json scopes "List of scopes"
        datetime created_at "UTC timestamp"
        datetime expires_at "UTC timestamp (nullable)"
        datetime revoked_at "UTC timestamp (nullable)"
        datetime last_used_at "UTC timestamp (nullable)"
    }

    audit_events {
        string id PK "UUID"
        string client_id FK "References clients.id"
        string api_key_id FK "References api_keys.id (nullable)"
        string key_prefix "Used API key prefix (nullable, max 20)"
        string request_id "Correlated request ID (nullable, max 64)"
        string client_ip "Client IP, personal data (nullable, max 45)"
        string action "tool.call, tool.result, auth.allow, auth.deny, mcp.tools_call, tool.pin.approve, tool.pin.revoke, tool.pin.deny, tool.pin.drift, tool.pin.unapproved (max 100)"
        string tool_name "Name of the MCP tool (nullable, max 100)"
        string args_hash "Hashed tool arguments (nullable, max 255)"
        string decision "allowed/denied (max 16)"
        text reason "Rejection or error reason (nullable)"
        string status "success/error/denied (max 50)"
        int status_code "HTTP status code (nullable)"
        string error_code "Standardized error code (nullable, max 100)"
        float duration_ms "Execution duration (nullable)"
        datetime created_at "UTC timestamp, Indexed"
    }

    sandbox_runs {
        string id PK "UUID"
        string client_id FK "References clients.id"
        string audit_event_id FK "References audit_events.id (nullable)"
        string status "pending/running/succeeded/failed/timeout/cancelled/unavailable/rejected/abandoned (max 50)"
        string tool_name "Name of the MCP tool (nullable, max 100)"
        string mode "Sandbox mode: docker/inprocess (nullable, max 16)"
        string image "Docker image name (nullable, max 255)"
        string transport "rest/mcp (nullable, max 8)"
        string args_hash "Hashed tool arguments (nullable, max 255)"
        string request_id "Correlated request ID (nullable, max 64)"
        string api_key_id FK "References api_keys.id (nullable)"
        string key_prefix "Used API key prefix (nullable, max 20)"
        int duration_ms "Execution duration (nullable)"
        int output_bytes "Size of the tool output (nullable)"
        string error_type "Standardized error constant (nullable, max 50)"
        int exit_code "Process exit code (nullable)"
        text error_metadata "Detailed error JSON (legacy, nullable)"
        datetime created_at "UTC timestamp"
        datetime started_at "UTC timestamp (nullable)"
        datetime finished_at "UTC timestamp (nullable)"
    }

    tool_pins {
        string id PK "UUID"
        string tool_name UK "Registered tool name (max 100)"
        string fingerprint "sha256 hex of the canonical schema (64)"
        string status "approved, pending, or revoked (max 16)"
        string implementation_digest "sha256 hex of function source, not used for allow or deny (nullable, 64)"
        datetime approved_at "UTC timestamp (nullable)"
        string approved_by_api_key_id FK "References api_keys.id (nullable, ON DELETE SET NULL)"
        datetime revoked_at "UTC timestamp (nullable)"
        string note "Operator note (nullable, max 500)"
        datetime created_at "UTC timestamp"
        datetime updated_at "UTC timestamp"
    }

    tool_scan_findings {
        string id PK "UUID"
        string tool_name "Name of the MCP tool (max 100)"
        string fingerprint "sha256 hex of the canonical schema (64)"
        string rule_id "Rule identifier (max 100)"
        string severity "critical/high/medium/low (max 16)"
        string message "Finding description (max 300)"
        string evidence "Offending snippet (nullable, max 200)"
        datetime created_at "UTC timestamp"
        datetime resolved_at "UTC timestamp (nullable)"
        string scan_id "Grouping ID for batch scans (nullable, 36)"
    }
```

## Schema Details

- **clients**: Represents an integrated system or human actor.
- **api_keys**: Hashed access credentials tied to a client. Uses a prefix for identification and a JSON list for `scopes`.
- **audit_events**: Immutable ledger of access decisions and tool executions. Contains performance metrics (`duration_ms`) and failure insights. The table is append-only. Mutating tools write `tool.call` (status `forwarded`) and then `tool.result`. `client_ip` is personal data and is kept for the same retention period as the rest of the row. On Postgres, the trigger rejects UPDATE, DELETE and TRUNCATE on `audit_events`. The exceptions are the retention delete (`repos.audit.delete_events_before` sets `SET LOCAL mcp_guard.audit_retention = 'on'`) and the `api_key_id` ON DELETE SET NULL update. SQLite relies on the ORM guard. A database owner can disable triggers, so production should use a non-owner role. The only sanctioned delete path is `app.repos.audit.delete_events_before`, used for retention.
- **sandbox_runs**: Tracks the execution lifecycle of sandboxed processes initiated by a client. Statuses include `pending`, `running`, `succeeded`, `failed`, `timeout`, `cancelled`, `unavailable`, `rejected`, and `abandoned`. The `error_type` column stores standardized error constants. A `stale_run` error type indicates a run was stuck in `running` or `pending` status after a crash and was marked failed by the startup sweep or retention task. It links to `audit_events` via `audit_event_id`.
- **tool_pins**: One row per tool name. `fingerprint` is the sha256 of the canonical name, description, input schema, and output schema when the tool has one. `status` is `approved`, `pending`, or `revoked`. `implementation_digest` records the registered function source when it can be read. Allow and deny decisions do not read that column. `approved_by_api_key_id` points at the admin key that last approved the row and becomes null if that key row is deleted. Sync inserts a pending row when the live fingerprint is not already stored. Approve replaces the fingerprint with the live one. Revoke keeps the row and sets `revoked_at`.
- **tool_scan_findings**: Stores risk findings generated by the rule-based scanner. Contains `rule_id`, `severity`, and `evidence`. Tools with open findings of a severity in `SCANNER_BLOCK_SEVERITIES` are denied execution when `TOOL_PINNING_MODE` is `enforce`.

All `datetime` columns are stored as naive UTC in SQLite and read back as timezone-aware UTC objects via the `UTCDateTime` custom type.
Foreign keys are strictly enforced on SQLite connections.
