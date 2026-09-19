import { useIntersectionReveal } from '../../hooks/useScrollProgress'
import { CORE_FEATURES } from '../../data/landingData'

export default function CoreFeaturesSection() {
  const { ref, visible } = useIntersectionReveal(0.1)

  return (
    <section
      id="features"
      ref={ref as React.RefObject<HTMLElement>}
      className="section-dark py-32 relative"
      aria-label="Core security features"
    >
      <div className="max-w-[1400px] mx-auto px-6 md:px-10">
        {/* Heading */}
        <div className="mb-24">
          <span className={`label-tech text-[#5a6660] tracking-[0.2em] reveal ${visible ? 'visible' : ''}`}>
            CAPABILITIES
          </span>
          <h2 className={`text-display font-black text-white mt-3 reveal reveal-delay-1 ${visible ? 'visible' : ''}`}>
            CORE
            <br />
            SECURITY
            <br />
            <span style={{ WebkitTextStroke: '2px rgba(255,255,255,0.15)', color: 'transparent' }}>
              FEATURES
            </span>
          </h2>
        </div>

        {/* Features — editorial stacked layout */}
        <div className="space-y-0">
          {CORE_FEATURES.map((feature, i) => (
            <div
              key={feature.number}
              className={`group grid grid-cols-1 md:grid-cols-[120px_1fr_1fr] gap-8 py-12 border-t border-[#0f1a11] reveal ${visible ? 'visible' : ''}`}
              style={{ transitionDelay: `${0.1 + i * 0.15}s` }}
            >
              {/* Number */}
              <div className="flex items-start">
                <span className="text-7xl font-black text-[#0f1a11] group-hover:text-[#1a3020] transition-colors duration-300 tabular-nums leading-none">
                  {feature.number}
                </span>
              </div>

              {/* Title */}
              <div className="flex items-start">
                <h3 className="text-feature font-black text-white whitespace-pre-line group-hover:text-[#7CFF4F] transition-colors duration-300">
                  {feature.title}
                </h3>
              </div>

              {/* Description + tags */}
              <div className="flex flex-col justify-between gap-6">
                <p className="text-sm text-[#9BA39D] leading-relaxed max-w-sm">
                  {feature.description}
                </p>
                <div className="flex flex-wrap gap-2">
                  {feature.tags.map((tag) => (
                    <span key={tag} className="badge badge-green">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
