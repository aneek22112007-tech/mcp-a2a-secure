import { useRef } from 'react'
import { motion, useInView } from 'framer-motion'
import { useReducedMotion } from '../../hooks/useReducedMotion'

const TAGS = [
  'Command Injection',
  'Path Traversal',
  'Tool Poisoning',
  'Missing Authentication',
  'Tampered Schemas'
]

export default function SecurityScannerSection() {
  const sectionRef = useRef(null)
  const reducedMotion = useReducedMotion()

  return (
    <section
      ref={sectionRef}
      aria-label="Security Scanner"
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
          fontSize: 'clamp(2.5rem, 6vw, 4.5rem)',
          fontWeight: 900,
          color: '#fff',
          textTransform: 'uppercase',
          marginBottom: '1.5rem',
        }}>
          A Scanner That<br />Stands On Its Own
        </h2>
        <p style={{
          fontFamily: 'var(--font-body)',
          fontSize: '1.1rem',
          color: 'var(--text-secondary)',
          lineHeight: 1.7,
        }}>
          A standalone tool that checks any MCP server — ours or someone else's — for known security holes, independent from the core server by design, built to become its own portfolio artifact.
        </p>
      </div>

      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: '1rem',
        maxWidth: '900px'
      }}>
        {TAGS.map((tag, i) => {
          const tagRef = useRef(null)
          const isInView = useInView(tagRef, { once: true, margin: '-20px' })
          
          return (
            <motion.div
              key={i}
              ref={tagRef}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={isInView || reducedMotion ? { scale: 1, opacity: 1 } : { scale: 0.8, opacity: 0 }}
              transition={{ duration: 0.4, delay: reducedMotion ? 0 : i * 0.1 }}
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                padding: '0.75rem 1.5rem',
                borderRadius: '8px',
                fontFamily: 'var(--font-display)',
                fontSize: '0.9rem',
                fontWeight: 600,
                color: '#fff',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              {tag}
            </motion.div>
          )
        })}
      </div>

      <div style={{
        textAlign: 'center',
        padding: '3rem',
        background: 'rgba(255,255,255,0.02)',
        borderRadius: '16px',
        border: '1px solid rgba(255,255,255,0.05)',
        maxWidth: '800px',
        width: '100%',
      }}>
        <div style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'clamp(2rem, 4vw, 3rem)',
          fontWeight: 700,
          color: 'var(--accent)',
          lineHeight: 1,
          marginBottom: '1rem',
        }}>
          Zero False Negatives
        </div>
        <p style={{
          fontFamily: 'var(--font-body)',
          fontSize: '0.9rem',
          color: 'var(--text-secondary)',
          lineHeight: 1.6,
        }}>
          Measured against our own documented fixture suite (one seeded vulnerability per OWASP MCP Top 10 category), not the full real-world threat space, which no scanner can honestly claim to cover completely.
        </p>
      </div>

      <div style={{
        maxWidth: '800px',
        background: 'rgba(245, 184, 75, 0.05)',
        border: '1px solid rgba(245, 184, 75, 0.2)',
        borderRadius: '8px',
        padding: '1.5rem',
      }}>
        <h4 style={{
          fontFamily: 'var(--font-display)',
          color: '#F5B84B',
          fontSize: '0.9rem',
          fontWeight: 700,
          textTransform: 'uppercase',
          marginBottom: '0.5rem',
        }}>
          Responsible Disclosure
        </h4>
        <p style={{
          fontFamily: 'var(--font-body)',
          fontSize: '0.85rem',
          color: 'var(--text-secondary)',
          lineHeight: 1.5,
        }}>
          If the scanner finds a real vulnerability in a real third-party server during testing or a live demo, we do not publish it or the target's identity. We follow a 90-day coordinated-disclosure window to the maintainer first.
        </p>
      </div>
    </section>
  )
}
