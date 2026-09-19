import { useRef } from 'react'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useReducedMotion } from '../../hooks/useReducedMotion'

gsap.registerPlugin(ScrollTrigger)

const FEATURES = [
  {
    num: '01',
    title: 'Sandboxed Execution',
    body: 'Every tool call runs inside a disposable, least-privilege Docker container — read-only root filesystem, no network by default, all capabilities dropped. No escape in the documented adversarial test suite.',
  },
  {
    num: '02',
    title: 'Tamper Detection',
    body: 'SHA-256 schema fingerprinting with trust-on-first-use baselining catches silent tool redefinitions ("rug pulls") while still allowing signed, version-bumped updates through.',
  },
  {
    num: '03',
    title: 'Verified A2A Delegation',
    body: 'An independent manager agent discovers a worker\'s Agent Card, verifies its signature, delegates a task over HTTP, and receives a signed result — one complete, auditable delegation cycle.',
  },
]

function ConnectorLine() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 900 60"
      fill="none"
      style={{ width: '100%', maxWidth: '900px', overflow: 'visible' }}
    >
      {/* Main horizontal line */}
      <line x1="0" y1="30" x2="900" y2="30" stroke="rgba(255,255,255,0.25)" strokeWidth="1" strokeDasharray="6 4" />
      {/* Orange accent line segment in center */}
      <line x1="350" y1="30" x2="550" y2="30" stroke="#FE6E44" strokeWidth="1.5" />
      {/* Nodes at thirds */}
      {[150, 450, 750].map((x, i) => (
        <g key={i}>
          <circle cx={x} cy="30" r="5" fill="#FE6E44" opacity="0.9" />
          <circle cx={x} cy="30" r="9" fill="none" stroke="#FE6E44" strokeWidth="1" opacity="0.4" />
        </g>
      ))}
    </svg>
  )
}

export default function CoreFeaturesSection() {
  const sectionRef = useRef<HTMLElement>(null)
  const headlineRef = useRef<HTMLDivElement>(null)
  const featuresRef = useRef<HTMLDivElement>(null)
  const reducedMotion = useReducedMotion()

  useGSAP(() => {
    if (reducedMotion) return
    const ctx = gsap.context(() => {
      gsap.from(headlineRef.current, {
        opacity: 0,
        y: 50,
        scrollTrigger: {
          trigger: sectionRef.current,
          start: 'top 70%',
          end: 'top 30%',
          scrub: 1.2,
        },
      })

      // Staggered feature cards
      gsap.from('[data-feature-card]', {
        opacity: 0,
        y: 60,
        stagger: 0.15,
        scrollTrigger: {
          trigger: featuresRef.current,
          start: 'top 80%',
          end: 'top 40%',
          scrub: 1,
        },
      })
    }, sectionRef)
    return () => ctx.revert()
  }, { scope: sectionRef })

  return (
    <section
      ref={sectionRef}
      id="architecture"
      aria-label="Core Features"
      style={{
        position: 'relative',
        padding: '8rem 2.5rem 7rem',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '4rem',
        // Gradient: deep blood-red top → burnt orange mid → salmon bottom
        background: 'linear-gradient(180deg, #0C0000 0%, #922504 50%, #FEC1B2 100%)',
        overflow: 'hidden',
      }}
    >
      {/* Background texture — faint rock silhouette via radial gradients */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          background: `
            radial-gradient(ellipse 80% 60% at 50% 30%, rgba(146,37,4,0.4) 0%, transparent 70%),
            radial-gradient(ellipse 60% 80% at 20% 70%, rgba(12,0,0,0.6) 0%, transparent 60%),
            radial-gradient(ellipse 50% 60% at 80% 60%, rgba(12,0,0,0.5) 0%, transparent 60%)
          `,
          pointerEvents: 'none',
        }}
      />

      {/* Headline */}
      <div ref={headlineRef} style={{ textAlign: 'center', position: 'relative', zIndex: 2 }}>
        <h2
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(3.5rem, 10vw, 8rem)',
            fontWeight: 900,
            lineHeight: 0.88,
            letterSpacing: '-0.01em',
            textTransform: 'uppercase',
            color: '#fff',
            textShadow: '0 4px 40px rgba(0,0,0,0.5)',
          }}
        >
          Core<br />Features
        </h2>
      </div>

      {/* Feature columns */}
      <div
        ref={featuresRef}
        style={{
          position: 'relative',
          zIndex: 2,
          width: '100%',
          maxWidth: '1000px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: '3rem 2rem',
        }}
      >
        {FEATURES.map((feat) => (
          <article
            key={feat.num}
            data-feature-card=""
            aria-label={`Feature ${feat.num}: ${feat.title}`}
            style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
          >
            {/* Number */}
            <span style={{
              fontFamily: 'var(--font-display)',
              fontSize: '0.75rem',
              fontWeight: 700,
              letterSpacing: '0.2em',
              color: '#FE6E44',
            }}>
              {feat.num}
            </span>

            {/* Title */}
            <h3 style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'clamp(0.9rem, 1.5vw, 1.1rem)',
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: '#fff',
              lineHeight: 1.3,
            }}>
              {feat.title}
            </h3>

            {/* Body */}
            <p style={{
              fontFamily: 'var(--font-body)',
              fontSize: '0.875rem',
              lineHeight: 1.75,
              color: 'rgba(255,255,255,0.8)',
            }}>
              {feat.body}
            </p>
          </article>
        ))}
      </div>

      {/* Animated connector line */}
      <div style={{ position: 'relative', zIndex: 2, width: '100%', display: 'flex', justifyContent: 'center' }}>
        <ConnectorLine />
      </div>

      {/* CTA */}
      <a
        href="#architecture"
        className="pill-solid"
        aria-label="Explore the architecture"
        style={{ position: 'relative', zIndex: 2, fontSize: '0.7rem', letterSpacing: '0.15em' }}
      >
        Explore the Architecture
      </a>
    </section>
  )
}
