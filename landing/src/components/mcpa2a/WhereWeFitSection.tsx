import { useRef } from 'react'
import { motion, useInView } from 'framer-motion'
import { Check, Minus } from 'lucide-react'
import { useReducedMotion } from '../../hooks/useReducedMotion'

const MATRIX_DATA = [
  { feature: 'Lists/discovers servers', registries: true, gateways: false, agensi: true, us: false },
  { feature: 'Routes traffic across servers', registries: false, gateways: true, agensi: false, us: false },
  { feature: 'Runs tool calls sandboxed/isolated', registries: false, gateways: false, agensi: false, us: true },
  { feature: 'Detects tampered/poisoned tools', registries: false, gateways: false, agensi: 'Partial', us: true },
  { feature: 'Open, shareable security scanner', registries: false, gateways: false, agensi: false, us: true },
  { feature: 'Real agent-to-agent (A2A) task delegation', registries: false, gateways: false, agensi: false, us: true },
]

function MatrixIcon({ val, delay }: { val: boolean | string; delay: number }) {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: '-20px' })
  const reducedMotion = useReducedMotion()

  return (
    <motion.div
      ref={ref}
      initial={{ scale: 0, opacity: 0 }}
      animate={isInView || reducedMotion ? { scale: 1, opacity: 1 } : { scale: 0, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 200, damping: 15, delay: reducedMotion ? 0 : delay }}
      style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}
    >
      {val === true ? (
        <Check size={24} color="var(--accent)" style={{ filter: 'drop-shadow(0 0 8px rgba(254,110,68,0.6))' }} />
      ) : val === 'Partial' ? (
        <span style={{ color: '#F5B84B', fontSize: '0.8rem', fontWeight: 600 }}>Partial</span>
      ) : (
        <Minus size={20} color="rgba(255,255,255,0.2)" />
      )}
    </motion.div>
  )
}

export default function WhereWeFitSection() {
  const sectionRef = useRef(null)

  return (
    <section
      ref={sectionRef}
      aria-label="Where We Fit"
      style={{
        background: '#0A0A0B',
        padding: '6rem 2.5rem',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '4rem',
      }}
    >
      <h2 style={{
        fontFamily: 'var(--font-display)',
        fontSize: 'clamp(2.5rem, 6vw, 4.5rem)',
        fontWeight: 900,
        color: '#fff',
        textTransform: 'uppercase',
      }}>
        Where We Fit
      </h2>

      <div style={{ width: '100%', maxWidth: '1000px', overflowX: 'auto' }}>
        <table style={{
          width: '100%',
          minWidth: '700px',
          borderCollapse: 'collapse',
          fontFamily: 'var(--font-body)',
        }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
              <th style={{ padding: '1rem', textAlign: 'left', color: '#fff', fontSize: '0.8rem', textTransform: 'uppercase' }}>Feature</th>
              <th style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.7rem', textTransform: 'uppercase' }}>Registries</th>
              <th style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.7rem', textTransform: 'uppercase' }}>Gateways</th>
              <th style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.7rem', textTransform: 'uppercase' }}>Agensi-style scan</th>
              <th style={{ padding: '1rem', textAlign: 'center', color: 'var(--accent)', fontSize: '0.8rem', textTransform: 'uppercase' }}>This Project</th>
            </tr>
          </thead>
          <tbody>
            {MATRIX_DATA.map((row, i) => (
              <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <td style={{ padding: '1.25rem 1rem', color: '#fff', fontSize: '0.9rem' }}>{row.feature}</td>
                <td style={{ padding: '1.25rem 1rem' }}><MatrixIcon val={row.registries} delay={i * 0.1} /></td>
                <td style={{ padding: '1.25rem 1rem' }}><MatrixIcon val={row.gateways} delay={i * 0.1 + 0.05} /></td>
                <td style={{ padding: '1.25rem 1rem' }}><MatrixIcon val={row.agensi} delay={i * 0.1 + 0.1} /></td>
                <td style={{ padding: '1.25rem 1rem', background: 'rgba(254,110,68,0.03)' }}><MatrixIcon val={row.us} delay={i * 0.1 + 0.15} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ maxWidth: '800px', textAlign: 'center' }}>
        <p style={{
          fontFamily: 'var(--font-body)',
          fontSize: '1.1rem',
          color: 'var(--text-secondary)',
          lineHeight: 1.6,
        }}>
          We're not trying to out-list Smithery or out-route Agentgateway. We occupy the one lane — 
          <strong style={{ color: '#fff' }}> trustworthy execution </strong> — that every other category currently skips.
        </p>
      </div>
    </section>
  )
}
