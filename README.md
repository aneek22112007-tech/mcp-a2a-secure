# mermaid test 4

## V1 nodes only

```mermaid
flowchart LR
    subgraph CALLERS["Callers"]
        direction TB
        AG["🤖 LLM agent<br/>(LangGraph · planned)"]
        UI["📊 React dashboard"]
        A2A["🤝 A2A manager / worker<br/>(planned)"]
        INS["🔍 MCP Inspector / clients"]
    end

    subgraph GUARD["🛡️ MCP Guard · FastAPI"]
        direction TB
        MW["HTTP hardening<br/>body limit · request ID · CSP · CORS"]
        AUTH["Bearer auth<br/>mcpg_ keys · fail closed"]
        SC["Scope check<br/>route → scope map"]
        GW["Gateway<br/>allowlist · arg cap · timeout"]
        SCAN["Tool-poisoning scanner<br/>(planned)"]
        AUD["Audit log + SSE<br/>(planned)"]
        RL["Rate limit + metrics<br/>(planned)"]
    end

    subgraph TOOLS["🔧 MCP server · /mcp/"]
        direction TB
        MCP["FastMCP 'mcp-guard'<br/>Streamable HTTP"]
        T1["list_notes · read_note · write_note"]
    end

    DB[("🗄️ SQLAlchemy async<br/>SQLite dev · Postgres 16 planned")]



```

## V2 flat

```mermaid
flowchart LR
        AG["🤖 LLM agent<br/>(LangGraph · planned)"]
        UI["📊 React dashboard"]
        A2A["🤝 A2A manager / worker<br/>(planned)"]
        INS["🔍 MCP Inspector / clients"]

        MW["HTTP hardening<br/>body limit · request ID · CSP · CORS"]
        AUTH["Bearer auth<br/>mcpg_ keys · fail closed"]
        SC["Scope check<br/>route → scope map"]
        GW["Gateway<br/>allowlist · arg cap · timeout"]
        SCAN["Tool-poisoning scanner<br/>(planned)"]
        AUD["Audit log + SSE<br/>(planned)"]
        RL["Rate limit + metrics<br/>(planned)"]

        MCP["FastMCP 'mcp-guard'<br/>Streamable HTTP"]
        T1["list_notes · read_note · write_note"]

    DB[("🗄️ SQLAlchemy async<br/>SQLite dev · Postgres 16 planned")]

    AG --> MW
    UI --> MW
    A2A --> MW
    INS --> MW
    MW --> AUTH --> SC
    SC -->|"/api/notes"| GW --> MCP
    SC -->|"/mcp/ · agent:run"| MCP
    MCP --> T1
    SC -.-> SCAN
    SC -.-> AUD
    SC -.-> RL
    AUTH -.->|"key lookup (P2)"| DB
    AUD -.-> DB

    classDef built fill:#0f2a2e,stroke:#2dd4bf,color:#e2e8f0,stroke-width:2px
    classDef planned fill:#1e1b3a,stroke:#a78bfa,color:#c4b5fd,stroke-dasharray:5 5
    classDef caller fill:#0b1224,stroke:#22d3ee,color:#e2e8f0
    classDef store fill:#111827,stroke:#f59e0b,color:#fde68a
    class MW,AUTH,SC,GW,MCP,T1 built
    class SCAN,AUD,RL,AG,A2A planned
    class UI,INS caller
    class DB store

```

## V3 no DB

```mermaid
flowchart LR
    subgraph CALLERS["Callers"]
        direction TB
        AG["🤖 LLM agent<br/>(LangGraph · planned)"]
        UI["📊 React dashboard"]
        A2A["🤝 A2A manager / worker<br/>(planned)"]
        INS["🔍 MCP Inspector / clients"]
    end

    subgraph GUARD["🛡️ MCP Guard · FastAPI"]
        direction TB
        MW["HTTP hardening<br/>body limit · request ID · CSP · CORS"]
        AUTH["Bearer auth<br/>mcpg_ keys · fail closed"]
        SC["Scope check<br/>route → scope map"]
        GW["Gateway<br/>allowlist · arg cap · timeout"]
        SCAN["Tool-poisoning scanner<br/>(planned)"]
        AUD["Audit log + SSE<br/>(planned)"]
        RL["Rate limit + metrics<br/>(planned)"]
    end

    subgraph TOOLS["🔧 MCP server · /mcp/"]
        direction TB
        MCP["FastMCP 'mcp-guard'<br/>Streamable HTTP"]
        T1["list_notes · read_note · write_note"]
    end


    AG --> MW
    UI --> MW
    A2A --> MW
    INS --> MW
    MW --> AUTH --> SC
    SC -->|"/api/notes"| GW --> MCP
    SC -->|"/mcp/ · agent:run"| MCP
    MCP --> T1
    SC -.-> SCAN
    SC -.-> AUD
    SC -.-> RL

    classDef built fill:#0f2a2e,stroke:#2dd4bf,color:#e2e8f0,stroke-width:2px
    classDef planned fill:#1e1b3a,stroke:#a78bfa,color:#c4b5fd,stroke-dasharray:5 5
    classDef caller fill:#0b1224,stroke:#22d3ee,color:#e2e8f0
    classDef store fill:#111827,stroke:#f59e0b,color:#fde68a
    class MW,AUTH,SC,GW,MCP,T1 built
    class SCAN,AUD,RL,AG,A2A planned
    class UI,INS caller

```

## V4 renamed

```mermaid
flowchart LR
    subgraph CALLERS["Callers"]
        direction TB
        nag["🤖 LLM agent<br/>(LangGraph · planned)"]
        nui["📊 React dashboard"]
        na2a["🤝 na2a manager / worker<br/>(planned)"]
        nins["🔍 nmcp Inspector / clients"]
    end

    subgraph GUARD["🛡️ nmcp Guard · FastAPI"]
        direction TB
        nmw["HTTP hardening<br/>body limit · request ID · CSP · CORS"]
        nauth["Bearer auth<br/>mcpg_ keys · fail closed"]
        nsc["Scope check<br/>route → scope map"]
        ngw["Gateway<br/>allowlist · arg cap · timeout"]
        nscan["Tool-poisoning scanner<br/>(planned)"]
        naud["Audit log + SSE<br/>(planned)"]
        nrl["Rate limit + metrics<br/>(planned)"]
    end

    subgraph TOOLS["🔧 nmcp server · /mcp/"]
        direction TB
        nmcp["FastMCP 'mcp-guard'<br/>Streamable HTTP"]
        nt1["list_notes · read_note · write_note"]
    end

    ndb[("🗄️ SQLAlchemy async<br/>SQLite dev · Postgres 16 planned")]

    nag --> nmw
    nui --> nmw
    na2a --> nmw
    nins --> nmw
    nmw --> nauth --> nsc
    nsc -->|"/api/notes"| ngw --> nmcp
    nsc -->|"/mcp/ · agent:run"| nmcp
    nmcp --> nt1
    nsc -.-> nscan
    nsc -.-> naud
    nsc -.-> nrl
    nauth -.->|"key lookup (P2)"| ndb
    naud -.-> ndb

    classDef built fill:#0f2a2e,stroke:#2dd4bf,color:#e2e8f0,stroke-width:2px
    classDef planned fill:#1e1b3a,stroke:#a78bfa,color:#c4b5fd,stroke-dasharray:5 5
    classDef caller fill:#0b1224,stroke:#22d3ee,color:#e2e8f0
    classDef store fill:#111827,stroke:#f59e0b,color:#fde68a
    class nmw,nauth,nsc,ngw,nmcp,nt1 built
    class nscan,naud,nrl,nag,na2a planned
    class nui,nins caller
    class ndb store
```
