import { useIntersectionReveal } from '../../hooks/useScrollProgress'
import { LATENCY_DATA, TOOLS } from '../../data/landingData'
import {
  AreaChart, Area, ResponsiveContainer,
} from 'recharts'
import { CheckCircle2, XCircle, AlertTriangle, Shield, Activity, ScanSearch, Share2 } from 'lucide-react'

const STATUS_PANELS = [
  { icon: Shield,    label: 'MCP SERVER CORE',    status: 'CONNECTED', color: '#7CFF4F' },
  { icon: Shield,    label: 'SANDBOX ISOLATION',  status: 'ENFORCED',  color: '#7CFF4F' },
  { icon: ScanSearch,label: 'SECURITY SCANNER',   status: 'ACTIVE',    color: '#7CFF4F' },
  { icon: Share2,    label: 'A2A DELEGATION',      status: 'VERIFIED',  color: '#7CFF4F' },
]

export default function ProductPreviewSection() {
  const { ref, visible } = useIntersectionReveal(0.1)

  const getToolIcon = (status: string) => {
    if (status === 'allowed') return <CheckCircle2 size={10} className="text-[#7CFF4F]" />
    if (status === 'blocked') return <XCircle size={10} className="text-[#FF5C5C]" />
    return <AlertTriangle size={10} className="text-[#F5B84B]" />
  }

  return (
    <section
      id="preview"
      ref={ref as React.RefObject<HTMLElement>}
      className="section-dark py-24 relative overflow-hidden"
      aria-label="MCP Guard product preview"
    >
      {/* Subtle bg glow */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[400px] pointer-events-none"
        style={{ background: 'radial-gradient(ellipse, rgba(124,255,79,0.04) 0%, transparent 70%)', filter: 'blur(40px)' }}
        aria-hidden="true"
      />

      <div className="max-w-[1400px] mx-auto px-6 md:px-10">
        {/* Heading */}
        <div className="mb-12 text-center">
          <span className={`label-tech text-[#5a6660] tracking-[0.2em] reveal ${visible ? 'visible' : ''}`}>
            PRODUCT
          </span>
          <h2 className={`text-section font-black text-white mt-3 reveal reveal-delay-1 ${visible ? 'visible' : ''}`}>
            THE MCP GUARD
            <br />
            <span className="text-[#7CFF4F]">DASHBOARD.</span>
          </h2>
        </div>

        {/* Dashboard mockup */}
        <div
          className={`reveal reveal-delay-2 ${visible ? 'visible' : ''}`}
          style={{
            border: '1px solid #1a2a1e',
            borderRadius: 16,
            background: '#050905',
            overflow: 'hidden',
            transform: visible ? 'perspective(1200px) rotateX(2deg)' : 'perspective(1200px) rotateX(8deg)',
            transition: 'transform 1s cubic-bezier(0.16,1,0.3,1)',
          }}
        >
          {/* Dashboard topbar */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-[#0f1a11] bg-[#030604]">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-[#FF5C5C]" aria-hidden="true" />
              <div className="w-2.5 h-2.5 rounded-full bg-[#F5B84B]" aria-hidden="true" />
              <div className="w-2.5 h-2.5 rounded-full bg-[#7CFF4F]" aria-hidden="true" />
            </div>
            <span className="label-tech text-[#5a6660]">MCP GUARD — SECURITY DASHBOARD</span>
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-[#7CFF4F] animate-pulse" aria-hidden="true" />
              <span className="label-tech text-[#7CFF4F]">LIVE</span>
            </div>
          </div>

          {/* Dashboard body */}
          <div className="p-5 grid grid-cols-2 md:grid-cols-4 gap-3 border-b border-[#0f1a11]">
            {STATUS_PANELS.map((p) => {
              const Icon = p.icon
              return (
                <div key={p.label} className="p-3 rounded-lg bg-[#030604] border border-[#0f1a11]">
                  <div className="flex items-center gap-2 mb-2">
                    <Icon size={12} style={{ color: p.color }} aria-hidden="true" />
                    <span className="label-tech text-[#5a6660]">{p.label}</span>
                  </div>
                  <div className="label-tech" style={{ color: p.color, fontSize: '0.6rem' }}>
                    ● {p.status}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Dashboard content */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-0 divide-y md:divide-y-0 md:divide-x divide-[#0f1a11]">
            {/* Recent Tool Activity */}
            <div className="p-5">
              <div className="flex items-center gap-2 mb-4">
                <Activity size={12} className="text-[#5a6660]" aria-hidden="true" />
                <span className="label-tech text-[#9BA39D]">RECENT TOOL ACTIVITY</span>
              </div>
              <div className="space-y-2">
                {TOOLS.slice(0, 5).map((tool) => (
                  <div key={tool.name} className="flex items-center gap-3">
                    {getToolIcon(tool.status)}
                    <span className="font-mono text-xs text-[#9BA39D] flex-1">{tool.name}</span>
                    <span className="label-tech text-[#5a6660] tabular-nums">{tool.latency}ms</span>
                    <span className="label-tech text-[#5a6660] tabular-nums w-8 text-right">{tool.calls}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Tool Latency mini-chart */}
            <div className="p-5">
              <div className="flex items-center gap-2 mb-4">
                <Activity size={12} className="text-[#5a6660]" aria-hidden="true" />
                <span className="label-tech text-[#9BA39D]">TOOL LATENCY</span>
              </div>
              <div className="h-28">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={LATENCY_DATA} margin={{ top: 2, right: 2, left: -32, bottom: 0 }}>
                    <defs>
                      <linearGradient id="dashLatGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#7CFF4F" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#7CFF4F" stopOpacity={0}    />
                      </linearGradient>
                    </defs>
                    <Area
                      type="monotone"
                      dataKey="v"
                      stroke="#7CFF4F"
                      strokeWidth={1.5}
                      fill="url(#dashLatGrad)"
                      dot={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 divider" aria-hidden="true" />
    </section>
  )
}
