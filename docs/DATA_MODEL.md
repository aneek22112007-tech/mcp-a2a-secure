# MCP Guard Data Model

This document outlines the core data model for MCP Guard, which includes clients, API keys, audit events, and sandbox execution runs.

## Entity Relationship Diagram

```mermaid
erDiagram
    clients ||--o{ api_keys : "has many"
    clients ||--o{ audit_events : "generates"
    clients ||--o{ sandbox_runs : "owns"
    
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
        string action "tool.call, tool.result, auth.allow, auth.deny, mcp.tools_call (max 100)"
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
        string status "pending/running/finished/failed (max 50)"
        int exit_code "Process exit code (nullable)"
        text error_metadata "Detailed error JSON (nullable)"
        datetime created_at "UTC timestamp"
        datetime started_at "UTC timestamp (nullable)"
        datetime finished_at "UTC timestamp (nullable)"
    }
```

## Schema Details

- **clients**: Represents an integrated system or human actor.
- **api_keys**: Hashed access credentials tied to a client. Uses a prefix for identification and a JSON list for `scopes`.
- **audit_events**: Immutable ledger of access decisions and tool executions. Contains performance metrics (`duration_ms`) and failure insights. The table is append-only. Mutating tools write `tool.call` (status `forwarded`) and then `tool.result`. `client_ip` is personal data and is kept for the same retention period as the rest of the row. On Postgres, the trigger rejects UPDATE, DELETE and TRUNCATE on `audit_events`. The exceptions are the retention delete (`repos.audit.delete_events_before` sets `SET LOCAL mcp_guard.audit_retention = 'on'`) and the `api_key_id` ON DELETE SET NULL update. SQLite relies on the ORM guard. A database owner can disable triggers, so production should use a non-owner role. The only sanctioned delete path is `app.repos.audit.delete_events_before`, used for retention.
- **sandbox_runs**: Tracks the execution lifecycle of sandboxed processes initiated by a client.

All `datetime` columns are stored as naive UTC in SQLite and read back as timezone-aware UTC objects via the `UTCDateTime` custom type.
Foreign keys are strictly enforced on SQLite connections.
