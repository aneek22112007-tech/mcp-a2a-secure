import { useRef } from 'react'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { TrendingUp } from 'lucide-react'
import { useUIStore } from '../../store/uiStore'
import { useReducedMotion } from '../../hooks/useReducedMotion'

gsap.registerPlugin(ScrollTrigger)

const TABS = ['1H', '1D', '1W', '1Y', 'ALL']

export default function BuiltToLastSection() {
  const sectionRef = useRef<HTMLElement>(null)
  const headlineRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const tickerRef = useRef<HTMLDivElement>(null)
  const reducedMotion = useReducedMotion()
  const { activeTab, setActiveTab } = useUIStore()

  useGSAP(() => {
    if (reducedMotion) return
    const ctx = gsap.context(() => {
      // Headline scrubbed crossfade
      gsap.from(headlineRef.current, {
        opacity: 0,
        y: 60,
        scrollTrigger: {
          trigger: sectionRef.current,
          start: 'top 70%',
          end: 'top 30%',
          scrub: 1.2,
        },
      })

      gsap.from(bodyRef.current, {
        opacity: 0,
        y: 40,
        scrollTrigger: {
          trigger: sectionRef.current,
          start: 'top 60%',
          end: 'top 20%',
          scrub: 1.5,
        },
      })

      gsap.from(tickerRef.current, {
        opacity: 0,
        y: 80,
        scrollTrigger: {
          trigger: tickerRef.current,
          start: 'top 85%',
          end: 'top 55%',
          scrub: 1.2,
        },
      })
    }, sectionRef)

    return () => ctx.revert()
  }, { scope: sectionRef })

  return (
    <section
      ref={sectionRef}
      id="protocol"
      aria-label="Built to Last section"
      style={{
        position: 'relative',
        background: '#000',
        padding: '10rem 2.5rem 8rem',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '3rem',
      }}
    >
      {/* Headline */}
      <div ref={headlineRef} style={{ textAlign: 'center', maxWidth: '700px' }}>
        <h2
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(3rem, 9vw, 7rem)',
            fontWeight: 900,
            lineHeight: 0.9,
            letterSpacing: '-0.01em',
            textTransform: 'uppercase',
            color: '#fff',
            marginBottom: '2rem',
          }}
        >
          Built<br />to Last
        </h2>
      </div>

      {/* Body copy */}
      <div ref={bodyRef} style={{ maxWidth: '580px', textAlign: 'center' }}>
        <p style={{
          fontFamily: 'var(--font-body)',
          fontSize: '1rem',
          lineHeight: 1.75,
          color: 'var(--text-secondary)',
        }}>
          A security-first implementation of the Model Context Protocol with a real Agent2Agent
          delegation path — sandboxed execution, schema tamper detection, a standalone vulnerability
          scanner, and verified agent-to-agent hand-off.
        </p>
      </div>

      {/* Ticker / data module */}
      <div ref={tickerRef} style={{ width: '100%', maxWidth: '860px' }}>
        {/* Dashed line behind the module */}
        <div style={{
          position: 'relative',
          borderTop: '1px dashed rgba(255,255,255,0.15)',
          display: 'flex',
          flexDirection: 'column',
          gap: '0',
        }}>
          {/* Live-chart icon on the line */}
          <div style={{
            position: 'absolute',
            top: '-14px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#000',
            padding: '0 0.75rem',
          }}>
            <TrendingUp size={16} color="var(--accent)" aria-hidden="true" />
          </div>
        </div>

        {/* Main ticker row */}
        <div
          aria-label="Protocol status ticker"
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr auto 1fr',
            gap: '2rem',
            alignItems: 'center',
            padding: '2rem 0',
            borderBottom: '1px dashed rgba(255,255,255,0.1)',
          }}
        >
          {/* Left — status */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <span className="label-caps" style={{ fontSize: '0.6rem' }}>Protocol Status</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'clamp(1.4rem, 3vw, 2rem)',
                fontWeight: 700,
                color: '#fff',
              }}>
                SECURE
              </span>
              {/* Up indicator */}
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                background: 'rgba(254, 110, 68, 0.15)',
                color: 'var(--accent)',
                fontSize: '0.65rem',
                fontWeight: 600,
                padding: '0.2rem 0.5rem',
                borderRadius: '999px',
                border: '1px solid rgba(254, 110, 68, 0.3)',
              }}>
                ↑ ACTIVE
              </span>
            </div>
          </div>

          {/* Center — tabs + CTA */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '1.25rem',
          }}>
            {/* Range tabs */}
            <div
              role="tablist"
              aria-label="Time range selection"
              style={{
                display: 'flex',
                gap: '0.25rem',
                background: 'rgba(255,255,255,0.06)',
                borderRadius: '999px',
                padding: '0.25rem',
              }}
            >
              {TABS.map((tab) => (
                <button
                  key={tab}
                  role="tab"
                  aria-selected={activeTab === tab}
                  onClick={() => setActiveTab(tab)}
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: '0.6rem',
                    fontWeight: 600,
                    letterSpacing: '0.1em',
                    padding: '0.35rem 0.75rem',
                    borderRadius: '999px',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'background 0.2s, color 0.2s',
                    background: activeTab === tab ? 'var(--accent)' : 'transparent',
                    color: activeTab === tab ? '#fff' : 'rgba(255,255,255,0.5)',
                  }}
                >
                  {tab}
                </button>
              ))}
            </div>

            <a
              href="#demo"
              className="pill-solid"
              aria-label="Request a demo"
              style={{ fontSize: '0.65rem', padding: '0.6rem 1.5rem' }}
            >
              Request a Demo
            </a>
          </div>

          {/* Right — last scan */}
          <div style={{
            textAlign: 'right',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.25rem',
          }}>
            <span className="label-caps" style={{ fontSize: '0.6rem' }}>Last Scan</span>
            <span style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'clamp(0.85rem, 1.5vw, 1.1rem)',
              fontWeight: 600,
              color: '#fff',
            }}>
              0 Critical Findings
            </span>
          </div>
        </div>
      </div>
    </section>
  )
}
