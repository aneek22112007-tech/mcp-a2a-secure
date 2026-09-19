import { useIntersectionReveal } from '../../hooks/useScrollProgress'
import { RUNTIME_METRICS, LATENCY_DATA } from '../../data/landingData'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'

export default function RuntimeSecuritySection() {
  const { ref, visible } = useIntersectionReveal(0.15)

  return (
    <section
      id="runtime"
      ref={ref as React.RefObject<HTMLElement>}
      className="section-full section-dark flex items-center py-24 relative"
      aria-label="Runtime security metrics"
    >
      <div className="max-w-[1400px] mx-auto px-6 md:px-10 w-full">
        {/* Heading */}
        <div className="mb-16">
          <span className={`label-tech text-[#5a6660] tracking-[0.2em] reveal ${visible ? 'visible' : ''}`}>
            RUNTIME OBSERVABILITY
          </span>
          <h2 className={`text-display font-black text-white mt-3 reveal reveal-delay-1 ${visible ? 'visible' : ''}`}>
            RUNTIME
            <br />
            <span style={{ WebkitTextStroke: '2px rgba(255,255,255,0.2)', color: 'transparent' }}>
              SECURITY.
            </span>
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-end">
          {/* Left: Metrics */}
          <div className="space-y-6">
            {RUNTIME_METRICS.map((m, i) => (
              <div
                key={m.label}
                className={`reveal ${visible ? 'visible' : ''}`}
                style={{ transitionDelay: `${0.1 + i * 0.1}s` }}
              >
                <div className="flex items-baseline justify-between mb-1">
                  <span className="label-tech text-[#5a6660]">{m.label}</span>
                  <span className="text-2xl font-black text-white tabular-nums">{m.value}</span>
                </div>
                <div className="h-px bg-[#0f1a11] relative overflow-hidden">
                  <div
                    className="absolute inset-y-0 left-0 bg-[#7CFF4F] transition-all duration-1000"
                    style={{
                      width: visible ? (m.value === '0' ? '0%' : m.value === '10/10' ? '100%' : '80%') : '0%',
                      opacity: 0.4,
                      transitionDelay: `${0.3 + i * 0.1}s`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Right: Chart */}
          <div className={`reveal reveal-delay-3 ${visible ? 'visible' : ''}`}>
            <div className="mb-3 flex items-center justify-between">
              <span className="label-tech text-[#5a6660]">TOOL-CALL LATENCY</span>
              <span className="label-tech text-[#7CFF4F]">ms</span>
            </div>
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={LATENCY_DATA} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                  <defs>
                    <linearGradient id="latGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#7CFF4F" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#7CFF4F" stopOpacity={0}   />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="t" tick={{ fontSize: 9, fill: '#5a6660' }} />
                  <YAxis tick={{ fontSize: 9, fill: '#5a6660' }} />
                  <Tooltip
                    contentStyle={{
                      background: '#0A100C',
                      border: '1px solid #1a2a1e',
                      borderRadius: 4,
                      fontSize: 11,
                    }}
                    labelStyle={{ color: '#9BA39D' }}
                    itemStyle={{ color: '#7CFF4F' }}
                  />
                  <Area
                    type="monotone"
                    dataKey="v"
                    stroke="#7CFF4F"
                    strokeWidth={1.5}
                    fill="url(#latGrad)"
                    dot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 divider" aria-hidden="true" />
    </section>
  )
}
