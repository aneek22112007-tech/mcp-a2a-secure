import { useRef } from 'react'
import { motion, useScroll, useSpring } from 'framer-motion'
import { useReducedMotion } from '../../hooks/useReducedMotion'

const MILESTONES = [
  { week: 'Weeks 1–2', title: 'Frontend shell + mock data', highlight: false },
  { week: 'Weeks 3–4', title: 'MCP server/client + sandbox core', highlight: false },
  { week: 'Week 5–6', title: 'Sandbox hardening + A2A prototyping begins in parallel', highlight: true },
  { week: 'Weeks 7–8', title: 'Scanner core + LLM layer', highlight: false },
  { week: 'Weeks 9–10', title: 'A2A signed delegation + demo (paired, highest-risk)', highlight: true },
  { week: 'Weeks 11–12', title: 'Testing, docs, polish, demo', highlight: false },
]

export default function RoadmapSection() {
  const containerRef = useRef<HTMLDivElement>(null)
  const reducedMotion = useReducedMotion()
  
  const { scrollXProgress } = useScroll({ container: containerRef })
  const scaleX = useSpring(scrollXProgress, {
    stiffness: 100,
    damping: 30,
    restDelta: 0.001
  })

  return (
    <section
      aria-label="Roadmap"
      style={{
        background: '#0A0A0B',
        padding: '8rem 0', // Full width for scroll snapping
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '4rem',
      }}
    >
      <div style={{ textAlign: 'center', padding: '0 2.5rem' }}>
        <h2 style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'clamp(2rem, 5vw, 4rem)',
          fontWeight: 900,
          color: '#fff',
          textTransform: 'uppercase',
          marginBottom: '1rem',
        }}>
          Built In Twelve Weeks,<br />By Design
        </h2>
        <p style={{
          fontFamily: 'var(--font-body)',
          fontSize: '0.85rem',
          color: 'var(--text-secondary)',
          maxWidth: '600px',
          margin: '0 auto',
          lineHeight: 1.6,
        }}>
          Milestone plan runs 12 weeks; confirm against mentor-provided grading scope before Week 1 if a shorter 6–8 week window applies.
        </p>
      </div>

      <div style={{ position: 'relative', width: '100%', padding: '2rem 0' }}>
        {/* Progress Bar Background */}
        <div style={{
          position: 'absolute',
          top: '50%',
          left: 0,
          right: 0,
          height: '2px',
          background: 'rgba(255,255,255,0.1)',
          transform: 'translateY(-50%)',
          zIndex: 1,
        }} />
        
        {/* Animated Progress Bar */}
        {!reducedMotion && (
          <motion.div
            style={{
              position: 'absolute',
              top: '50%',
              left: 0,
              right: 0,
              height: '2px',
              background: 'var(--accent)',
              transformOrigin: '0%',
              scaleX,
              transform: 'translateY(-50%)',
              zIndex: 2,
            }}
          />
        )}

        {/* Scroll Container */}
        <div
          ref={containerRef}
          style={{
            display: 'flex',
            overflowX: 'auto',
            scrollSnapType: 'x mandatory',
            padding: '0 2.5rem',
            gap: '4rem',
            position: 'relative',
            zIndex: 3,
            scrollbarWidth: 'none', // hide scrollbar Firefox
            msOverflowStyle: 'none', // hide scrollbar IE
          }}
        >
          {MILESTONES.map((ms, i) => (
            <div
              key={i}
              style={{
                scrollSnapAlign: 'center',
                flexShrink: 0,
                width: '300px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                gap: '1.5rem',
              }}
            >
              <div style={{
                width: '20px',
                height: '20px',
                borderRadius: '50%',
                background: ms.highlight ? 'var(--accent)' : '#0A0A0B',
                border: `2px solid ${ms.highlight ? 'var(--accent)' : 'rgba(255,255,255,0.3)'}`,
                boxShadow: ms.highlight ? '0 0 15px rgba(254,110,68,0.5)' : 'none',
              }} />
              
              <div style={{
                background: ms.highlight ? 'rgba(254,110,68,0.1)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${ms.highlight ? 'rgba(254,110,68,0.3)' : 'rgba(255,255,255,0.05)'}`,
                padding: '1.5rem',
                borderRadius: '12px',
                width: '100%',
              }}>
                <h3 style={{
                  fontFamily: 'var(--font-display)',
                  color: ms.highlight ? 'var(--accent)' : '#fff',
                  fontSize: '1rem',
                  fontWeight: 700,
                  marginBottom: '0.5rem',
                  textTransform: 'uppercase',
                }}>
                  {ms.week}
                </h3>
                <p style={{
                  fontFamily: 'var(--font-body)',
                  color: 'var(--text-secondary)',
                  fontSize: '0.9rem',
                  lineHeight: 1.5,
                }}>
                  {ms.title}
                </p>
              </div>
            </div>
          ))}
          {/* Spacer for ending padding */}
          <div style={{ flexShrink: 0, width: '2.5rem' }} />
        </div>
      </div>
    </section>
  )
}
