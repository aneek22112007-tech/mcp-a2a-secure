import { useRef, useState } from 'react'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useReducedMotion } from '../../hooks/useReducedMotion'

gsap.registerPlugin(ScrollTrigger)

const LAYERS = [
  { num: 1, title: 'Agent / UI', desc: 'User intent, LLM behavior, live state.', rule: 'Everything important must be observable.' },
  { num: 2, title: 'MCP', desc: 'Standard tool/resource exposure.', rule: 'Use the official SDK + strict schemas.' },
  { num: 3, title: 'Policy / Security', desc: 'Auth, scopes, integrity checks.', rule: 'Deny by default.' },
  { num: 4, title: 'Sandbox', desc: 'Actual tool execution.', rule: 'Isolate from host.' },
  { num: 5, title: 'Analysis / Persistence', desc: 'Scan, audit, A2A evidence.', rule: 'Make every claim reproducible.' },
]

const STEPS = ['Client request', 'Authenticate', 'Policy decision', 'Container run', 'Result streamed']

// Scroll distance per card while the section is pinned.
const PIN_VH_PER_CARD = 60
const NAV_OFFSET = 'calc(64px + 2rem)'

const ACCENT = '#FE6E44'
const CARD_BORDER = 'rgba(255,255,255,0.08)'
const CARD_GLOW = '0 0 0 1px rgba(254,110,68,0.25), 0 10px 40px -10px rgba(254,110,68,0.45)'
const NO_GLOW = '0 0 0 0 rgba(254,110,68,0), 0 0 0 0 rgba(254,110,68,0)'

const pad = (n: number) => String(n).padStart(2, '0')

export default function ArchitectureLayersSection() {
  const sectionRef = useRef<HTMLElement>(null)
  const pinRef = useRef<HTMLDivElement>(null)
  const cardRefs = useRef<(HTMLDivElement | null)[]>([])
  const numRefs = useRef<(HTMLDivElement | null)[]>([])
  const fillRef = useRef<HTMLDivElement>(null)
  const dotRefs = useRef<(HTMLSpanElement | null)[]>([])
  const reducedMotion = useReducedMotion()
  const [active, setActive] = useState(0)
  const activeRef = useRef(0)

  useGSAP(() => {
    if (reducedMotion) return
    const cards = cardRefs.current.filter(Boolean) as HTMLDivElement[]
    const nums = numRefs.current.filter(Boolean) as HTMLDivElement[]
    const dots = dotRefs.current.filter(Boolean) as HTMLSpanElement[]
    const steps = cards.length - 1

    const ctx = gsap.context(() => {
      // Initial state is set here, not inline, so content stays visible if GSAP never runs.
      gsap.set(cards, { opacity: 0.15, y: 40, scale: 0.97, borderLeftColor: CARD_BORDER, boxShadow: NO_GLOW })
      gsap.set(cards[0], { opacity: 1, y: 0, scale: 1, borderLeftColor: ACCENT, boxShadow: CARD_GLOW })
      gsap.set(nums, { color: 'rgba(255,124,86,0.45)' })
      gsap.set(nums[0], { color: ACCENT })
      gsap.set(fillRef.current, { scaleX: 0, transformOrigin: '0% 50%' })
      gsap.set(dots, { backgroundColor: 'rgba(255,255,255,0.25)', scale: 1 })
      gsap.set(dots[0], { backgroundColor: ACCENT, scale: 1.35 })

      const tl = gsap.timeline({
        defaults: { ease: 'power2.out' },
        scrollTrigger: {
          trigger: sectionRef.current,
          pin: pinRef.current,
          start: 'top top',
          end: () => `+=${(window.innerHeight * PIN_VH_PER_CARD * cards.length) / 100}`,
          scrub: 0.6,
          anticipatePin: 1,
          invalidateOnRefresh: true,
          onUpdate: (self) => {
            // One equal slice of the pin per card; the last slice holds card 05.
            const idx = Math.min(steps, Math.floor(self.progress * (steps + 1)))
            if (idx !== activeRef.current) {
              activeRef.current = idx
              setActive(idx)
            }
          },
        },
      })

      // Progress line fills linearly across all steps.
      tl.to(fillRef.current, { scaleX: 1, ease: 'none', duration: steps }, 0)

      // Timeline units: card i owns [i, i+1). The hand-off to card i is
      // centred on i, which is also where the counter switches.
      for (let i = 1; i <= steps; i++) {
        const at = i - 0.3
        tl.to(cards[i], { opacity: 1, y: 0, scale: 1, borderLeftColor: ACCENT, boxShadow: CARD_GLOW, duration: 0.6 }, at)
        tl.to(nums[i], { color: ACCENT, duration: 0.6 }, at)
        tl.to(cards[i - 1], { opacity: 0.5, borderLeftColor: CARD_BORDER, boxShadow: NO_GLOW, duration: 0.6 }, at)
        tl.to(nums[i - 1], { color: 'rgba(255,124,86,0.45)', duration: 0.6 }, at)
        tl.to(dots[i], { backgroundColor: ACCENT, scale: 1.35, duration: 0.2 }, i - 0.1)
      }
      // Hold on the last card so the total is cards.length units.
      tl.to({}, { duration: cards.length - tl.duration() })

      document.fonts?.ready.then(() => ScrollTrigger.refresh())
    }, sectionRef)
    return () => ctx.revert()
  }, { scope: sectionRef, dependencies: [reducedMotion] })

  const shown = reducedMotion ? LAYERS.length - 1 : active
  const layer = LAYERS[shown]

  return (
    <section
      ref={sectionRef}
      id="architecture"
      aria-label="Architecture Layers"
      style={{ position: 'relative', background: 'rgba(10,10,11,0.62)' }}
    >
      <div
        ref={pinRef}
        style={{
          position: 'relative',
          width: '100%',
          minHeight: '100vh',
          height: reducedMotion ? 'auto' : '100vh',
          display: 'flex',
          alignItems: 'center',
          padding: `${NAV_OFFSET} 2.5rem 2rem`,
          boxSizing: 'border-box',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: '1240px',
            margin: '0 auto',
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 5fr) minmax(0, 7fr)',
            gap: '3.5rem',
            alignItems: 'center',
          }}
        >
          {/* Left: heading, quote, active layer */}
          <div>
            <h2
              className="section-heading"
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'clamp(1.8rem, 3.2vw, 3rem)',
                fontWeight: 900,
                lineHeight: 1.05,
                color: '#fff',
                textTransform: 'uppercase',
                margin: '0 0 1.25rem',
              }}
            >
              Five Layers. Each One Is A Security Boundary.
            </h2>
            <blockquote
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '1rem',
                lineHeight: 1.6,
                color: 'var(--accent)',
                fontStyle: 'italic',
                margin: '0 0 2.25rem',
              }}
            >
              "The model is not the security boundary. The policy layer, schema checks, authorization, and sandbox are."
            </blockquote>

            {!reducedMotion && (
              <div aria-live="polite">
                <div
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontWeight: 900,
                    lineHeight: 1,
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: '0.6rem',
                  }}
                >
                  <span style={{ fontSize: 'clamp(3rem, 6vw, 5rem)', color: ACCENT }}>{pad(layer.num)}</span>
                  <span style={{ fontSize: '1.5rem', color: 'rgba(255,255,255,0.85)' }}>/ {pad(LAYERS.length)}</span>
                </div>
                <div style={{ marginTop: '0.9rem', fontFamily: 'var(--font-display)', fontSize: '1.05rem', color: '#fff', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  {layer.title}
                </div>
                <p style={{ marginTop: '0.4rem', fontFamily: 'var(--font-body)', fontSize: '1rem', lineHeight: 1.6, color: 'var(--text-secondary)', maxWidth: '30rem' }}>
                  {layer.desc} <strong style={{ color: 'var(--accent)' }}>Rule: {layer.rule}</strong>
                </p>
              </div>
            )}
          </div>

          {/* Right: cards + request path */}
          <div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
              {LAYERS.map((l, i) => (
                <div
                  key={l.num}
                  ref={(el) => { cardRefs.current[i] = el }}
                  style={{
                    background: 'rgba(14,14,16,0.82)',
                    border: `1px solid ${CARD_BORDER}`,
                    borderLeft: `3px solid ${reducedMotion ? ACCENT : CARD_BORDER}`,
                    borderRadius: '10px',
                    padding: '0.95rem 1.25rem',
                    display: 'flex',
                    gap: '1.25rem',
                    alignItems: 'center',
                    willChange: reducedMotion ? undefined : 'transform, opacity',
                  }}
                >
                  <div
                    ref={(el) => { numRefs.current[i] = el }}
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: '1.6rem',
                      fontWeight: 900,
                      color: ACCENT,
                      minWidth: '2.6rem',
                    }}
                  >
                    {pad(l.num)}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <h3 style={{ fontFamily: 'var(--font-display)', color: '#fff', fontSize: '1rem', margin: '0 0 0.2rem' }}>{l.title}</h3>
                    <p style={{ fontFamily: 'var(--font-body)', color: 'var(--text-secondary)', fontSize: '0.88rem', lineHeight: 1.45, margin: 0 }}>
                      {l.desc} <strong style={{ color: 'var(--accent)' }}>Rule: {l.rule}</strong>
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Request path: fills with scroll progress */}
            <div style={{ position: 'relative', marginTop: 'calc(2rem + 24px)', padding: '0 0.5rem' }} aria-label="Request path">
              <div style={{ position: 'relative', height: '2px', background: 'rgba(255,255,255,0.12)' }}>
                <div
                  ref={fillRef}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background: ACCENT,
                    transform: reducedMotion ? 'none' : undefined,
                  }}
                />
                {STEPS.map((s, i) => (
                  <span
                    key={s}
                    ref={(el) => { dotRefs.current[i] = el }}
                    style={{
                      position: 'absolute',
                      top: '50%',
                      left: `${10 + i * 20}%`,
                      width: '10px',
                      height: '10px',
                      marginTop: '-5px',
                      marginLeft: '-5px',
                      borderRadius: '50%',
                      background: ACCENT,
                    }}
                  />
                ))}
              </div>
              <div style={{ position: 'relative', height: '2.2rem', marginTop: '0.75rem' }}>
                {STEPS.map((s, i) => {
                  return (
                    <span
                      key={s}
                      style={{
                        position: 'absolute',
                        left: `${10 + i * 20}%`,
                        transform: 'translateX(-50%)',
                        whiteSpace: 'nowrap',
                        fontFamily: 'var(--font-body)',
                        fontSize: '0.7rem',
                        letterSpacing: '0.05em',
                        textTransform: 'uppercase',
                        color: i <= shown ? '#fff' : 'var(--text-secondary)',
                        transition: 'color 0.3s',
                      }}
                    >
                      {s}
                    </span>
                  )
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Progress rail */}
        {!reducedMotion && (
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              right: '1.25rem',
              top: '50%',
              transform: 'translateY(-50%)',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.6rem',
            }}
          >
            {LAYERS.map((l, i) => (
              <span
                key={l.num}
                style={{
                  display: 'block',
                  width: i === active ? '18px' : '10px',
                  height: '2px',
                  marginLeft: 'auto',
                  background: i === active ? ACCENT : 'rgba(255,255,255,0.3)',
                  transition: 'width 0.3s, background 0.3s',
                }}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
