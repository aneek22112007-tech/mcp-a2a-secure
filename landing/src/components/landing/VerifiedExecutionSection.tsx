import { useEffect, useRef, useState } from 'react'
import { useIntersectionReveal, useSectionProgress } from '../../hooks/useScrollProgress'
import { PIPELINE_STAGES } from '../../data/landingData'
import { CheckCircle2 } from 'lucide-react'

export default function VerifiedExecutionSection() {
  const sectionRef = useRef<HTMLElement>(null)
  const { ref, visible } = useIntersectionReveal(0.1)
  const progress = useSectionProgress(sectionRef)
  const [activeStage, setActiveStage] = useState(-1)

  useEffect(() => {
    if (!visible) return
    // Activate stages based on scroll progress
    const stage = Math.floor(progress * (PIPELINE_STAGES.length + 1)) - 1
    setActiveStage(Math.min(stage, PIPELINE_STAGES.length - 1))
  }, [progress, visible])

  // Merge refs
  const setRef = (el: HTMLElement | null) => {
    sectionRef.current = el
    ;(ref as React.MutableRefObject<HTMLElement | null>).current = el
  }

  return (
    <section
      id="verified-execution"
      ref={setRef}
      className="section-full section-dark flex items-center py-24 relative"
      style={{ minHeight: '150vh' }}
      aria-label="Verified execution pipeline"
    >
      <div
        className="sticky top-0 left-0 w-full flex items-center"
        style={{ height: '100vh' }}
      >
        <div className="max-w-[1400px] mx-auto px-6 md:px-10 w-full">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-16 items-center">

            {/* Left: Heading */}
            <div>
              <span className={`label-tech text-[#5a6660] tracking-[0.2em] reveal ${visible ? 'visible' : ''}`}>
                SECURITY PIPELINE
              </span>
              <h2 className={`text-display font-black text-white mt-3 reveal reveal-delay-1 ${visible ? 'visible' : ''}`}>
                VERIFIED
                <br />
                <span className="text-[#7CFF4F]">EXECUTION.</span>
              </h2>
              <p className={`mt-6 text-sm text-[#9BA39D] max-w-xs leading-relaxed reveal reveal-delay-2 ${visible ? 'visible' : ''}`}>
                Every tool invocation passes through explicit security controls before execution.
              </p>

              {/* Active stage detail */}
              {activeStage >= 0 && (
                <div className="mt-8 p-4 border border-[#1a3020] rounded-lg bg-[#050905]">
                  <div className="label-tech text-[#7CFF4F] mb-1">
                    ACTIVE: {PIPELINE_STAGES[activeStage]?.label}
                  </div>
                  <div className="text-xs text-[#9BA39D]">
                    {PIPELINE_STAGES[activeStage]?.sublabel}
                  </div>
                </div>
              )}
            </div>

            {/* Right: Pipeline */}
            <div className="relative" aria-label="Security pipeline stages" role="list">
              {/* Vertical line */}
              <div className="absolute left-5 top-0 bottom-0 w-px bg-[#0f1a11]" aria-hidden="true">
                <div
                  className="absolute top-0 left-0 w-full bg-[#7CFF4F] transition-all duration-500"
                  style={{
                    height: visible
                      ? `${Math.min(100, ((activeStage + 1) / PIPELINE_STAGES.length) * 100)}%`
                      : '0%',
                    opacity: 0.6,
                    boxShadow: '0 0 8px #7CFF4F',
                  }}
                />
              </div>

              {PIPELINE_STAGES.map((stage, i) => {
                const isActive = i === activeStage
                const isPast = i < activeStage
                const isFuture = i > activeStage

                return (
                  <div
                    key={stage.id}
                    role="listitem"
                    className={`relative pl-12 pb-8 last:pb-0 transition-all duration-500 ${
                      isFuture ? 'opacity-30' : 'opacity-100'
                    }`}
                    aria-current={isActive ? 'step' : undefined}
                  >
                    {/* Node */}
                    <div
                      className={`absolute left-3 top-0 w-4 h-4 rounded-full border-2 transition-all duration-300 ${
                        isPast
                          ? 'bg-[#7CFF4F] border-[#7CFF4F]'
                          : isActive
                          ? 'bg-[#030604] border-[#7CFF4F] animate-pulse-green'
                          : 'bg-[#030604] border-[#1a2a1e]'
                      }`}
                      aria-hidden="true"
                    >
                      {isPast && (
                        <CheckCircle2
                          size={10}
                          className="text-[#030604] absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
                        />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex items-center justify-between">
                      <div>
                        <div
                          className={`text-sm font-bold ${
                            isPast
                              ? 'text-[#7CFF4F]'
                              : isActive
                              ? 'text-white'
                              : 'text-[#5a6660]'
                          }`}
                        >
                          {stage.label}
                        </div>
                        {stage.sublabel && (
                          <div className="label-tech text-[#5a6660] mt-0.5">
                            {stage.sublabel}
                          </div>
                        )}
                      </div>

                      {isPast && (
                        <span className="badge badge-green">PASS</span>
                      )}
                      {isActive && (
                        <span className="badge" style={{
                          background: 'rgba(124,255,79,0.08)',
                          color: '#7CFF4F',
                          border: '1px solid rgba(124,255,79,0.3)',
                          animation: 'pulseGreen 2s infinite',
                        }}>
                          ACTIVE
                        </span>
                      )}
                    </div>

                    {/* Active signal line */}
                    {isActive && (
                      <div className="mt-2 h-px bg-[#7CFF4F] opacity-40" style={{ boxShadow: '0 0 8px #7CFF4F' }} aria-hidden="true" />
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
