import { useEffect, useState } from 'react'
import { useIntersectionReveal } from '../../hooks/useScrollProgress'
import { ShieldAlert, ShieldCheck, Lock, AlertTriangle } from 'lucide-react'

type TamperState = 'verified' | 'changed' | 'detected' | 'blocked'

const STATES: TamperState[] = ['verified', 'changed', 'detected', 'blocked']

const STATE_LABELS: Record<TamperState, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  verified: { label: 'VERIFIED',  color: '#7CFF4F', bg: 'rgba(124,255,79,0.08)',  icon: ShieldCheck },
  changed:  { label: 'CHANGED',   color: '#F5B84B', bg: 'rgba(245,184,75,0.08)',  icon: AlertTriangle },
  detected: { label: 'DETECTED',  color: '#FF5C5C', bg: 'rgba(255,92,92,0.08)',   icon: ShieldAlert },
  blocked:  { label: 'BLOCKED',   color: '#FF5C5C', bg: 'rgba(255,92,92,0.08)',   icon: Lock },
}

export default function SchemaTamperSection() {
  const { ref, visible } = useIntersectionReveal(0.2)
  const [tamperState, setTamperState] = useState<TamperState>('verified')
  const [running, setRunning] = useState(false)

  useEffect(() => {
    if (!visible || running) return
    setRunning(true)

    const delays = [0, 1800, 3200, 4400]
    STATES.forEach((s, i) => {
      setTimeout(() => setTamperState(s), delays[i])
    })
  }, [visible])

  const { label, color, bg, icon: Icon } = STATE_LABELS[tamperState]

  const isThreat = tamperState === 'detected' || tamperState === 'blocked'
  const hashValue = tamperState === 'verified' ? '8f4c22...91a' : '8f4c22...XXX'

  return (
    <section
      id="tamper"
      ref={ref as React.RefObject<HTMLElement>}
      className="section-dark py-24 relative overflow-hidden"
      aria-label="Schema tamper detection"
    >
      {/* Threat ambiance */}
      {isThreat && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse at center, rgba(255,92,92,0.04) 0%, transparent 70%)' }}
          aria-hidden="true"
        />
      )}

      <div className="max-w-[1400px] mx-auto px-6 md:px-10">
        {/* Heading */}
        <div className="mb-16">
          <span className={`label-tech text-[#5a6660] tracking-[0.2em] reveal ${visible ? 'visible' : ''}`}>
            SCHEMA INTEGRITY
          </span>
          <h2 className={`text-display font-black text-white mt-3 reveal reveal-delay-1 ${visible ? 'visible' : ''}`}>
            TRUST WHAT
            <br />
            <span className="text-[#7CFF4F]">YOU CAN VERIFY.</span>
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-16">
          {/* Left: Schema card */}
          <div>
            <div
              className="rounded-xl p-6 border transition-all duration-500"
              style={{
                background: bg,
                borderColor: `${color}30`,
                boxShadow: `0 0 40px ${color}10`,
              }}
            >
              {/* Card header */}
              <div className="flex items-center justify-between mb-6">
                <span className="label-tech text-[#9BA39D]">TOOL SCHEMA</span>
                <div
                  className="flex items-center gap-2 px-2.5 py-1 rounded"
                  style={{ background: bg, border: `1px solid ${color}30` }}
                  aria-live="polite"
                  aria-label={`Schema status: ${label}`}
                >
                  <Icon size={12} style={{ color }} aria-hidden="true" />
                  <span className="label-tech" style={{ color }}>{label}</span>
                </div>
              </div>

              {/* Schema fields */}
              <div className="space-y-4 font-mono text-xs">
                <div className="flex justify-between">
                  <span className="text-[#5a6660]">VERSION</span>
                  <span className="text-[#9BA39D]">v1.0.4</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[#5a6660]">SHA-256</span>
                  <span
                    className="transition-colors duration-300"
                    style={{ color: tamperState === 'verified' ? '#7CFF4F' : '#FF5C5C' }}
                  >
                    {hashValue}
                  </span>
                </div>
                <div className="h-px bg-[#0f1a11]" aria-hidden="true" />

                {/* The tampered field */}
                <div className="flex justify-between items-center">
                  <span className="text-[#5a6660]">allow_redirects</span>
                  <div aria-live="polite">
                    {tamperState === 'verified' ? (
                      <span className="text-[#7CFF4F]">false</span>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="line-through text-[#5a6660]">false</span>
                        <span className="text-[#FF5C5C]">true</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Alert */}
              {tamperState === 'detected' && (
                <div className="mt-6 p-3 rounded border border-[#FF5C5C30] bg-[rgba(255,92,92,0.05)]">
                  <div className="label-tech text-[#FF5C5C] mb-1">HASH MISMATCH</div>
                  <div className="text-xs text-[#9BA39D]">SCHEMA TAMPER DETECTED</div>
                </div>
              )}

              {tamperState === 'blocked' && (
                <div className="mt-6 p-3 rounded border border-[#FF5C5C30] bg-[rgba(255,92,92,0.05)]">
                  <div className="label-tech text-[#FF5C5C] mb-1">AUTO-FREEZE ACTIVE</div>
                  <div className="flex gap-2 mt-3">
                    <button className="badge badge-red cursor-pointer hover:opacity-80 transition-opacity">REVIEW CHANGE</button>
                    <button className="badge badge-red cursor-pointer hover:opacity-80 transition-opacity">BLOCK TOOL</button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right: Progression */}
          <div className={`reveal reveal-delay-2 ${visible ? 'visible' : ''}`}>
            <p className="text-sm text-[#9BA39D] leading-relaxed mb-8 max-w-xs">
              MCP Guard fingerprints every tool schema with SHA-256.
              When a schema changes — intentionally or not — the hash mismatch
              triggers immediate detection and automatic freeze.
            </p>

            <div className="space-y-3" role="list" aria-label="Tamper detection stages">
              {STATES.map((s) => {
                const { label: l, color: c, icon: I } = STATE_LABELS[s]
                const isActive = s === tamperState
                const isPast = STATES.indexOf(s) < STATES.indexOf(tamperState)
                return (
                  <div
                    key={s}
                    role="listitem"
                    className="flex items-center gap-3 transition-all duration-300"
                    style={{ opacity: isActive || isPast ? 1 : 0.25 }}
                    aria-current={isActive ? 'step' : undefined}
                  >
                    <I size={14} style={{ color: isActive || isPast ? c : '#5a6660' }} aria-hidden="true" />
                    <span className="label-tech" style={{ color: isActive || isPast ? c : '#5a6660' }}>{l}</span>
                    {isActive && (
                      <div className="ml-auto w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: c }} aria-hidden="true" />
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 divider" aria-hidden="true" />
    </section>
  )
}
