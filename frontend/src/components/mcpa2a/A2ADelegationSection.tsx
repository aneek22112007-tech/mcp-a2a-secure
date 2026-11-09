import { useRef, useState } from 'react'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useReducedMotion } from '../../hooks/useReducedMotion'

gsap.registerPlugin(ScrollTrigger)

/*
 * Matches api/app/agents/a2a/ and api/app/routes/a2a.py:
 *   - POST /api/a2a/tasks/run needs agent:run
 *   - delegated scopes = manager ∩ worker ∩ notes tool scopes (delegation.attenuate)
 *   - the worker uses its own server-configured key and calls tools only through /mcp/
 *   - /mcp/ runs bearer auth -> rate limit -> tool pin -> tool (sandbox) -> injection guard on output
 *   - audit actions: a2a.delegate, a2a.worker.start, a2a.complete, a2a.denied (403 FORBIDDEN)
 */

const ACCENT = '#FE6E44'
const RED = '#f87171'
const COL = { user: 112, manager: 330, worker: 565, gateway: 795, tool: 1000 }

const HEADERS = [
  { x: COL.user, title: 'User task', sub: 'POST /api/a2a/tasks/run' },
  { x: COL.manager, title: 'Manager agent', sub: 'agent:run, notes:read' },
  { x: COL.worker, title: 'Worker agent', sub: 'own server-side key' },
  { x: COL.gateway, title: '/mcp/ gateway', sub: 'every tool call' },
  { x: COL.tool, title: 'list_notes', sub: 'notes tool' },
]

type Msg = { id: string; from: number; to: number; y: number; label: string; step: number }
const MSGS: Msg[] = [
  { id: 'm0', from: COL.user, to: COL.manager, y: 100, label: 'task (agent:run)', step: 1 },
  { id: 'm2', from: COL.manager, to: COL.worker, y: 225, label: 'task + plan + narrowed scopes', step: 3 },
  { id: 'm3', from: COL.worker, to: COL.gateway, y: 265, label: 'tools/call list_notes', step: 4 },
  { id: 'm4', from: COL.gateway, to: COL.tool, y: 345, label: 'run in sandbox', step: 8 },
  { id: 'm5', from: COL.tool, to: COL.gateway, y: 380, label: 'tool output', step: 9 },
  { id: 'm6', from: COL.gateway, to: COL.worker, y: 470, label: 'guarded result', step: 10 },
  { id: 'm7', from: COL.worker, to: COL.manager, y: 510, label: 'result', step: 11 },
  { id: 'm8', from: COL.manager, to: COL.user, y: 550, label: 'task completed', step: 12 },
]

const CHIPS = [
  { id: 'auth', x: 616, w: 64, label: 'auth', step: 5 },
  { id: 'rate', x: 690, w: 96, label: 'rate limit', step: 6 },
  { id: 'pin', x: 796, w: 52, label: 'pin', step: 7 },
]
const CHIP_Y = 287
const GUARD = { x: 720, y: 400, w: 160, h: 30, label: 'injection guard', step: 9.5 }

const TAGS = [
  { x: 348, y: 172, label: 'a2a.delegate', step: 2 },
  { x: 390, y: 234, label: 'a2a.worker.start', step: 3 },
  { x: 390, y: 519, label: 'a2a.complete', step: 11 },
]

// Packet stops. Step 2 is the scope narrowing box on the manager.
const STOPS: { x: number; y: number; caption: string }[] = [
  { x: COL.user, y: 100, caption: 'A user with agent:run submits a notes task.' },
  { x: COL.manager, y: 100, caption: 'The manager agent receives the task and plans it.' },
  { x: 450, y: 143, caption: 'Scopes are narrowed on the server: manager ∩ worker ∩ notes tool scopes. The grant is audited as a2a.delegate.' },
  { x: COL.worker, y: 225, caption: 'The worker starts with its own key and only the narrowed scopes (a2a.worker.start).' },
  { x: COL.gateway, y: 265, caption: 'The worker has no direct tool access. It calls list_notes through /mcp/.' },
  { x: 648, y: CHIP_Y + 31, caption: 'The gateway checks the worker key.' },
  { x: 738, y: CHIP_Y + 31, caption: 'Rate limit for that key.' },
  { x: 822, y: CHIP_Y + 31, caption: 'The tool must match its approved pin.' },
  { x: COL.tool, y: 345, caption: 'list_notes runs in the sandbox.' },
  { x: COL.gateway, y: GUARD.y + 31, caption: 'Tool output passes the injection guard before it goes back.' },
  { x: COL.worker, y: 470, caption: 'The worker gets the guarded result.' },
  { x: COL.manager, y: 510, caption: 'The worker reports back. The task is recorded as a2a.complete.' },
  { x: COL.user, y: 550, caption: 'The user reads the result with GET /api/a2a/tasks/{id}. Every audit event shares the task id.' },
]

function Pill({ x, y, label, on, color = ACCENT }: { x: number; y: number; label: string; on: boolean; color?: string }) {
  const w = label.length * 8.5 + 18
  return (
    <g style={{ opacity: on ? 1 : 0.45, transition: 'opacity 0.3s' }}>
      <rect x={x} y={y} width={w} height={22} rx={11} fill="rgba(254,110,68,0.08)" stroke={color} strokeWidth={1} />
      <text x={x + 9} y={y + 16} fill={color} fontSize={14} fontFamily="var(--font-mono, ui-monospace, monospace)">{label}</text>
    </g>
  )
}

export default function A2ADelegationSection() {
  const sectionRef = useRef<HTMLElement>(null)
  const pinRef = useRef<HTMLDivElement>(null)
  const packetRef = useRef<SVGGElement>(null)
  const reducedMotion = useReducedMotion()
  const [step, setStep] = useState(0)
  const stepRef = useRef(0)

  useGSAP(() => {
    if (reducedMotion || !packetRef.current) return
    const ctx = gsap.context(() => {
      gsap.set(packetRef.current, { x: STOPS[0].x, y: STOPS[0].y })
      const tl = gsap.timeline({
        defaults: { ease: 'power1.inOut', duration: 0.6 },
        scrollTrigger: {
          trigger: sectionRef.current,
          pin: pinRef.current,
          start: 'top top',
          end: () => `+=${window.innerHeight * 3.5}`,
          scrub: 0.6,
          invalidateOnRefresh: true,
          onUpdate: (self) => {
            const idx = Math.min(STOPS.length - 1, Math.floor(self.progress * STOPS.length))
            if (idx !== stepRef.current) {
              stepRef.current = idx
              setStep(idx)
            }
          },
        },
      })
      tl.to({}, { duration: 1 })
      for (let i = 1; i < STOPS.length; i++) {
        tl.to(packetRef.current, { x: STOPS[i].x, y: STOPS[i].y }, i - 0.7)
      }
      tl.to({}, { duration: 0.4 })
      document.fonts?.ready.then(() => ScrollTrigger.refresh())
    }, sectionRef)
    return () => ctx.revert()
  }, { scope: sectionRef, dependencies: [reducedMotion] })

  const cur = reducedMotion ? STOPS.length : step
  const state = (s: number) => (reducedMotion ? 'done' : Math.floor(s) === cur || s === cur ? 'on' : s < cur ? 'done' : 'off')
  const stroke = (s: number) => ({ on: ACCENT, done: 'rgba(254,110,68,0.55)', off: 'rgba(255,255,255,0.22)' })[state(s)]

  return (
    <section
      ref={sectionRef}
      aria-label="A2A Delegation"
      style={{ position: 'relative', background: 'rgba(10,10,11,0.62)' }}
    >
      <div
        ref={pinRef}
        style={{
          minHeight: '100vh',
          height: reducedMotion ? 'auto' : '100vh',
          padding: 'calc(64px + 1.25rem) 2.5rem 1.25rem',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '1rem',
          boxSizing: 'border-box',
        }}
      >
        <div style={{ textAlign: 'center', maxWidth: '1100px', width: '100%' }}>
          <h2
            className="section-heading"
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'clamp(1.6rem, 3vw, 2.6rem)',
              fontWeight: 900,
              lineHeight: 1.1,
              color: '#fff',
              textTransform: 'uppercase',
              margin: 0,
            }}
          >
            Independent Agents. Verified Hand-Off.
          </h2>
        </div>

        <div style={{ width: '100%', maxWidth: '1100px', flex: '0 1 auto', minHeight: 0 }}>
          <svg
            viewBox="0 0 1100 572"
            style={{ width: '100%', height: 'auto', maxHeight: 'calc(100vh - 64px - 13rem)', display: 'block' }}
            role="img"
            aria-label="Sequence: user task to manager agent, scopes narrowed, worker agent calls list_notes through the /mcp/ gateway, result returns to the manager. If the manager holds no notes scope, delegation is refused with 403 FORBIDDEN."
          >
            <defs>
              <marker id="a2a-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" fill="context-stroke" />
              </marker>
              <radialGradient id="a2a-packet">
                <stop offset="0%" stopColor="#fff" />
                <stop offset="45%" stopColor={ACCENT} />
                <stop offset="100%" stopColor="rgba(254,110,68,0)" />
              </radialGradient>
            </defs>

            {/* Lifelines */}
            {HEADERS.map((hd) => (
              <line key={hd.title} x1={hd.x} y1={62} x2={hd.x} y2={566} stroke="rgba(255,255,255,0.14)" strokeDasharray="3 6" />
            ))}
            {HEADERS.map((hd) => (
              <g key={hd.title + 'h'}>
                <rect x={hd.x - 98} y={8} width={196} height={54} rx={10} fill="rgba(14,14,16,0.92)" stroke="rgba(255,255,255,0.18)" />
                <text x={hd.x} y={31} textAnchor="middle" fill="#fff" fontSize={15} fontWeight={700} fontFamily="var(--font-body)">{hd.title}</text>
                <text x={hd.x} y={50} textAnchor="middle" fill="rgba(217,217,217,0.8)" fontSize={14} fontFamily="var(--font-mono, ui-monospace, monospace)">{hd.sub}</text>
              </g>
            ))}

            {/* Messages */}
            {MSGS.map((m) => {
              const dir = m.to > m.from ? 1 : -1
              return (
                <g key={m.id} style={{ transition: 'opacity 0.3s' }}>
                  <line x1={m.from + dir * 4} y1={m.y} x2={m.to - dir * 8} y2={m.y} stroke={stroke(m.step)} strokeWidth={state(m.step) === 'on' ? 2.5 : 1.5} markerEnd="url(#a2a-arrow)" />
                  <text x={(m.from + m.to) / 2} y={m.y - 8} textAnchor="middle" fill={state(m.step) === 'off' ? 'rgba(217,217,217,0.55)' : '#fff'} fontSize={14} fontFamily="var(--font-body)">{m.label}</text>
                </g>
              )
            })}

            {/* Scope narrowing on the manager */}
            <g>
              <rect x={345} y={120} width={210} height={46} rx={8} fill={state(2) === 'on' ? 'rgba(254,110,68,0.12)' : 'rgba(14,14,16,0.92)'} stroke={stroke(2)} strokeWidth={state(2) === 'on' ? 2 : 1} />
              <text x={357} y={139} fill="#fff" fontSize={14} fontWeight={700} fontFamily="var(--font-body)">Scopes narrowed</text>
              <text x={357} y={157} fill="rgba(217,217,217,0.85)" fontSize={14} fontFamily="var(--font-body)">manager ∩ worker ∩ notes</text>
            </g>

            {/* Denied branch */}
            <g style={{ opacity: state(2) === 'on' || reducedMotion ? 1 : 0.55, transition: 'opacity 0.3s' }}>
              <line x1={COL.manager - 4} y1={168} x2={COL.user + 8} y2={168} stroke={RED} strokeWidth={1.75} strokeDasharray="6 5" markerEnd="url(#a2a-arrow)" />
              <text x={(COL.user + COL.manager) / 2} y={158} textAnchor="middle" fill="rgba(217,217,217,0.9)" fontSize={14} fontFamily="var(--font-body)">no notes scope to hand down</text>
              <text x={(COL.user + COL.manager) / 2} y={188} textAnchor="middle" fill={RED} fontSize={13} fontWeight={700} fontFamily="var(--font-mono, ui-monospace, monospace)">403 FORBIDDEN · a2a.denied</text>
            </g>

            {/* Gateway checks */}
            {CHIPS.map((c) => (
              <g key={c.id}>
                <rect x={c.x} y={CHIP_Y} width={c.w} height={30} rx={6} fill={state(c.step) === 'on' ? 'rgba(254,110,68,0.18)' : 'rgba(14,14,16,0.92)'} stroke={stroke(c.step)} />
                <text x={c.x + c.w / 2} y={CHIP_Y + 20} textAnchor="middle" fill="#fff" fontSize={14} fontFamily="var(--font-body)">{c.label}</text>
              </g>
            ))}
            <text x={858} y={CHIP_Y + 20} fill="rgba(217,217,217,0.6)" fontSize={14} fontFamily="var(--font-body)">then the tool</text>
            <g>
              <rect x={GUARD.x} y={GUARD.y} width={GUARD.w} height={GUARD.h} rx={6} fill={cur === 9 ? 'rgba(254,110,68,0.18)' : 'rgba(14,14,16,0.92)'} stroke={stroke(9)} />
              <text x={GUARD.x + GUARD.w / 2} y={GUARD.y + 20} textAnchor="middle" fill="#fff" fontSize={14} fontFamily="var(--font-body)">{GUARD.label}</text>
            </g>

            {TAGS.map((t) => (
              <Pill key={t.label} x={t.x} y={t.y} label={t.label} on={reducedMotion || cur >= t.step} />
            ))}

            {!reducedMotion && (
              <g ref={packetRef} style={{ pointerEvents: 'none' }}>
                <circle r={14} fill="url(#a2a-packet)" opacity={0.6} />
                <circle r={5} fill="#fff" />
              </g>
            )}
          </svg>
        </div>

        <div style={{ width: '100%', maxWidth: '1100px', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: '1rem' }}>
          <p aria-live="polite" style={{ margin: 0, fontFamily: 'var(--font-body)', fontSize: '0.95rem', lineHeight: 1.5, color: '#fff', background: 'rgba(14,14,16,0.85)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '0.8rem 1.1rem' }}>
            <span style={{ color: ACCENT, fontSize: '0.75rem', letterSpacing: '0.14em', textTransform: 'uppercase', display: 'block', marginBottom: '0.25rem' }}>
              {reducedMotion ? 'How it works' : `Step ${step + 1} of ${STOPS.length}`}
            </span>
            {reducedMotion
              ? 'The manager narrows its scopes and hands the task to a worker that has its own key. The worker can only reach tools through the /mcp/ gateway.'
              : STOPS[step].caption}
          </p>
          <p style={{ margin: 0, fontFamily: 'var(--font-body)', fontSize: '0.88rem', lineHeight: 1.55, color: 'var(--text-secondary)', padding: '0.8rem 0.25rem' }}>
            <strong style={{ color: '#fff' }}>Status:</strong> Delegation uses the A2A SDK's task and agent-card formats. Worker limits are fully enforced at the gateway once per-tool /mcp/ scope checks land.
          </p>
        </div>
      </div>
    </section>
  )
}
