import { useRef } from 'react'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useReducedMotion } from '../../hooks/useReducedMotion'

gsap.registerPlugin(ScrollTrigger)

// Tile layout — asymmetric mosaic grid mimicking the ROCKY broken-glass effect
// Each tile: [col, row, colSpan, rowSpan] in a 4×3 grid
// Varying sizes create the bento/shatter feel
const TILE_DEFS: Array<{
  col: number; row: number; colSpan: number; rowSpan: number;
  // GSAP animation offsets for the shatter
  dx: number; dy: number;
}> = [
  { col: 0, row: 0, colSpan: 2, rowSpan: 2, dx: -80, dy: -40 },
  { col: 2, row: 0, colSpan: 1, rowSpan: 1, dx: 60, dy: -60 },
  { col: 3, row: 0, colSpan: 1, rowSpan: 1, dx: 100, dy: -30 },
  { col: 2, row: 1, colSpan: 2, rowSpan: 1, dx: 80, dy: 50 },
  { col: 0, row: 2, colSpan: 1, rowSpan: 1, dx: -60, dy: 70 },
  { col: 1, row: 2, colSpan: 1, rowSpan: 1, dx: -20, dy: 80 },
  { col: 2, row: 2, colSpan: 1, rowSpan: 1, dx: 40, dy: 60 },
  { col: 3, row: 2, colSpan: 1, rowSpan: 1, dx: 90, dy: 40 },
]

const TOTAL_COLS = 4
const TOTAL_ROWS = 3
const GAP_PX = 3 // gap between tiles when shattered

export default function TileShatterSection() {
  const sectionRef = useRef<HTMLDivElement>(null)
  const pinContainerRef = useRef<HTMLDivElement>(null)
  const tilesRef = useRef<HTMLDivElement[]>([])
  const fragmentTextRef = useRef<HTMLDivElement>(null)
  const reducedMotion = useReducedMotion()

  useGSAP(() => {
    if (reducedMotion) return

    const tiles = tilesRef.current.filter(Boolean)
    if (!tiles.length) return

    // We use a pinned section with scrub — as user scrolls, tiles diverge then converge
    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: sectionRef.current,
        start: 'top top',
        end: '+=200%',
        scrub: 1.5,
        pin: true,
        anticipatePin: 1,
      },
    })

    // Phase 1 (0→0.5): tiles shatter apart, fragment text fades in
    tiles.forEach((tile, i) => {
      const def = TILE_DEFS[i]
      if (!def) return
      tl.to(tile, {
        x: def.dx,
        y: def.dy,
        duration: 0.5,
        ease: 'power2.inOut',
      }, 0)
    })

    // Fragment text fades in through the gaps
    tl.to(fragmentTextRef.current, {
      opacity: 1,
      duration: 0.2,
      ease: 'none',
    }, 0.25)

    // Phase 2 (0.5→1): tiles reconverge into the full scene
    tiles.forEach((tile) => {
      tl.to(tile, {
        x: 0,
        y: 0,
        duration: 0.5,
        ease: 'power2.inOut',
      }, 0.6)
    })

    tl.to(fragmentTextRef.current, {
      opacity: 0,
      duration: 0.15,
    }, 0.65)

    return () => {
      tl.kill()
    }
  }, { scope: sectionRef })

  // For reduced motion — just a simple fade between sections
  if (reducedMotion) {
    return (
      <div
        aria-label="Section transition"
        style={{
          background: 'linear-gradient(to bottom, #000, #FF7C56)',
          height: '60vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0 2.5rem',
        }}
      >
        <blockquote style={{
          fontFamily: 'var(--font-body)',
          fontSize: 'clamp(0.9rem, 2vw, 1.1rem)',
          color: '#fff',
          fontStyle: 'italic',
          maxWidth: '700px',
          textAlign: 'center',
          lineHeight: 1.8,
          opacity: 0.85,
        }}>
          "The model is not the security boundary. The policy layer, schema checks, authorization,
          and sandbox are."
        </blockquote>
      </div>
    )
  }

  return (
    <div ref={sectionRef} aria-label="Tile shatter transition" style={{ overflow: 'hidden' }}>
      <div
        ref={pinContainerRef}
        style={{
          position: 'relative',
          width: '100%',
          height: '100vh',
          overflow: 'hidden',
          // Background revealed through tile gaps: black → orange gradient
          background: 'linear-gradient(160deg, #000000 30%, #FF7C56 100%)',
        }}
      >
        {/* Tile mosaic */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            gridTemplateColumns: `repeat(${TOTAL_COLS}, 1fr)`,
            gridTemplateRows: `repeat(${TOTAL_ROWS}, 1fr)`,
            gap: `${GAP_PX}px`,
          }}
        >
          {TILE_DEFS.map((def, i) => (
            <div
              key={i}
              ref={el => { if (el) tilesRef.current[i] = el }}
              style={{
                gridColumn: `${def.col + 1} / span ${def.colSpan}`,
                gridRow: `${def.row + 1} / span ${def.rowSpan}`,
                // Dark angular rock scene — simulated via gradient + texture
                background: `
                  radial-gradient(ellipse at 40% 60%, #2a1505 0%, #0d0605 40%, #050203 100%)
                `,
                // Orange crack line overlay
                boxShadow: 'inset 0 0 60px rgba(254,110,68,0.08)',
                overflow: 'hidden',
                willChange: 'transform',
                transition: 'none',
              }}
            >
              {/* Simulated crack line per tile */}
              {i % 3 === 0 && (
                <div style={{
                  position: 'absolute',
                  top: '20%',
                  left: '30%',
                  width: '2px',
                  height: '60%',
                  background: 'linear-gradient(to bottom, transparent, #FE6E44, transparent)',
                  opacity: 0.7,
                  transform: 'rotate(15deg)',
                }} />
              )}
            </div>
          ))}
        </div>

        {/* Fragment text revealed through gaps */}
        <div
          ref={fragmentTextRef}
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2rem',
            opacity: 0,
            pointerEvents: 'none',
            zIndex: 10,
          }}
        >
          <blockquote
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 'clamp(0.9rem, 2.5vw, 1.25rem)',
              color: '#fff',
              fontStyle: 'italic',
              maxWidth: '640px',
              textAlign: 'center',
              lineHeight: 1.75,
              textShadow: '0 2px 20px rgba(0,0,0,0.8)',
            }}
          >
            "The model is not the security boundary. The policy layer, schema checks,
            authorization, and sandbox are."
          </blockquote>
        </div>
      </div>
    </div>
  )
}
