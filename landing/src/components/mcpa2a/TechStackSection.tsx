

export default function TechStackSection() {
  return (
    <section
      aria-label="Technology Stack"
      style={{
        background: '#040405',
        padding: '8rem 2.5rem',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '4rem',
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <h2 style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'clamp(2.5rem, 6vw, 4.5rem)',
          fontWeight: 900,
          color: '#fff',
          textTransform: 'uppercase',
          marginBottom: '1.5rem',
        }}>
          Technology Stack
        </h2>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
        gap: '2rem',
        width: '100%',
        maxWidth: '1000px',
      }}>
        {/* Frontend Panel */}
        <div style={{
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(255,255,255,0.05)',
          borderRadius: '16px',
          padding: '2.5rem',
        }}>
          <h3 style={{
            fontFamily: 'var(--font-display)',
            fontSize: '1.5rem',
            color: 'var(--accent)',
            marginBottom: '1.5rem',
            textTransform: 'uppercase',
            fontWeight: 700,
          }}>
            Frontend
          </h3>
          <ul style={{
            fontFamily: 'var(--font-body)',
            color: 'var(--text-secondary)',
            fontSize: '1rem',
            lineHeight: 2,
            listStyle: 'none',
            padding: 0,
            margin: 0,
          }}>
            <li>React 18 + Vite + TypeScript</li>
            <li>Tailwind CSS + shadcn/ui</li>
            <li>Recharts &amp; React Flow</li>
            <li>Native EventSource (SSE)</li>
            <li>TanStack Query &amp; Zustand</li>
            <li>lucide-react</li>
            <li>Vitest + React Testing Library</li>
          </ul>
        </div>

        {/* Backend Panel */}
        <div style={{
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(255,255,255,0.05)',
          borderRadius: '16px',
          padding: '2.5rem',
        }}>
          <h3 style={{
            fontFamily: 'var(--font-display)',
            fontSize: '1.5rem',
            color: 'var(--accent)',
            marginBottom: '1.5rem',
            textTransform: 'uppercase',
            fontWeight: 700,
          }}>
            Backend &amp; Infra
          </h3>
          <ul style={{
            fontFamily: 'var(--font-body)',
            color: 'var(--text-secondary)',
            fontSize: '1rem',
            lineHeight: 2,
            listStyle: 'none',
            padding: 0,
            margin: 0,
          }}>
            <li>Official Python MCP SDK + FastAPI/Uvicorn</li>
            <li>Pydantic v2</li>
            <li>Docker Engine API (docker-py)</li>
            <li>SQLite + SQLAlchemy + Alembic</li>
            <li>Typer + Rich, Tree-sitter (scanner)</li>
            <li>GitHub Actions CI (Docker-in-Docker)</li>
          </ul>
        </div>
      </div>
    </section>
  )
}
