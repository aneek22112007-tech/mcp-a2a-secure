import { useRef } from 'react'
import { motion, useInView } from 'framer-motion'
import { KeyRound, ShieldAlert, FlaskConical, PackageCheck, Terminal, Fingerprint, Database } from 'lucide-react'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import type { LucideIcon } from 'lucide-react'

const ROWS: Array<{ icon: LucideIcon, threat: string, mitigation: string, test: string }> = [
  { icon: KeyRound, threat: 'Secret exposure', mitigation: 'hashed keys, minimized persistence', test: 'secret test' },
  { icon: ShieldAlert, threat: 'Scope creep', mitigation: 'per-client scopes', test: 'denied-scope test' },
  { icon: FlaskConical, threat: 'Tool poisoning', mitigation: 'fingerprinting + optional LLM analysis', test: 'seeded fixture' },
  { icon: PackageCheck, threat: 'Supply-chain tampering', mitigation: 'pinned deps + integrity checks', test: 'CI + fixture' },
  { icon: Terminal, threat: 'Command injection', mitigation: 'validation + sandbox + scanner', test: 'seeded injection test' },
  { icon: Fingerprint, threat: 'Missing auth', mitigation: 'API-key allowlist', test: 'unauthorized-request test' },
  { icon: Database, threat: 'Audit gaps', mitigation: 'SQLite events + SSE', test: 'audit reconstruction' },
]

export default function ThreatModelSection() {
  const reducedMotion = useReducedMotion()

  return (
    <section
      aria-label="Threat Model"
      style={{
        background: '#040405',
        padding: '8rem 2.5rem',
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
          lineHeight: 1.1,
        }}>
          Every Mitigation Traces Back<br />To A Threat And A Test
        </h2>
      </div>

      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
        width: '100%',
        maxWidth: '1000px',
      }}>
        {ROWS.map((row, i) => {
          const rowRef = useRef(null)
          const isInView = useInView(rowRef, { once: true, margin: '-20px' })
          const Icon = row.icon

          return (
            <motion.div
              key={i}
              ref={rowRef}
              initial={{ opacity: 0, x: -30 }}
              animate={isInView || reducedMotion ? { opacity: 1, x: 0 } : { opacity: 0, x: -30 }}
              transition={{ duration: 0.5, delay: reducedMotion ? 0 : i * 0.1 }}
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
                <span style={{ color: 'rgba(255,255,255,0.2)', display: 'none' }}>→</span> {/* Hidden on mobile, visible on desktop via flex flow but let's keep it simple */}
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
        })}
      </div>
    </section>
  )
}
