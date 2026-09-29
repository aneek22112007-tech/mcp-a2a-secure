import { useEffect, useState } from 'react'
import { ArrowUpRight, ChevronDown } from 'lucide-react'
import { HERO_METRICS } from '../../data/landingData'

export default function HeroSection() {
  const [visible, setVisible] = useState(false)
  const [countersVisible, setCountersVisible] = useState(false)

  useEffect(() => {
    // Cinematic entrance — staggered reveals
    const t1 = setTimeout(() => setVisible(true), 300)
    const t2 = setTimeout(() => setCountersVisible(true), 1200)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [])

  return (
    <section
      id="hero"
      className="section-full section-dark flex flex-col justify-center items-center text-center relative"
      style={{ minHeight: '100vh' }}
      aria-label="Hero section"
    >
      {/* Eyebrow */}
      <div
        className={`transition-all duration-700 delay-100 ${
          visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
        }`}
        style={{ transitionTimingFunction: 'cubic-bezier(0.16,1,0.3,1)' }}
      >
        <span className="label-tech text-[#7CFF4F] tracking-[0.3em]">
          AI SECURITY INFRASTRUCTURE
        </span>
      </div>

      {/* HERO WORDMARK */}
      <div
        className={`mt-4 transition-all duration-1000 delay-300 ${
          visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'
        }`}
        style={{ transitionTimingFunction: 'cubic-bezier(0.16,1,0.3,1)' }}
      >
        <h1
          className="text-hero font-black text-white leading-none tracking-tight select-none"
          style={{ letterSpacing: '-0.05em' }}
        >
          MCP
          <br />
          <span
            style={{
              WebkitTextStroke: '2px rgba(255,255,255,0.15)',
              color: 'transparent',
              display: 'block',
            }}
          >
            GUARD
          </span>
        </h1>
      </div>

      {/* Primary message */}
      <div
        className={`mt-8 max-w-lg transition-all duration-900 delay-500 ${
          visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
        }`}
        style={{ transitionTimingFunction: 'cubic-bezier(0.16,1,0.3,1)' }}
      >
        <p className="text-feature font-bold text-white leading-none">
          SECURE THE
          <br />
          <span className="text-[#7CFF4F]">EXECUTION</span>
          <br />
          LAYER OF AI.
        </p>
      </div>

      {/* Supporting copy */}
      <div
        className={`mt-6 max-w-md transition-all duration-700 delay-700 ${
          visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
        }`}
        style={{ transitionTimingFunction: 'cubic-bezier(0.16,1,0.3,1)' }}
      >
        <p className="text-sm text-[#9BA39D] leading-relaxed">
          MCP Guard protects MCP tools and A2A agent workflows with verified
          execution, sandbox isolation, schema integrity, and continuous security analysis.
        </p>
      </div>

      {/* CTAs */}
      <div
        className={`mt-8 flex items-center gap-4 transition-all duration-700 delay-[900ms] ${
          visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
        }`}
        style={{ transitionTimingFunction: 'cubic-bezier(0.16,1,0.3,1)' }}
      >
        <a href="#runtime" className="btn-primary" aria-label="Get started with MCP Guard">
          GET STARTED
          <ArrowUpRight size={14} aria-hidden="true" />
        </a>
        <a href="#verified-execution" className="btn-secondary" aria-label="Explore security features">
          EXPLORE SECURITY
        </a>
      </div>

      {/* Metrics strip */}
      <div
        className={`absolute bottom-10 left-0 right-0 px-8 transition-all duration-700 delay-[1100ms] ${
          countersVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
        }`}
        style={{ transitionTimingFunction: 'cubic-bezier(0.16,1,0.3,1)' }}
      >
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          {/* Left label */}
          <div className="hidden md:flex items-center gap-6">
            <span className="label-tech text-[#5a6660]">MCP + A2A</span>
            <span className="w-px h-3 bg-[#1a2a1e]" />
            <span className="label-tech text-[#5a6660]">VERIFIED EXECUTION</span>
            <span className="w-px h-3 bg-[#1a2a1e]" />
            <span className="label-tech text-[#5a6660]">RUNTIME PROTECTION</span>
          </div>

          {/* Metrics */}
          <div className="flex items-center gap-6 mx-auto md:mx-0">
            {HERO_METRICS.map((m) => (
              <div key={m.label} className="text-center">
                <div className="text-lg font-black text-white tabular-nums">{m.value}</div>
                <div className="label-tech text-[#5a6660] mt-0.5" style={{ fontSize: '0.55rem' }}>
                  {m.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Scroll hint */}
      <div
        className={`absolute bottom-4 left-1/2 -translate-x-1/2 transition-all duration-500 delay-[1400ms] ${
          countersVisible ? 'opacity-60' : 'opacity-0'
        }`}
        aria-hidden="true"
      >
        <ChevronDown size={16} className="text-[#5a6660] animate-bounce" />
      </div>
    </section>
  )
}
