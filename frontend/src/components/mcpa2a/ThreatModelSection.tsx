import { useRef } from 'react'
import { motion, useInView } from 'framer-motion'
import { KeyRound, ShieldAlert, FlaskConical, PackageCheck, Terminal, Fingerprint, Database } from 'lucide-react'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import type { LucideIcon } from 'lucide-react'

function ThreatRow({
  row,
  index,
  reducedMotion,
}: {
  row: { icon: LucideIcon, threat: string, mitigation: string, test: string }
  index: number
  reducedMotion: boolean
}) {
  const rowRef = useRef(null)
  const isInView = useInView(rowRef, { once: true, margin: '-20px' })
  const Icon = row.icon

  return (
    <motion.div
      ref={rowRef}
      initial={{ opacity: 0, x: -30 }}
      animate={isInView || reducedMotion ? { opacity: 1, x: 0 } : { opacity: 0, x: -30 }}
      transition={{ duration: 0.5, delay: reducedMotion ? 0 : index * 0.1 }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.05)',
        borderRadius: '8px',
        padding: '1rem 1.5rem',
        fontFamily: 'var(--font-body)',
      }}
    >
      <Icon size={20} color="var(--accent)" style={{ flexShrink: 0 }} />

      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: '1rem',
        flexGrow: 1,
        fontSize: '0.9rem',
      }}>
        <span style={{ color: '#fff', fontWeight: 600, minWidth: '180px' }}>{row.threat}</span>
        <span style={{ color: 'rgba(255,255,255,0.2)' }}>→</span>
        <span style={{ color: 'var(--text-secondary)', flexGrow: 1 }}>{row.mitigation}</span>
        <span style={{ color: 'rgba(255,255,255,0.2)', display: 'none' }}>→</span>
        <span style={{
          color: 'var(--accent-light)',
          background: 'rgba(254,110,68,0.1)',
          padding: '0.25rem 0.75rem',
          borderRadius: '100px',
          fontSize: '0.8rem',
          fontWeight: 600,
          textTransform: 'uppercase',
        }}>
          {row.test}
        </span>
      </div>
    </motion.div>
  )
}

const ROWS: Array<{ icon: LucideIcon, threat: string, mitigation: string, test: string }> = [
  { icon: KeyRound, threat: 'Secret exposure', mitigation: 'hashed keys, minimized persistence', test: 'test_api_keys.py' },
  { icon: ShieldAlert, threat: 'Scope creep', mitigation: 'per-client scopes', test: 'test_mcp_tool_scope.py' },
  { icon: FlaskConical, threat: 'Tool poisoning', mitigation: 'static scanner R1-R6 + fingerprint pinning', test: 'test_scanner.py' },
  { icon: PackageCheck, threat: 'Supply-chain tampering', mitigation: 'locked dependencies (uv.lock, package-lock.json), pinned fs upstream image, tool fingerprint pinning', test: 'test_upstream_runner.py' },
  { icon: Terminal, threat: 'Command injection', mitigation: 'Docker sandbox, no network, capabilities dropped', test: 'test_upstream_integration.py' },
  { icon: Fingerprint, threat: 'Missing auth', mitigation: 'API key required', test: 'test_routes_upstreams_unauthorized' },
  { icon: Database, threat: 'Audit gaps', mitigation: 'append-only audit table (Postgres trigger) + live stream', test: 'test_audit_integrity.py' },
]

export default function ThreatModelSection() {
  const reducedMotion = useReducedMotion()

  return (
    <section
      aria-label="Threat Model"
      style={{
        background: 'rgba(4,4,5,0.62)',
        padding: '8rem 2.5rem',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '4rem',
      }}
    >
      <div style={{ textAlign: 'center', maxWidth: '1100px', width: '100%' }}>
        <h2 className="section-heading" style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'clamp(2rem, 5vw, 4rem)',
          fontWeight: 900,
          color: '#fff',
          textTransform: 'uppercase',
          marginBottom: '1rem',
          lineHeight: 1.1,
        }}>
          Every Mitigation Traces Back To A Threat And A Test
        </h2>
      </div>

      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
        width: '100%',
        maxWidth: '1000px',
      }}>
        {ROWS.map((row, i) => (
          <ThreatRow key={row.threat} row={row} index={i} reducedMotion={reducedMotion} />
        ))}
      </div>
    </section>
  )
}
