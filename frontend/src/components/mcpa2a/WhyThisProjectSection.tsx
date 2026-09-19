import { useRef } from 'react'
import { motion, useInView } from 'framer-motion'
import { Briefcase, Target, FolderGit2, CheckCircle2 } from 'lucide-react'
import { useReducedMotion } from '../../hooks/useReducedMotion'

const BLOCKS = [
  {
    icon: Briefcase,
    title: 'Real, in-demand skill',
    desc: 'MCP/A2A protocol engineering, container isolation, and security-by-design transfer directly to AI infra, backend, and DevSecOps roles.'
  },
  {
    icon: Target,
    title: 'An open, actually-unsolved problem',
    desc: 'Anthropic itself frames tool-call sanitization as a developer responsibility, not something the protocol solves for you.'
  },
  {
    icon: FolderGit2,
    title: 'A portfolio artifact, not just a grade',
    desc: 'The scanner ships as its own standalone open-source project under a documented responsible-disclosure policy.'
  },
  {
    icon: CheckCircle2,
    title: 'Clean, testable success criteria',
    desc: 'Real client discovery, 100% tools callable, zero critical scanner findings on our own server, one complete A2A delegation cycle.'
  },
]

export default function WhyThisProjectSection() {
  const reducedMotion = useReducedMotion()

  return (
    <section
      aria-label="Why This Project"
      style={{
        background: '#0A0A0B',
        padding: '8rem 2.5rem',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '4rem',
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <h2 style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'clamp(2.5rem, 6vw, 4.5rem)',
          fontWeight: 900,
          color: '#fff',
          textTransform: 'uppercase',
          marginBottom: '1.5rem',
        }}>
          Why This Project
        </h2>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: '2rem',
        width: '100%',
        maxWidth: '1200px',
      }}>
        {BLOCKS.map((block, i) => {
          const blockRef = useRef(null)
          const isInView = useInView(blockRef, { once: true, margin: '-50px' })
          const Icon = block.icon

          return (
            <motion.div
              key={i}
              ref={blockRef}
              initial={{ opacity: 0, y: 20 }}
              animate={isInView || reducedMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
              transition={{ duration: 0.6, delay: reducedMotion ? 0 : i * 0.15 }}
              style={{
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.05)',
                borderRadius: '12px',
                padding: '2rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem',
              }}
            >
              <div style={{
                width: '48px',
                height: '48px',
                borderRadius: '8px',
                background: 'rgba(254,110,68,0.1)',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
              }}>
                <Icon size={24} color="var(--accent)" />
              </div>
              <h3 style={{
                fontFamily: 'var(--font-display)',
                fontSize: '1.2rem',
                fontWeight: 700,
                color: '#fff',
              }}>
                {block.title}
              </h3>
              <p style={{
                fontFamily: 'var(--font-body)',
                fontSize: '0.95rem',
                color: 'var(--text-secondary)',
                lineHeight: 1.6,
              }}>
                {block.desc}
              </p>
            </motion.div>
          )
        })}
      </div>
    </section>
  )
}
