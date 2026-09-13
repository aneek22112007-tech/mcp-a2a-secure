import { useEffect, useRef, useState } from 'react'
import { Menu, X } from 'lucide-react'
import { useUIStore } from '../../store/uiStore'

const NAV_LINKS = [
  { label: 'Protocol', href: '#protocol' },
  { label: 'Scanner', href: '#scanner' },
  { label: 'Architecture', href: '#architecture' },
  { label: 'Docs', href: '#docs' },
]

export default function Nav() {
  const navRef = useRef<HTMLElement>(null)
  const [scrolled, setScrolled] = useState(false)
  const { navOpen, setNavOpen } = useUIStore()

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      ref={navRef}
      role="banner"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        padding: '1.25rem 2.5rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        transition: 'background 0.3s',
        background: scrolled ? 'rgba(0,0,0,0.85)' : 'transparent',
        backdropFilter: scrolled ? 'blur(12px)' : 'none',
        borderBottom: scrolled ? '1px solid rgba(255,255,255,0.06)' : 'none',
      }}
    >
      {/* Logo / Wordmark */}
      <a
        href="#"
        aria-label="MCP·A2A home"
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: '1rem',
          fontWeight: 700,
          letterSpacing: '0.08em',
          color: '#fff',
          textDecoration: 'none',
        }}
      >
        MCP·A2A
      </a>

      {/* Desktop nav links */}
      <nav
        aria-label="Primary navigation"
        style={{
          display: 'flex',
          gap: '2.5rem',
          alignItems: 'center',
        }}
        className="desktop-nav"
      >
        {NAV_LINKS.map((link) => (
          <a
            key={link.label}
            href={link.href}
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '0.7rem',
              fontWeight: 500,
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.75)',
              textDecoration: 'none',
              transition: 'color 0.2s',
            }}
            onMouseEnter={e => ((e.target as HTMLElement).style.color = '#fff')}
            onMouseLeave={e => ((e.target as HTMLElement).style.color = 'rgba(255,255,255,0.75)')}
          >
            {link.label}
          </a>
        ))}

        <a
          href="https://github.com"
          target="_blank"
          rel="noopener noreferrer"
          className="pill-outline"
          aria-label="View on GitHub"
          style={{ fontSize: '0.65rem', padding: '0.5rem 1.25rem' }}
        >
          GitHub
        </a>
      </nav>

      {/* Mobile hamburger */}
      <button
        aria-label={navOpen ? 'Close menu' : 'Open menu'}
        aria-expanded={navOpen}
        onClick={() => setNavOpen(!navOpen)}
        style={{
          display: 'none',
          background: 'none',
          border: 'none',
          color: '#fff',
          cursor: 'pointer',
          padding: '0.25rem',
        }}
        className="mobile-menu-btn"
      >
        {navOpen ? <X size={22} /> : <Menu size={22} />}
      </button>

      {/* Mobile nav drawer */}
      {navOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Mobile navigation"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.96)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '2rem',
            zIndex: 99,
          }}
        >
          <button
            aria-label="Close menu"
            onClick={() => setNavOpen(false)}
            style={{
              position: 'absolute',
              top: '1.5rem',
              right: '2.5rem',
              background: 'none',
              border: 'none',
              color: '#fff',
              cursor: 'pointer',
            }}
          >
            <X size={24} />
          </button>
          {NAV_LINKS.map((link) => (
            <a
              key={link.label}
              href={link.href}
              onClick={() => setNavOpen(false)}
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '1.5rem',
                fontWeight: 700,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: '#fff',
                textDecoration: 'none',
              }}
            >
              {link.label}
            </a>
          ))}
          <a href="https://github.com" target="_blank" rel="noopener noreferrer" className="pill-outline">
            GitHub
          </a>
        </div>
      )}

      <style>{`
        @media (max-width: 768px) {
          .desktop-nav { display: none !important; }
          .mobile-menu-btn { display: flex !important; }
        }
      `}</style>
    </header>
  )
}
