import { useRef } from 'react'
import { motion, useInView } from 'framer-motion'
import { useReducedMotion } from '../../hooks/useReducedMotion'

const TABLE_DATA = [
  {
    category: 'Registries / marketplaces',
    examples: 'Smithery (3,300+ servers), Glama (22,000+), mcp.so (17,000+)',
    whatTheyDo: 'List and host servers for discovery',
    missing: 'No security review at all — pure listings'
  },
  {
    category: 'Gateways',
    examples: 'Docker MCP Gateway, Microsoft MCP Gateway, Agentgateway, Tyk, WSO2',
    whatTheyDo: 'Route and aggregate traffic across many servers',
    missing: 'Secure the network path, not the actual tool execution'
  },
  {
    category: 'Security-aware players',
    examples: 'Agensi, a few enterprise gateways (Lasso, MintMCP)',
    whatTheyDo: 'Basic automated scan before listing a server',
    missing: 'Shallow static checks only — no runtime sandboxing, not open/shareable'
  },
  {
    category: 'Official tooling',
    examples: 'MCP Inspector (Anthropic)',
    whatTheyDo: 'Lets developers debug/test a server locally',
    missing: 'Not a security tool — just a protocol viewer'
  }
]

export default function CompetitorLandscapeSection() {
  const sectionRef = useRef(null)
  const reducedMotion = useReducedMotion()

  return (
    <section
      ref={sectionRef}
      aria-label="Competitor Landscape"
      style={{
        background: '#0A0A0B',
        padding: '6rem 2.5rem',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '4rem',
      }}
    >
      <div style={{ textAlign: 'center', maxWidth: '800px' }}>
        <h2 style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'clamp(2rem, 5vw, 4rem)',
          fontWeight: 900,
          color: '#fff',
          textTransform: 'uppercase',
          marginBottom: '1rem',
        }}>
          Who Else Is In This Space
        </h2>
        <p style={{
          fontFamily: 'var(--font-body)',
          fontSize: '1.1rem',
          color: 'var(--text-secondary)',
        }}>
          The MCP ecosystem already has thousands of players. Here's what none of them do.
        </p>
      </div>

      <div style={{ width: '100%', maxWidth: '1200px', overflowX: 'auto' }}>
        <table style={{
          width: '100%',
          minWidth: '800px',
          borderCollapse: 'collapse',
          textAlign: 'left',
          fontFamily: 'var(--font-body)',
        }}>
          <thead>
            <tr style={{ borderBottom: '2px solid rgba(255,255,255,0.1)' }}>
              <th style={{ padding: '1rem', color: '#fff', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Category</th>
              <th style={{ padding: '1rem', color: '#fff', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Examples</th>
              <th style={{ padding: '1rem', color: '#fff', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>What they do</th>
              <th style={{ padding: '1rem', color: 'var(--accent)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>What they're missing</th>
            </tr>
          </thead>
          <tbody>
            {TABLE_DATA.map((row, i) => {
              const rowRef = useRef(null)
              const isInView = useInView(rowRef, { once: true, margin: '-20px' })
              return (
                <motion.tr
                  key={i}
                  ref={rowRef}
                  initial={{ opacity: 0, x: -20 }}
                  animate={isInView || reducedMotion ? { opacity: 1, x: 0 } : { opacity: 0, x: -20 }}
                  transition={{ duration: 0.5, delay: reducedMotion ? 0 : i * 0.15 }}
                  style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
                >
                  <td style={{ padding: '1.5rem 1rem', color: '#fff', fontWeight: 600 }}>{row.category}</td>
                  <td style={{ padding: '1.5rem 1rem', color: 'var(--text-secondary)' }}>{row.examples}</td>
                  <td style={{ padding: '1.5rem 1rem', color: 'var(--text-secondary)' }}>{row.whatTheyDo}</td>
                  <td style={{ padding: '1.5rem 1rem', color: '#fff' }}>{row.missing}</td>
                </motion.tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div style={{
        maxWidth: '900px',
        textAlign: 'center',
        padding: '2rem',
        background: 'rgba(254, 110, 68, 0.05)',
        border: '1px solid rgba(254, 110, 68, 0.2)',
        borderRadius: '12px',
      }}>
        <p style={{
          fontFamily: 'var(--font-body)',
          fontSize: '1.1rem',
          fontWeight: 600,
          color: 'var(--accent-light)',
          lineHeight: 1.6,
        }}>
          Nobody accessible in this market combines a well-built MCP server with a server that assumes every tool call is hostile by default, plus a public tool to check if others do too.
        </p>
      </div>
    </section>
  )
}
