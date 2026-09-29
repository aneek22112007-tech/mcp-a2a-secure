import { useEffect, useState } from 'react'
import { useIntersectionReveal } from '../../hooks/useScrollProgress'
import { SECURITY_EVENTS } from '../../data/landingData'
import { CheckCircle2, XCircle, ShieldCheck } from 'lucide-react'

const AUDIT_TRAIL = [
  { time: '14:32:08', event: 'tool invoked',      detail: 'fs.read_file called by agent' },
  { time: '14:32:09', event: 'policy verified',   detail: 'scope check PASS'             },
  { time: '14:32:09', event: 'sandbox created',   detail: 'container mcp-exec-b7k2'      },
  { time: '14:32:10', event: 'execution completed', detail: 'exit code 0, 11ms'          },
  { time: '14:32:10', event: 'audit recorded',    detail: 'event persisted to SQLite'    },
]

export default function ObservabilitySection() {
  const { ref, visible } = useIntersectionReveal(0.15)
  const [visibleEvents, setVisibleEvents] = useState(0)
  const [visibleAudit, setVisibleAudit] = useState(0)

  useEffect(() => {
    if (!visible) return
    let i = 0
    const showEvent = () => {
      if (i > SECURITY_EVENTS.length) return
      setVisibleEvents(i)
      i++
      setTimeout(showEvent, 350)
    }
    setTimeout(showEvent, 400)

    let j = 0
    const showAudit = () => {
      if (j > AUDIT_TRAIL.length) return
      setVisibleAudit(j)
      j++
      setTimeout(showAudit, 500)
    }
    setTimeout(showAudit, 600)
  }, [visible])

  const getStatusIcon = (status: string) => {
    if (status === 'allowed' || status === 'verified')
      return <CheckCircle2 size={12} className="text-[#7CFF4F]" aria-hidden="true" />
    if (status === 'blocked')
      return <XCircle size={12} className="text-[#FF5C5C]" aria-hidden="true" />
    return <ShieldCheck size={12} className="text-[#9BA39D]" aria-hidden="true" />
  }

  const getStatusColor = (status: string) => {
    if (status === 'allowed' || status === 'verified') return '#7CFF4F'
    if (status === 'blocked') return '#FF5C5C'
    return '#9BA39D'
  }

  return (
    <section
      id="observability"
      ref={ref as React.RefObject<HTMLElement>}
      className="section-dark py-24 relative"
      aria-label="Runtime observability and audit trail"
    >
      <div className="max-w-[1400px] mx-auto px-6 md:px-10">
        {/* Heading */}
        <div className="mb-16">
          <span className={`label-tech text-[#5a6660] tracking-[0.2em] reveal ${visible ? 'visible' : ''}`}>
            OBSERVABILITY
          </span>
          <h2 className={`text-display font-black text-white mt-3 reveal reveal-delay-1 ${visible ? 'visible' : ''}`}>
            SEE WHAT YOUR
            <br />
            AGENTS ARE
            <br />
            <span className="text-[#7CFF4F]">DOING.</span>
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
          {/* Left: Tool call event stream */}
          <div>
            <div className="mb-4 flex items-center justify-between">
              <span className={`label-tech text-[#9BA39D] reveal ${visible ? 'visible' : ''}`}>TOOL CALLS</span>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-[#7CFF4F] animate-pulse" aria-hidden="true" />
                <span className="label-tech text-[#7CFF4F]">LIVE</span>
              </div>
            </div>

            <div className="space-y-2" role="log" aria-label="Tool call event stream" aria-live="polite">
              {SECURITY_EVENTS.slice(0, visibleEvents).map((evt, i) => (
                <div
                  key={`${evt.tool}-${i}`}
                  className="flex items-center gap-3 p-3 rounded-lg bg-[#050905] border border-[#0f1a11]"
                  style={{ animation: 'fadeUp 0.3s ease both' }}
                >
                  <span className="label-tech text-[#5a6660] w-14 shrink-0 tabular-nums">{evt.timestamp}</span>
                  {getStatusIcon(evt.status)}
                  <span className="font-mono text-xs text-[#9BA39D]">{evt.tool}</span>
                  <span
                    className="ml-auto label-tech shrink-0"
                    style={{ color: getStatusColor(evt.status) }}
                  >
                    {evt.status === 'allowed' ? '✓ ALLOWED'
                      : evt.status === 'blocked' ? '✕ BLOCKED'
                      : '✓ VERIFIED'}
                  </span>
                  {evt.latency && (
                    <span className="label-tech text-[#5a6660] ml-2">{evt.latency}ms</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Right: Audit trail */}
          <div>
            <div className="mb-4">
              <span className={`label-tech text-[#9BA39D] reveal ${visible ? 'visible' : ''}`}>EVENT STREAM</span>
            </div>

            <div className="space-y-0 border-l border-[#1a2a1e] pl-4" role="log" aria-label="Audit event stream">
              {AUDIT_TRAIL.slice(0, visibleAudit).map((entry, i) => (
                <div
                  key={`${entry.time}-${i}`}
                  className="relative pb-5 last:pb-0"
                  style={{ animation: 'fadeUp 0.3s ease both' }}
                >
                  {/* Timeline dot */}
                  <div
                    className="absolute -left-[18px] top-0 w-2 h-2 rounded-full bg-[#7CFF4F]"
                    style={{ boxShadow: '0 0 6px #7CFF4F' }}
                    aria-hidden="true"
                  />
                  <div className="label-tech text-[#5a6660] mb-0.5 tabular-nums">{entry.time}</div>
                  <div className="text-xs font-bold text-[#9BA39D]">{entry.event}</div>
                  <div className="label-tech text-[#5a6660] mt-0.5">{entry.detail}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 divider" aria-hidden="true" />
    </section>
  )
}
