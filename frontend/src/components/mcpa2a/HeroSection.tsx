import { useRef, Suspense } from 'react'
import { motion } from 'framer-motion'
import Hero3D from './Hero3D'
import { useReducedMotion } from '../../hooks/useReducedMotion'

const STATS = [
  { label: 'COMMAND INJECTION', value: '43%' },
  { label: 'PATH TRAVERSAL', value: '82%' },
  { label: 'CRITICAL VULNS', value: '33%' },
  { label: 'CVEs / 60 DAYS', value: '30+' },
]

function StatBlock({ label, value, delay }: { label: string; value: string; delay: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, delay, ease: [0.16, 1, 0.3, 1] }}
      style={{ textAlign: 'center', flex: 1 }}
      aria-label={`${label}: ${value}`}
    >
      <div style={{
        fontFamily: 'var(--font-body)',
        fontSize: '0.6rem',
        letterSpacing: '0.16em',
        textTransform: 'uppercase',
        color: 'var(--text-secondary)',
        marginBottom: '0.35rem',
      }}>
        {label}
      </div>
      <div style={{
        fontFamily: 'var(--font-display)',
        fontSize: 'clamp(1.4rem, 3vw, 2.2rem)',
        fontWeight: 700,
        color: '#fff',
        lineHeight: 1,
      }}>
        {value}
      </div>
    </motion.div>
  )
}

export default function HeroSection() {
  const reducedMotion = useReducedMotion()
  const sectionRef = useRef<HTMLElement>(null)

  return (
    <section
      ref={sectionRef}
      id="hero"
      aria-label="Hero — MCP·A2A"
      style={{
        position: 'relative',
        width: '100%',
        minHeight: '100vh',
        background: '#000',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        paddingBottom: '6rem',
      }}
    >
      {/* Giant wordmark — sits BEHIND the 3D object via z-index */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: '18vh',
          left: 0,
          right: 0,
          padding: '0 2.5rem',
          zIndex: 1,
          pointerEvents: 'none',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        <motion.h1
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(3.8rem, 15vw, 15rem)',
            fontWeight: 900,
            lineHeight: 0.9,
            letterSpacing: '0.02em',
            textTransform: 'uppercase',
            color: '#fff',
            textAlign: 'center',
            whiteSpace: 'nowrap',
            width: '100%',
          }}
        >
          MCP·A2A
        </motion.h1>

        {/* Sub-labels beneath headline */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          width: '100%',
          maxWidth: '1400px',
          marginTop: '0.5rem',
          padding: '0 0.5rem',
        }}>
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7, duration: 0.6 }}
            className="label-caps"
          >
            Security Protocol
          </motion.span>
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.9, duration: 0.6 }}
            className="label-caps"
          >
            Open Source
          </motion.span>
        </div>
      </div>

      {/* 3D Object — overlays headline via higher z-index */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 2,
          pointerEvents: reducedMotion ? 'none' : 'auto',
        }}
      >
        {!reducedMotion && (
          <Suspense fallback={null}>
            <Hero3D className="w-full h-full" reducedMotion={reducedMotion} />
          </Suspense>
        )}
      </div>

      {/* Bottom content — stats + CTA */}
      <div
        style={{
          position: 'relative',
          zIndex: 3,
          padding: '0 2.5rem',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '2rem',
        }}
      >
        {/* Stats row */}
        <div
          role="list"
          aria-label="Key security metrics"
          style={{
            display: 'flex',
            gap: '1rem',
            width: '100%',
            maxWidth: '900px',
            flexWrap: 'wrap',
            justifyContent: 'center',
          }}
        >
          {STATS.map((stat, i) => (
            <div role="listitem" key={stat.label} style={{ flex: '1 1 160px', minWidth: '140px' }}>
              <StatBlock label={stat.label} value={stat.value} delay={1 + i * 0.12} />
            </div>
          ))}
        </div>

        {/* CTA */}
        <motion.a
          href="#architecture"
          className="pill-solid"
          aria-label="View MCP·A2A Architecture"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.6, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          style={{ fontSize: '0.7rem', letterSpacing: '0.15em' }}
        >
          View Architecture
        </motion.a>
      </div>

      {/* Scroll indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.4 }}
        transition={{ delay: 2.2, duration: 1 }}
        aria-hidden="true"
        style={{
          position: 'absolute',
          bottom: '2rem',
          right: '2.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          zIndex: 4,
        }}
      >
        <span className="label-caps" style={{ fontSize: '0.55rem' }}>Scroll</span>
        <div style={{
          width: '1px',
          height: '2.5rem',
          background: 'linear-gradient(to bottom, rgba(255,255,255,0.5), transparent)',
        }} />
      </motion.div>
    </section>
  )
}
