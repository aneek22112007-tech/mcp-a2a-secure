import { useRef } from 'react'
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

export default function ArchitectureLayersSection() {
  const sectionRef = useRef<HTMLElement>(null)
  const pinRef = useRef<HTMLDivElement>(null)
  const layerRefs = useRef<HTMLDivElement[]>([])
  const lineRef = useRef<SVGLineElement>(null)
  const reducedMotion = useReducedMotion()

  useGSAP(() => {
    if (reducedMotion) return
    const ctx = gsap.context(() => {
      // Pin and reveal layers sequentially
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: sectionRef.current,
          start: 'top top',
          end: '+=150%',
          pin: true,
          scrub: 1,
        }
      })

      layerRefs.current.forEach((el, i) => {
        if (!el) return
        tl.fromTo(el, 
          { opacity: 0, y: 30 }, 
          { opacity: 1, y: 0, duration: 1 }, 
          i * 0.5
        )
      })

      // Animate stroke dash offset for the stepper line
      if (lineRef.current) {
        tl.fromTo(lineRef.current,
          { strokeDashoffset: 1000 },
          { strokeDashoffset: 0, duration: 2.5 },
          0
        )
      }
    }, sectionRef)
    return () => ctx.revert()
  }, { scope: sectionRef })

  return (
    <section ref={sectionRef} aria-label="Architecture Layers" style={{ background: '#0A0A0B', overflow: 'hidden' }}>
      <div ref={pinRef} style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 2.5rem' }}>
        
        <div style={{ textAlign: 'center', marginBottom: '4rem' }}>
          <h2 style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(2rem, 5vw, 4rem)',
            fontWeight: 900,
            color: '#fff',
            textTransform: 'uppercase',
            marginBottom: '1.5rem',
          }}>
            Five Layers.<br />Each One Is A Security Boundary.
          </h2>
          <blockquote style={{
            fontFamily: 'var(--font-body)',
            fontSize: '1.2rem',
            color: 'var(--accent)',
            fontStyle: 'italic',
          }}>
            "The model is not the security boundary. The policy layer, schema checks, authorization, and sandbox are."
          </blockquote>
        </div>

        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
          maxWidth: '800px',
          margin: '0 auto',
          width: '100%',
        }}>
          {LAYERS.map((layer, i) => (
            <div
              key={layer.num}
              ref={el => { if (el) layerRefs.current[i] = el }}
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '8px',
                padding: '1.5rem',
                display: 'flex',
                gap: '1.5rem',
                alignItems: 'center',
                opacity: reducedMotion ? 1 : 0, // Fallback for reduced motion
              }}
            >
              <div style={{
                fontFamily: 'var(--font-display)',
                fontSize: '2rem',
                fontWeight: 900,
                color: 'var(--accent-light)',
                opacity: 0.5,
              }}>
                0{layer.num}
              </div>
              <div>
                <h3 style={{ fontFamily: 'var(--font-display)', color: '#fff', fontSize: '1.2rem', marginBottom: '0.25rem' }}>{layer.title}</h3>
                <p style={{ fontFamily: 'var(--font-body)', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                  {layer.desc} <strong style={{ color: 'var(--accent)' }}>Rule: {layer.rule}</strong>
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Horizontal stepper visual */}
        <div style={{ marginTop: '4rem', maxWidth: '1000px', margin: '4rem auto 0', width: '100%' }}>
          <svg viewBox="0 0 1000 40" style={{ width: '100%', overflow: 'visible' }}>
            <line x1="0" y1="20" x2="1000" y2="20" stroke="rgba(255,255,255,0.1)" strokeWidth="2" />
            <line
              ref={lineRef}
              x1="0" y1="20" x2="1000" y2="20"
              stroke="var(--accent)"
              strokeWidth="2"
              strokeDasharray="1000"
              strokeDashoffset={reducedMotion ? 0 : 1000}
            />
            {[100, 300, 500, 700, 900].map(x => (
              <circle key={x} cx={x} cy="20" r="4" fill="#fff" />
            ))}
          </svg>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-body)', fontSize: '0.65rem', color: 'var(--text-secondary)', marginTop: '0.5rem', textTransform: 'uppercase' }}>
            <span>Client request</span>
            <span>Authenticate</span>
            <span>Policy decision</span>
            <span>Container run</span>
            <span>Result streamed</span>
          </div>
        </div>

      </div>
    </section>
  )
}
