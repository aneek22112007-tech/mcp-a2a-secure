import { useEffect, useRef, useState } from 'react'
import { Shield, ArrowUpRight } from 'lucide-react'

const NAV_LINKS = [
  { label: 'PRODUCT',      href: '#runtime' },
  { label: 'SECURITY',     href: '#verified-execution' },
  { label: 'ARCHITECTURE', href: '#architecture' },
  { label: 'DOCS',         href: '#' },
]

export default function Navigation() {
  const [scrolled, setScrolled] = useState(false)
  const [active, setActive] = useState('')
  const rafRef = useRef<number>(0)
  const lastY = useRef(0)

  useEffect(() => {
    const update = () => {
      const y = window.scrollY
      if (y !== lastY.current) {
        lastY.current = y
        setScrolled(y > 40)
      }
      rafRef.current = requestAnimationFrame(update)
    }
    rafRef.current = requestAnimationFrame(update)
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  // Track active section
  useEffect(() => {
    const sections = ['runtime', 'verified-execution', 'zero-trust', 'features', 'architecture']
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) setActive(e.target.id)
        })
      },
      { threshold: 0.3 }
    )
    sections.forEach((id) => {
      const el = document.getElementById(id)
      if (el) obs.observe(el)
    })
    return () => obs.disconnect()
  }, [])

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        scrolled ? 'nav-glass' : ''
      }`}
      role="navigation"
      aria-label="Main navigation"
    >
      <div className="max-w-[1400px] mx-auto px-6 md:px-10 h-14 flex items-center justify-between">
        {/* Logo */}
        <a
          href="#"
          className="flex items-center gap-2.5 group"
          aria-label="MCP Guard home"
        >
          <div className="relative">
            <Shield
              size={18}
              className="text-[#7CFF4F] transition-transform duration-300 group-hover:scale-110"
              strokeWidth={2.5}
              aria-hidden="true"
            />
            <div className="absolute inset-0 bg-[#7CFF4F] opacity-0 group-hover:opacity-20 rounded-full blur-md transition-opacity" />
          </div>
          <span
            className="text-xs font-bold tracking-[0.15em] text-white"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            MCP GUARD
          </span>
        </a>

        {/* Links — hidden on mobile */}
        <div className="hidden md:flex items-center gap-8">
          {NAV_LINKS.map((link) => {
            const isActive = active && link.href.includes(active)
            return (
              <a
                key={link.label}
                href={link.href}
                className={`label-tech transition-all duration-200 hover:text-white ${
                  isActive ? 'text-[#7CFF4F]' : 'text-[#5a6660]'
                }`}
              >
                {link.label}
                {isActive && (
                  <span className="block h-px bg-[#7CFF4F] mt-0.5 w-full opacity-60" />
                )}
              </a>
            )
          })}
        </div>

        {/* CTA */}
        <div className="flex items-center gap-3">
          <a
            href="#"
            className="hidden md:block label-tech text-[#5a6660] hover:text-white transition-colors"
          >
            SIGN IN
          </a>
          <a
            href="#"
            className="btn-primary text-xs py-2 px-4"
            aria-label="Get started with MCP Guard"
          >
            GET STARTED
            <ArrowUpRight size={12} aria-hidden="true" />
          </a>
        </div>
      </div>
    </nav>
  )
}
