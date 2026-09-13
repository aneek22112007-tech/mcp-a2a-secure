import { useIntersectionReveal } from '../../hooks/useScrollProgress'
import { ZERO_TRUST_CHECKS } from '../../data/landingData'
import { Shield, Hash, WifiOff, Lock, FileText, Check } from 'lucide-react'

const ICONS: Record<string, React.ElementType> = {
  shield: Shield,
  hash: Hash,
  'wifi-off': WifiOff,
  lock: Lock,
  'file-text': FileText,
}

const CRITERIA = [
  'IDENTITY',
  'SCOPE',
  'SCHEMA',
  'POLICY',
  'RUNTIME CONSTRAINTS',
  'SANDBOX BOUNDARIES',
]

export default function ZeroTrustSection() {
  const { ref, visible } = useIntersectionReveal(0.15)

  return (
    <section
      id="zero-trust"
      ref={ref as React.RefObject<HTMLElement>}
      className="section-full section-dark flex items-center py-24 relative"
      aria-label="Zero trust — trust nothing, verify everything"
    >
      <div className="max-w-[1400px] mx-auto px-6 md:px-10 w-full">

        {/* Giant statement */}
        <div className="mb-20">
          <h2 className={`text-hero font-black text-white leading-none reveal ${visible ? 'visible' : ''}`}
            style={{ letterSpacing: '-0.05em' }}
          >
            TRUST
            <br />
            <span style={{ WebkitTextStroke: '2px rgba(255,255,255,0.15)', color: 'transparent' }}>
              NOTHING.
            </span>
          </h2>
          <h2 className={`text-hero font-black text-[#7CFF4F] leading-none reveal reveal-delay-1 ${visible ? 'visible' : ''}`}
            style={{ letterSpacing: '-0.05em' }}
          >
            VERIFY
            <br />
            EVERYTHING.
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-16">
          {/* Left: Description + criteria */}
          <div>
            <p className={`text-sm text-[#9BA39D] max-w-xs leading-relaxed mb-8 reveal reveal-delay-2 ${visible ? 'visible' : ''}`}>
              MCP Guard treats tool execution as an untrusted boundary.
              Every request is evaluated against:
            </p>
            <ul className="space-y-2" aria-label="Zero trust criteria">
              {CRITERIA.map((c, i) => (
                <li
                  key={c}
                  className={`flex items-center gap-3 reveal ${visible ? 'visible' : ''}`}
                  style={{ transitionDelay: `${0.3 + i * 0.08}s` }}
                >
                  <div className="w-1 h-1 rounded-full bg-[#7CFF4F]" aria-hidden="true" />
                  <span className="label-tech text-[#9BA39D]">{c}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Right: Check indicators */}
          <div
            className="grid grid-cols-1 sm:grid-cols-2 gap-3"
            role="list"
            aria-label="Security check results"
          >
            {ZERO_TRUST_CHECKS.map((check, i) => {
              const Icon = ICONS[check.icon] || Shield
              return (
                <div
                  key={check.label}
                  role="listitem"
                  className={`p-4 rounded-lg border border-[#0f1a11] bg-[#050905] flex items-center gap-3 reveal ${visible ? 'visible' : ''}`}
                  style={{ transitionDelay: `${0.4 + i * 0.1}s` }}
                  aria-label={`${check.label}: ${check.status}`}
                >
                  <div className="w-8 h-8 rounded-md bg-[#0A100C] flex items-center justify-center border border-[#1a2a1e]" aria-hidden="true">
                    <Icon size={14} className="text-[#7CFF4F]" />
                  </div>
                  <div>
                    <div className="label-tech text-[#9BA39D]">{check.label}</div>
                    <div className="label-tech text-[#7CFF4F] mt-0.5">{check.status}</div>
                  </div>
                  <div className="ml-auto">
                    <div className="w-5 h-5 rounded-full bg-[#7CFF4F] bg-opacity-10 border border-[#7CFF4F] border-opacity-30 flex items-center justify-center animate-pulse-green">
                      <Check size={10} className="text-[#7CFF4F]" aria-hidden="true" />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 divider" aria-hidden="true" />
    </section>
  )
}
