import { useEffect, useState } from 'react'
import { useIntersectionReveal } from '../../hooks/useScrollProgress'
import { AlertTriangle, ShieldX, ShieldCheck } from 'lucide-react'

type ThreatState = 'idle' | 'request' | 'violation' | 'denied' | 'contained' | 'recorded' | 'resolved'

const THREAT_STAGES: { state: ThreatState; label: string; sublabel: string; color: string }[] = [
  { state: 'request',   label: 'TOOL REQUEST',         sublabel: 'bash.run invoked',               color: '#9BA39D' },
  { state: 'violation', label: 'POLICY VIOLATION',     sublabel: 'Attempted network access',        color: '#F5B84B' },
  { state: 'denied',    label: 'DENIED',                sublabel: 'Action blocked by policy',        color: '#FF5C5C' },
  { state: 'contained', label: 'SANDBOX CONTAINED',    sublabel: 'Process terminated in sandbox',   color: '#FF5C5C' },
  { state: 'recorded',  label: 'AUDIT RECORDED',       sublabel: 'Event logged to audit trail',     color: '#7CFF4F' },
  { state: 'resolved',  label: 'SYSTEM SECURE',        sublabel: 'No runtime escape detected',      color: '#7CFF4F' },
]

export default function ThreatResponseSection() {
  const { ref, visible } = useIntersectionReveal(0.2)
  const [currentStage, setCurrentStage] = useState(-1)
  const [running, setRunning] = useState(false)

  useEffect(() => {
    if (!visible || running) return
    setRunning(true)
    let i = 0
    const advance = () => {
      setCurrentStage(i)
      i++
      if (i < THREAT_STAGES.length) {
        const delay = i <= 2 ? 900 : 600
        setTimeout(advance, delay)
      }
    }
    setTimeout(advance, 400)
  }, [visible])

  const isThreat = currentStage >= 1 && currentStage <= 3
  const isResolved = currentStage >= 4

  return (
    <section
      id="threat-response"
      ref={ref as React.RefObject<HTMLElement>}
      className="section-full section-dark flex items-center py-24 relative overflow-hidden"
      aria-label="Detect, contain, respond to threats"
    >
      {/* Threat background pulse */}
      {isThreat && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse at center, rgba(255,92,92,0.04) 0%, transparent 70%)',
            transition: 'opacity 0.5s',
          }}
          aria-hidden="true"
        />
      )}

      <div className="max-w-[1400px] mx-auto px-6 md:px-10 w-full">
        {/* Heading */}
        <div className="mb-16">
          <span className="label-tech text-[#5a6660] tracking-[0.2em]">THREAT RESPONSE</span>
          <h2 className={`text-display font-black text-white mt-3 reveal ${visible ? 'visible' : ''}`}>
            DETECT.
            <br />
            <span className={isThreat ? 'text-[#FF5C5C]' : isResolved ? 'text-[#7CFF4F]' : 'text-white'} style={{ transition: 'color 0.5s' }}>
              CONTAIN.
            </span>
            <br />
            RESPOND.
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-16 items-start">
          {/* Left: Flow */}
          <div className="space-y-3" role="list" aria-label="Threat response flow">
            {THREAT_STAGES.map((stage, i) => {
              const isActive = i === currentStage
              const isPast = i < currentStage

              return (
                <div
                  key={stage.state}
                  role="listitem"
                  className={`flex items-center gap-4 p-3 rounded-lg border transition-all duration-500 ${
                    isActive
                      ? `border-current bg-[#050905]`
                      : isPast
                      ? 'border-[#0f1a11] bg-transparent'
                      : 'border-transparent bg-transparent opacity-25'
                  }`}
                  style={{
                    borderColor: isActive ? stage.color + '40' : undefined,
                    background: isActive ? stage.color + '08' : undefined,
                  }}
                  aria-current={isActive ? 'step' : undefined}
                >
                  {/* Dot */}
                  <div
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{
                      background: isPast || isActive ? stage.color : '#1a2a1e',
                      boxShadow: isActive ? `0 0 8px ${stage.color}` : 'none',
                      transition: 'all 0.3s',
                    }}
                    aria-hidden="true"
                  />
                  <div className="flex-1">
                    <div className="text-xs font-bold" style={{ color: isActive ? stage.color : isPast ? '#9BA39D' : '#5a6660' }}>
                      {stage.label}
                    </div>
                    <div className="label-tech text-[#5a6660] mt-0.5">{stage.sublabel}</div>
                  </div>
                  {isPast && i >= 4 && <span className="badge badge-green">PASS</span>}
                  {isPast && i <= 3 && <span className="badge badge-red">BLOCKED</span>}
                </div>
              )
            })}
          </div>

          {/* Right: Statement */}
          <div>
            <div className={`reveal reveal-delay-2 ${visible ? 'visible' : ''}`}>
              <div
                className="w-16 h-16 rounded-xl flex items-center justify-center mb-6 transition-all duration-500"
                style={{
                  background: isResolved ? 'rgba(124,255,79,0.1)' : isThreat ? 'rgba(255,92,92,0.1)' : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${isResolved ? 'rgba(124,255,79,0.2)' : isThreat ? 'rgba(255,92,92,0.2)' : '#1a2a1e'}`,
                }}
                aria-hidden="true"
              >
                {isResolved
                  ? <ShieldCheck size={28} style={{ color: '#7CFF4F' }} />
                  : isThreat
                  ? <ShieldX size={28} style={{ color: '#FF5C5C' }} />
                  : <AlertTriangle size={28} className="text-[#5a6660]" />
                }
              </div>

              <p className="text-2xl font-bold text-white leading-tight mb-4">
                UNTRUSTED ACTIONS ARE STOPPED
                <br />
                BEFORE THEY BECOME
                <br />
                <span className="text-[#7CFF4F]">RUNTIME INCIDENTS.</span>
              </p>

              <p className="text-sm text-[#9BA39D] leading-relaxed max-w-xs">
                When a tool invocation violates policy, MCP Guard denies the action,
                terminates the sandbox, and records a detailed audit event — before
                any harm can occur.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
