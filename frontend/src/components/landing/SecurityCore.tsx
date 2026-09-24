import { useEffect, useRef } from 'react'

export type CoreState =
  | 'hero' | 'defend' | 'runtime' | 'execution' | 'zeroTrust'
  | 'threat' | 'features' | 'network' | 'tamper' | 'scanner'
  | 'a2a' | 'observability' | 'preview' | 'architecture' | 'final'

interface CoreConfig {
  x: number        // % from center (-50 to 50)
  y: number        // % from center
  scale: number
  rotate: number   // degrees
  glow: number     // 0-1
  brightness: number
  borderRadius: number // px
  opacity: number
}

const STATE_CONFIGS: Record<CoreState, CoreConfig> = {
  hero:          { x: 0,    y: 0,    scale: 1,    rotate: 0,   glow: 1,   brightness: 1,    borderRadius: 24, opacity: 1    },
  defend:        { x: -28,  y: 8,    scale: 0.85, rotate: -8,  glow: 0.7, brightness: 0.9,  borderRadius: 24, opacity: 0.95 },
  runtime:       { x: 25,   y: 5,    scale: 0.75, rotate: 12,  glow: 0.8, brightness: 0.95, borderRadius: 24, opacity: 0.9  },
  execution:     { x: 30,   y: -5,   scale: 0.65, rotate: 15,  glow: 0.9, brightness: 1,    borderRadius: 20, opacity: 0.85 },
  zeroTrust:     { x: 0,    y: 0,    scale: 1.1,  rotate: 0,   glow: 1,   brightness: 0.8,  borderRadius: 32, opacity: 0.9  },
  threat:        { x: 5,    y: 3,    scale: 0.9,  rotate: 5,   glow: 0.3, brightness: 0.6,  borderRadius: 24, opacity: 0.7  },
  features:      { x: -30,  y: 0,    scale: 1.3,  rotate: -15, glow: 0.6, brightness: 0.85, borderRadius: 16, opacity: 0.8  },
  network:       { x: 20,   y: -10,  scale: 0.7,  rotate: 20,  glow: 0.9, brightness: 1,    borderRadius: 24, opacity: 0.85 },
  tamper:        { x: -15,  y: 5,    scale: 0.8,  rotate: -10, glow: 0.4, brightness: 0.7,  borderRadius: 24, opacity: 0.75 },
  scanner:       { x: 25,   y: 10,   scale: 0.72, rotate: 18,  glow: 0.8, brightness: 0.95, borderRadius: 24, opacity: 0.8  },
  a2a:           { x: -20,  y: -8,   scale: 0.78, rotate: -12, glow: 1,   brightness: 1,    borderRadius: 28, opacity: 0.9  },
  observability: { x: 22,   y: 5,    scale: 0.68, rotate: 22,  glow: 0.85,brightness: 0.95, borderRadius: 24, opacity: 0.8  },
  preview:       { x: -35,  y: 0,    scale: 1.2,  rotate: -5,  glow: 0.7, brightness: 0.9,  borderRadius: 20, opacity: 0.75 },
  architecture:  { x: 30,   y: -5,   scale: 0.7,  rotate: 25,  glow: 0.8, brightness: 1,    borderRadius: 24, opacity: 0.85 },
  final:         { x: 0,    y: 0,    scale: 1,    rotate: 0,   glow: 1,   brightness: 1,    borderRadius: 24, opacity: 1    },
}

interface SecurityCoreProps {
  state: CoreState
  scrollProgress: number
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

// Cap DPR for SecurityCore canvas — retina at 1.5x is visually identical at this scale
const MAX_DPR = 1.5

export default function SecurityCore({ state, scrollProgress }: SecurityCoreProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const currentConfig = useRef<CoreConfig>(STATE_CONFIGS.hero)
  const rafRef = useRef<number>(0)
  const timeRef = useRef<number>(0)
  const pausedRef = useRef(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR)

    const resize = () => {
      canvas.width = canvas.offsetWidth * dpr
      canvas.height = canvas.offsetHeight * dpr
    }
    resize()

    let resizeTimer: ReturnType<typeof setTimeout>
    const onResize = () => {
      clearTimeout(resizeTimer)
      resizeTimer = setTimeout(resize, 150)
    }
    window.addEventListener('resize', onResize)

    // Pause rendering when tab is not visible
    const onVisibility = () => {
      pausedRef.current = document.hidden
      if (!document.hidden && rafRef.current === 0) {
        rafRef.current = requestAnimationFrame(draw)
      }
    }
    document.addEventListener('visibilitychange', onVisibility)

    const target = STATE_CONFIGS[state]
    let frameId: number

    const draw = (time: number) => {
      if (pausedRef.current) {
        rafRef.current = 0
        return
      }
      timeRef.current = time * 0.001
      const t = timeRef.current

      // Lerp to target config
      const c = currentConfig.current
      c.x          = lerp(c.x,          target.x,          0.04)
      c.y          = lerp(c.y,          target.y,          0.04)
      c.scale      = lerp(c.scale,      target.scale,      0.04)
      c.rotate     = lerp(c.rotate,     target.rotate,     0.04)
      c.glow       = lerp(c.glow,       target.glow,       0.04)
      c.brightness = lerp(c.brightness, target.brightness, 0.04)
      c.opacity    = lerp(c.opacity,    target.opacity,    0.04)
      c.borderRadius = lerp(c.borderRadius, target.borderRadius, 0.04)

      const W = canvas.width
      const H = canvas.height

      ctx.clearRect(0, 0, W, H)

      // Core center position
      const cx = W / 2 + (c.x / 100) * W
      const cy = H / 2 + (c.y / 100) * H

      // Base size — ~50% of shorter dimension
      const baseSize = Math.min(W, H) * 0.45 * c.scale

      ctx.save()
      ctx.translate(cx, cy)
      ctx.rotate((c.rotate * Math.PI) / 180)
      ctx.globalAlpha = c.opacity

      // === AMBIENT GLOW ===
      const glowRadius = baseSize * 1.8
      const grd = ctx.createRadialGradient(0, 0, 0, 0, 0, glowRadius)
      grd.addColorStop(0, `rgba(124,255,79,${0.08 * c.glow})`)
      grd.addColorStop(0.4, `rgba(53,217,107,${0.04 * c.glow})`)
      grd.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = grd
      ctx.beginPath()
      ctx.arc(0, 0, glowRadius, 0, Math.PI * 2)
      ctx.fill()

      // === OUTER ROTATING RING ===
      const ringAngle = t * 0.3
      ctx.save()
      ctx.rotate(ringAngle)
      ctx.strokeStyle = `rgba(124,255,79,${0.15 * c.glow})`
      ctx.lineWidth = 1 * dpr
      ctx.setLineDash([4 * dpr, 12 * dpr])
      ctx.beginPath()
      ctx.arc(0, 0, baseSize * 1.12, 0, Math.PI * 2)
      ctx.stroke()
      ctx.restore()

      // === MAIN ANGULAR BODY ===
      // The body is a stack of angular faceted polygons — inspired by reference frame objects
      const drawFaceted = (size: number, color: string, alpha: number) => {
        ctx.save()
        ctx.globalAlpha = alpha * c.opacity
        ctx.fillStyle = color
        ctx.shadowColor = `rgba(124,255,79,${0.4 * c.glow})`
        ctx.shadowBlur = 30 * dpr

        // Main hexagonal-ish shape with angular cuts
        ctx.beginPath()
        const pts = [
          [0,         -size      ],
          [size*0.6,  -size*0.35 ],
          [size*0.85,  size*0.2  ],
          [size*0.5,   size*0.8  ],
          [-size*0.3,  size*0.85 ],
          [-size*0.8,  size*0.3  ],
          [-size*0.75, -size*0.4 ],
          [-size*0.3,  -size*0.9 ],
        ]
        ctx.moveTo(pts[0][0], pts[0][1])
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1])
        ctx.closePath()
        ctx.fill()
        ctx.restore()
      }

      // Back layer (darker)
      drawFaceted(baseSize, '#070f09', 0.95)

      // Mid layer with slight offset
      ctx.save()
      ctx.translate(baseSize * 0.05, -baseSize * 0.03)
      ctx.rotate(0.05)
      drawFaceted(baseSize * 0.9, '#0a1a0d', 0.8)
      ctx.restore()

      // === SURFACE FACETS (angular face highlights) ===
      const drawFacet = (x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, bright: number) => {
        ctx.save()
        ctx.globalAlpha = bright * c.opacity * c.brightness
        const facetGrad = ctx.createLinearGradient(x1, y1, x3, y3)
        facetGrad.addColorStop(0, `rgba(124,255,79,${0.12 * c.glow})`)
        facetGrad.addColorStop(1, `rgba(20,40,22,0.6)`)
        ctx.fillStyle = facetGrad
        ctx.strokeStyle = `rgba(124,255,79,${0.25 * c.glow})`
        ctx.lineWidth = 0.8 * dpr
        ctx.beginPath()
        ctx.moveTo(x1, y1)
        ctx.lineTo(x2, y2)
        ctx.lineTo(x3, y3)
        ctx.closePath()
        ctx.fill()
        ctx.stroke()
        ctx.restore()
      }

      const s = baseSize
      // Top-right facet
      drawFacet(0, -s, s*0.6, -s*0.35, s*0.1, -s*0.3, 0.8)
      // Right facet
      drawFacet(s*0.6, -s*0.35, s*0.85, s*0.2, s*0.3, 0.1, 0.5)
      // Bottom-right facet
      drawFacet(s*0.85, s*0.2, s*0.5, s*0.8, s*0.15, s*0.3, 0.4)
      // Top-left facet
      drawFacet(0, -s, -s*0.3, -s*0.9, -s*0.05, -s*0.4, 0.6)
      // Left facet
      drawFacet(-s*0.75, -s*0.4, -s*0.8, s*0.3, -s*0.2, 0, 0.45)

      // === INNER CORE GLOW ===
      const innerGrd = ctx.createRadialGradient(s*0.05, -s*0.1, 0, 0, 0, s*0.6)
      innerGrd.addColorStop(0, `rgba(124,255,79,${0.18 * c.glow})`)
      innerGrd.addColorStop(0.5, `rgba(53,217,107,${0.05 * c.glow})`)
      innerGrd.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = innerGrd
      ctx.beginPath()
      ctx.arc(s*0.05, -s*0.1, s*0.6, 0, Math.PI*2)
      ctx.fill()

      // === GREEN EDGE LINES ===
      ctx.save()
      ctx.globalAlpha = 0.6 * c.glow * c.opacity
      ctx.strokeStyle = '#7CFF4F'
      ctx.lineWidth = 1.5 * dpr
      ctx.shadowColor = '#7CFF4F'
      ctx.shadowBlur = 8 * dpr

      // Top edge highlight
      ctx.beginPath()
      ctx.moveTo(0, -s)
      ctx.lineTo(s*0.6, -s*0.35)
      ctx.stroke()

      // Left top edge
      ctx.beginPath()
      ctx.moveTo(0, -s)
      ctx.lineTo(-s*0.3, -s*0.9)
      ctx.stroke()
      ctx.restore()

      // === INNER SECURITY GRID LINES ===
      ctx.save()
      ctx.globalAlpha = 0.12 * c.glow * c.opacity
      ctx.strokeStyle = '#7CFF4F'
      ctx.lineWidth = 0.5 * dpr

      // Clip to body shape
      ctx.beginPath()
      const bpts = [
        [0, -s], [s*0.6, -s*0.35], [s*0.85, s*0.2],
        [s*0.5, s*0.8], [-s*0.3, s*0.85], [-s*0.8, s*0.3],
        [-s*0.75, -s*0.4], [-s*0.3, -s*0.9]
      ]
      ctx.moveTo(bpts[0][0], bpts[0][1])
      for (let i = 1; i < bpts.length; i++) ctx.lineTo(bpts[i][0], bpts[i][1])
      ctx.closePath()
      ctx.clip()

      // Grid lines
      for (let i = -3; i <= 3; i++) {
        ctx.beginPath()
        ctx.moveTo(i * s * 0.35, -s)
        ctx.lineTo(i * s * 0.35, s)
        ctx.stroke()
      }
      for (let i = -3; i <= 3; i++) {
        ctx.beginPath()
        ctx.moveTo(-s, i * s * 0.35)
        ctx.lineTo(s, i * s * 0.35)
        ctx.stroke()
      }
      ctx.restore()

      // === ANIMATED SIGNAL DOTS ===
      const numDots = 3
      for (let i = 0; i < numDots; i++) {
        const phase = (t * 0.5 + i / numDots) % 1
        const angle = (i * Math.PI * 2) / numDots + t * 0.2
        const r = baseSize * (0.3 + phase * 0.5)
        const dx = Math.cos(angle) * r
        const dy = Math.sin(angle) * r
        const dotAlpha = Math.sin(phase * Math.PI) * 0.8 * c.glow * c.opacity

        ctx.save()
        ctx.globalAlpha = dotAlpha
        ctx.fillStyle = '#7CFF4F'
        ctx.shadowColor = '#7CFF4F'
        ctx.shadowBlur = 6 * dpr
        ctx.beginPath()
        ctx.arc(dx, dy, 2 * dpr, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      }

      // === CORNER BRACKETS ===
      ctx.save()
      ctx.globalAlpha = 0.4 * c.glow * c.opacity
      ctx.strokeStyle = '#7CFF4F'
      ctx.lineWidth = 1.5 * dpr
      const bSize = baseSize * 0.08
      const positions = [
        [-s*0.55, -s*0.65],
        [ s*0.55, -s*0.65],
        [-s*0.55,  s*0.65],
        [ s*0.55,  s*0.65],
      ]
      const corners = [
        [[1, 0], [0, 1]],
        [[-1, 0], [0, 1]],
        [[1, 0], [0, -1]],
        [[-1, 0], [0, -1]],
      ]
      positions.forEach(([px, py], idx) => {
        const [[dx1], [, dy2]] = corners[idx]
        ctx.beginPath()
        ctx.moveTo(px + dx1 * bSize, py)
        ctx.lineTo(px, py)
        ctx.lineTo(px, py + dy2 * bSize)
        ctx.stroke()
      })
      ctx.restore()

      ctx.restore() // main translate/rotate

      frameId = requestAnimationFrame(draw)
    }

    frameId = requestAnimationFrame(draw)
    rafRef.current = frameId

    return () => {
      cancelAnimationFrame(frameId)
      clearTimeout(resizeTimer)
      window.removeEventListener('resize', onResize)
      document.removeEventListener('visibilitychange', onVisibility)
      rafRef.current = 0
    }
  }, [state])

  // Void scroll progress (used to drive external effects via CSS vars if needed)
  void scrollProgress

  return (
    <div
      ref={containerRef}
      className="core-wrapper"
      aria-hidden="true"
    >
      <canvas
        ref={canvasRef}
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
        }}
      />
    </div>
  )
}
