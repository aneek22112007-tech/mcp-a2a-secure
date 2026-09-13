import { useRef } from 'react'
import { motion, useInView } from 'framer-motion'
import { useReducedMotion } from '../../hooks/useReducedMotion'

const CHIPS = [
  'Docker Engine API',
  'Read-only root FS',
  'Scoped bind mounts',
  '--network=none',
  'cap_drop=[ALL]',
  'Resource limits',
  'Structured JSON → SSE'
]

export default function SandboxedExecutionSection() {
  const sectionRef = useRef(null)
  const reducedMotion = useReducedMotion()

  return (
    <section
      ref={sectionRef}
      aria-label="Sandboxed Execution"
      style={{
        background: '#040405',
        padding: '8rem 2.5rem',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '3rem',
      }}
    >
      <div style={{ textAlign: 'center', maxWidth: '800px' }}>
        <h2 style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'clamp(2rem, 5vw, 4rem)',
          fontWeight: 900,
          color: '#fff',
          textTransform: 'uppercase',
          marginBottom: '1.5rem',
        }}>
          Containment is the Default,<br />Not the Exception
        </h2>
        <p style={{
          fontFamily: 'var(--font-body)',
          fontSize: '1.1rem',
          color: 'var(--text-secondary)',
          lineHeight: 1.7,
        }}>
          Every tool call runs in an isolated, locked-down container instead of being trusted blindly — built against the standard Docker Engine API so it stays portable to Linux, Windows, or a cloud CI runner. OrbStack is used only as local dev convenience on MacBook Air M4, never the deployment dependency.
        </p>
      </div>

      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: '1rem',
        maxWidth: '900px'
      }}>
        {CHIPS.map((chip, i) => {
          const chipRef = useRef(null)
          const isInView = useInView(chipRef, { once: true, margin: '-20px' })
          
          return (
            <motion.div
              key={i}
              ref={chipRef}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={isInView || reducedMotion ? { scale: 1, opacity: 1 } : { scale: 0.8, opacity: 0 }}
              transition={{ duration: 0.4, delay: reducedMotion ? 0 : i * 0.1 }}
              style={{
                background: 'rgba(254, 110, 68, 0.1)',
                border: '1px solid rgba(254, 110, 68, 0.3)',
                padding: '0.75rem 1.5rem',
                borderRadius: '100px',
                fontFamily: 'var(--font-display)',
                fontSize: '0.9rem',
                fontWeight: 600,
                color: 'var(--accent-light)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              {chip}
            </motion.div>
          )
        })}
      </div>
    </section>
  )
}
