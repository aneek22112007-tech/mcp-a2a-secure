import { useRef } from 'react'
import { motion, useInView } from 'framer-motion'
import { useReducedMotion } from '../../hooks/useReducedMotion'

function ScannerTag({
  tag,
  index,
  reducedMotion,
}: {
  tag: string
  index: number
  reducedMotion: boolean
}) {
  const tagRef = useRef(null)
  const isInView = useInView(tagRef, { once: true, margin: '-20px' })

  return (
    <motion.div
      ref={tagRef}
      initial={{ scale: 0.8, opacity: 0 }}
      animate={isInView || reducedMotion ? { scale: 1, opacity: 1 } : { scale: 0.8, opacity: 0 }}
      transition={{ duration: 0.4, delay: reducedMotion ? 0 : index * 0.1 }}
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
}

const TAGS = [
  'Prompt injection in descriptions (R1)',
  'Exfiltration hints (R2)',
  'Over-broad string inputs (R3)',
  'Oversized descriptions and schemas (R4)',
  'Suspicious parameter descriptions (R5)',
  'Tool name anomalies (R6)',
]

export default function SecurityScannerSection() {
  const sectionRef = useRef(null)
  const reducedMotion = useReducedMotion()

  return (
    <section
      id="scanner"
      ref={sectionRef}
      aria-label="Security Scanner"
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
          fontSize: 'clamp(2.5rem, 6vw, 4.5rem)',
          fontWeight: 900,
          color: '#fff',
          textTransform: 'uppercase',
          marginBottom: '1.5rem',
        }}>
          A Scanner That Stands On Its Own
        </h2>
        <p style={{
          fontFamily: 'var(--font-body)',
          fontSize: '1.1rem',
          color: 'var(--text-secondary)',
          lineHeight: 1.7,
        }}>
          Six static rules run on every tool this gateway registers, at startup and again before a call. They read the description, parameter text, schema size, and tool name.
        </p>
      </div>

      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: '1rem',
        maxWidth: '900px'
      }}>
        {TAGS.map((tag, i) => (
          <ScannerTag key={tag} tag={tag} index={i} reducedMotion={reducedMotion} />
        ))}
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
          Six Static Rules
        </div>
        <p style={{
          fontFamily: 'var(--font-body)',
          fontSize: '0.9rem',
          color: 'var(--text-secondary)',
          lineHeight: 1.6,
        }}>
          Six static rules run on every tool at startup and before calls. The hostile lab tool lab_translate_text gets past those rules on purpose, to show their limits.
        </p>
      </div>

      <div style={{
        maxWidth: '800px',
        background: 'rgba(245, 184, 75, 0.05)',
        border: '1px solid rgba(245, 184, 75, 0.2)',
        borderRadius: '8px',
        padding: '1.5rem',
      }}>
        <h3 style={{
          fontFamily: 'var(--font-display)',
          color: '#F5B84B',
          fontSize: '0.9rem',
          fontWeight: 700,
          textTransform: 'uppercase',
          marginBottom: '0.5rem',
        }}>
          Responsible Disclosure
        </h3>
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
