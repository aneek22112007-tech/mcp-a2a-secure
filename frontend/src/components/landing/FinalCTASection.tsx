import { useIntersectionReveal } from '../../hooks/useScrollProgress'
import { ArrowUpRight } from 'lucide-react'

export default function FinalCTASection() {
  const { ref, visible } = useIntersectionReveal(0.3)

  return (
    <section
      id="cta"
      ref={ref as React.RefObject<HTMLElement>}
      className="section-full section-dark flex flex-col justify-center items-center text-center relative overflow-hidden"
      style={{ minHeight: '80vh' }}
      aria-label="Call to action"
    >
      {/* Background radial glow */}
      <div
        className={`absolute inset-0 pointer-events-none transition-opacity duration-1000 ${
          visible ? 'opacity-100' : 'opacity-0'
        }`}
        style={{
          background: 'radial-gradient(circle at center, rgba(124,255,79,0.08) 0%, transparent 60%)',
        }}
        aria-hidden="true"
      />

      <div className="max-w-2xl mx-auto px-6 relative z-10">
        <div className={`reveal ${visible ? 'visible' : ''}`}>
          <span className="label-tech text-[#5a6660] tracking-[0.3em]">
            READY TO DEPLOY
          </span>
        </div>

        <h2 className={`text-display font-black text-white mt-6 mb-8 leading-none reveal reveal-delay-1 ${visible ? 'visible' : ''}`}
            style={{ letterSpacing: '-0.05em' }}
        >
          SECURE YOUR
          <br />
          <span className="text-[#7CFF4F]">AGENTS.</span>
        </h2>

        <p className={`text-sm text-[#9BA39D] leading-relaxed mb-10 max-w-md mx-auto reveal reveal-delay-2 ${visible ? 'visible' : ''}`}>
          Deploy MCP Guard today and establish a verifiable security boundary
          around your AI agent execution layer.
        </p>

        <div className={`flex items-center justify-center gap-4 reveal reveal-delay-3 ${visible ? 'visible' : ''}`}>
          <a href="#" className="btn-primary" aria-label="Deploy MCP Guard">
            DEPLOY NOW
            <ArrowUpRight size={14} aria-hidden="true" />
          </a>
          <a href="#" className="btn-secondary" aria-label="Read documentation">
            VIEW DOCS
          </a>
        </div>
      </div>
    </section>
  )
}
