import { useRef } from 'react'
import { motion, useInView } from 'framer-motion'
import { useReducedMotion } from '../../hooks/useReducedMotion'

const STATS = [
  { label: 'Command injection — 43% of tested MCP servers vulnerable', value: '43%', sub: '(Equixly 2025–Feb 2026; arXiv "Parasites in the Toolchain")' },
  { label: 'Path traversal — 82% of surveyed implementations at risk', value: '82%', sub: '(Endor Labs, 2,614 implementations, 2025)' },
  { label: 'Critical vulnerability — 33% of 1,000 scanned servers', value: '33%', sub: '(Enkrypt AI, Oct 2025)' },
  { label: 'Code injection / missing auth — 67% code-injection risk; 34–38% no authentication', value: '67%', sub: '(Endor Labs + 2026 follow-up analyses)' },
  { label: 'CVE filing volume — 30+ CVEs in a single 60-day window, early 2026', value: '30+', sub: '(incl. CVE-2025-6514 mcp-remote, Anthropic Git server)' },
  { label: 'Tool poisoning — OWASP MCP Top 10, ranked #3', value: '#3', sub: 'Named a primary industry-wide attack surface (Invariant Labs, Apr 2025)' },
]

function StatBlock({ stat, delay }: { stat: typeof STATS[0]; delay: number }) {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: '-50px' })
  
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 24 }}
      animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 }}
      transition={{ duration: 0.8, delay, ease: [0.16, 1, 0.3, 1] }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        padding: '2rem 1.5rem',
        background: 'rgba(255,255,255,0.02)',
        borderRadius: '16px',
        border: '1px solid rgba(255,255,255,0.05)',
      }}
    >
      <div style={{
        fontFamily: 'var(--font-display)',
        fontSize: 'clamp(2rem, 4vw, 3rem)',
        fontWeight: 700,
        color: 'var(--accent)',
        lineHeight: 1,
        marginBottom: '1rem',
      }}>
        {stat.value}
      </div>
      <div style={{
        fontFamily: 'var(--font-body)',
        fontSize: '0.8rem',
        fontWeight: 600,
        color: '#fff',
        marginBottom: '0.5rem',
      }}>
        {stat.label.split('—')[0]}
      </div>
      <div style={{
        fontFamily: 'var(--font-body)',
        fontSize: '0.7rem',
        color: 'var(--text-secondary)',
        lineHeight: 1.5,
      }}>
        {stat.sub}
      </div>
    </motion.div>
  )
}

export default function WhyNowSection() {
  const reducedMotion = useReducedMotion()

  return (
    <section
      aria-label="Why This Problem, Why Now"
      style={{
        position: 'relative',
        background: '#0A0A0B',
        padding: '8rem 2.5rem',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '4rem',
      }}
    >
      {/* Headline & Body */}
      <div style={{ textAlign: 'center', maxWidth: '800px' }}>
        <h2
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(2.5rem, 6vw, 5rem)',
            fontWeight: 900,
            lineHeight: 0.9,
            letterSpacing: '-0.01em',
            textTransform: 'uppercase',
            color: '#fff',
            marginBottom: '1.5rem',
          }}
        >
          Why This Problem,<br />Why Now
        </h2>
        <p style={{
          fontFamily: 'var(--font-body)',
          fontSize: '1.1rem',
          lineHeight: 1.75,
          color: 'var(--text-secondary)',
        }}>
          The industry adopted MCP faster than it figured out how to secure it. 
          Every figure here is tied to a named, cited source.
        </p>
      </div>

      {/* Pull Quote */}
      <div style={{ maxWidth: '900px', textAlign: 'center', position: 'relative' }}>
        <div style={{
          position: 'absolute',
          top: '-2rem',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '60px',
          height: '2px',
          background: 'var(--accent)',
          opacity: 0.5,
        }} />
        <blockquote
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(1.5rem, 3.5vw, 2.5rem)',
            fontWeight: 700,
            color: '#fff',
            lineHeight: 1.2,
            letterSpacing: '-0.02em',
          }}
        >
          "Most MCP servers blindly trust every tool call. Ours doesn't — we also built a tool that checks whether other people's servers do, and we show agents actually delegating work to each other, not just calling tools."
        </blockquote>
      </div>

      {/* Stats Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: '1.5rem',
        width: '100%',
        maxWidth: '1200px',
        marginTop: '2rem',
      }}>
        {STATS.map((stat, i) => (
          <StatBlock key={i} stat={stat} delay={reducedMotion ? 0 : 0.1 * i} />
        ))}
      </div>
    </section>
  )
}
