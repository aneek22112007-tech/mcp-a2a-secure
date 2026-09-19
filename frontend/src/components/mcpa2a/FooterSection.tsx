import { motion } from 'framer-motion'

export default function FooterSection() {
  return (
    <footer
      id="docs"
      aria-label="Footer"
      style={{
        position: 'relative',
        minHeight: '85vh',
        // Deep red → near-black gradient
        background: 'linear-gradient(180deg, #922504 0%, #0C0000 100%)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '4rem 2.5rem',
      }}
    >
      {/* Background rock texture hints — via layered radial gradients */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          background: `
            radial-gradient(ellipse 70% 50% at 60% 40%, rgba(254,110,68,0.06) 0%, transparent 60%),
            radial-gradient(ellipse 40% 60% at 20% 70%, rgba(146,37,4,0.3) 0%, transparent 50%)
          `,
          pointerEvents: 'none',
        }}
      />

      {/* Asymmetric headline fragments */}
      <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'stretch' }}>
        {/* SANDBOXED — lower-left */}
        <motion.span
          initial={{ opacity: 0, x: -40 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
          aria-hidden="true"
          style={{
            position: 'absolute',
            bottom: '1rem',
            left: 0,
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(3.5rem, 9vw, 8rem)',
            fontWeight: 900,
            letterSpacing: '-0.02em',
            textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.9)',
            lineHeight: 1,
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        >
          SANDBOXED
        </motion.span>

        {/* & VERIFIED — upper-right */}
        <motion.span
          initial={{ opacity: 0, x: 40 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 1.2, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: '1rem',
            right: 0,
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(3.5rem, 9vw, 8rem)',
            fontWeight: 900,
            letterSpacing: '-0.02em',
            textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.9)',
            lineHeight: 1,
            textAlign: 'right',
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        >
          & VERIFIED
        </motion.span>
      </div>

      {/* Divider */}
      <div className="glow-line" style={{ margin: '2rem 0', opacity: 0.25 }} />

      {/* Bottom row */}
      <div style={{
        position: 'relative',
        zIndex: 2,
        display: 'flex',
        flexDirection: 'column',
        gap: '1.5rem',
      }}>
        {/* Labels row */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.5rem',
        }}>
          <span className="label-caps" style={{ fontSize: '0.6rem', opacity: 0.6 }}>
            All Rights Reserved / 2026
          </span>
          <span className="label-caps" style={{ fontSize: '0.6rem', opacity: 0.6 }}>
            Open Source Project
          </span>
        </div>

        {/* CTA pills row */}
        <div style={{
          display: 'flex',
          gap: '1rem',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
        }}>
          {/* GitHub — outline pill */}
          <a
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
            className="pill-outline"
            aria-label="View on GitHub"
            style={{ flex: '0 0 auto' }}
          >
            GitHub
          </a>

          {/* REQUEST A DEMO — solid orange pill */}
          <a
            href="#demo"
            className="pill-solid"
            aria-label="Request a demo"
            style={{ flex: '0 0 auto' }}
          >
            Request a Demo
          </a>

          {/* DOCS — outline pill */}
          <a
            href="#docs"
            className="pill-outline"
            aria-label="Read the documentation"
            style={{ flex: '0 0 auto' }}
          >
            Docs
          </a>
        </div>
      </div>
    </footer>
  )
}
