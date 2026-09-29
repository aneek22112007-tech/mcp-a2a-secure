import { useIntersectionReveal } from '../../hooks/useScrollProgress'

const TAGS = ['MCP', 'A2A', 'SANDBOX', 'ATTESTATION']

export default function BuiltToDefendSection() {
  const { ref, visible } = useIntersectionReveal(0.2)

  return (
    <section
      id="built-to-defend"
      className="section-full section-dark flex items-center relative py-24"
      ref={ref as React.RefObject<HTMLElement>}
      aria-label="Built to defend — editorial statement"
    >
      {/* Right side content */}
      <div className="max-w-[1400px] mx-auto px-6 md:px-10 w-full">
        <div className="flex flex-col md:flex-row items-center md:items-end justify-between gap-12">

          {/* Left: Editorial statement */}
          <div className="flex-1">
            <div className={`reveal ${visible ? 'visible' : ''}`}>
              <span className="label-tech text-[#5a6660] tracking-[0.2em]">SECURITY INFRASTRUCTURE</span>
            </div>
            <h2
              className={`text-display font-black text-white mt-4 reveal reveal-delay-1 ${visible ? 'visible' : ''}`}
            >
              BUILT TO
              <br />
              <span className="text-[#7CFF4F]">DEFEND.</span>
            </h2>

            <div className={`mt-8 max-w-sm reveal reveal-delay-2 ${visible ? 'visible' : ''}`}>
              <p className="text-[#9BA39D] text-sm leading-relaxed">
                AI agents are powerful because they can act.
                <br /><br />
                MCP gives them tools.
                <br />
                A2A lets them delegate.
                <br /><br />
                MCP Guard places a verifiable security boundary around those actions.
              </p>
            </div>

            {/* Tech tags */}
            <div className={`mt-8 flex flex-wrap gap-2 reveal reveal-delay-3 ${visible ? 'visible' : ''}`}>
              {TAGS.map((tag) => (
                <span
                  key={tag}
                  className="badge badge-green"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>

          {/* Right: Vertical stat strip */}
          <div className={`flex md:flex-col gap-6 md:gap-8 reveal reveal-delay-4 ${visible ? 'visible' : ''}`}>
            {[
              { label: 'TOOL CALLS', value: '142', unit: 'verified' },
              { label: 'SANDBOXED', value: '100', unit: '% isolated' },
              { label: 'THREATS', value: '0', unit: 'escaped' },
            ].map((stat) => (
              <div key={stat.label} className="text-right">
                <div className="text-4xl md:text-5xl font-black text-white tabular-nums">
                  {stat.value}
                </div>
                <div className="label-tech text-[#5a6660] mt-1" style={{ fontSize: '0.6rem' }}>
                  {stat.label}
                </div>
                <div className="label-tech text-[#7CFF4F]" style={{ fontSize: '0.6rem' }}>
                  {stat.unit}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="absolute bottom-0 left-0 right-0 divider" aria-hidden="true" />
    </section>
  )
}
