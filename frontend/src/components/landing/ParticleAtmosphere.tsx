import { useEffect, useRef } from 'react'

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  r: number
  opacity: number
  baseOpacity: number
  life: number
  maxLife: number
  glow: boolean
}

export type ParticleMode = 'hero' | 'defend' | 'runtime' | 'threat' | 'network' | 'tamper' | 'a2a' | 'final'

interface ParticleAtmosphereProps {
  mode?: ParticleMode
  mouseX?: number
  mouseY?: number
}

// Reduced counts — enough to look good, not enough to thrash the CPU
const PARTICLE_COUNT_DESKTOP = 70  // was 120
const PARTICLE_COUNT_MOBILE = 30   // was 50

// Cap DPR at 1.5 — no visual difference at 2x vs 1.5x for particles
const MAX_DPR = 1.5

export default function ParticleAtmosphere({
  mode = 'hero',
  mouseX = 0.5,
  mouseY = 0.5,
}: ParticleAtmosphereProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const particlesRef = useRef<Particle[]>([])
  const rafRef = useRef<number>(0)
  const modeRef = useRef<ParticleMode>(mode)
  const pausedRef = useRef(false)

  useEffect(() => {
    modeRef.current = mode
  }, [mode])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const isMobile = window.innerWidth < 768
    const COUNT = isMobile ? PARTICLE_COUNT_MOBILE : PARTICLE_COUNT_DESKTOP
    // Capped DPR — retina at 2x gives 4x pixels, 1.5x is imperceptible difference
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR)

    const resize = () => {
      canvas.width = window.innerWidth * dpr
      canvas.height = window.innerHeight * dpr
      canvas.style.width = `${window.innerWidth}px`
      canvas.style.height = `${window.innerHeight}px`
    }
    resize()

    // Debounced resize — avoid re-triggering every pixel during window drag
    let resizeTimer: ReturnType<typeof setTimeout>
    const onResize = () => {
      clearTimeout(resizeTimer)
      resizeTimer = setTimeout(resize, 150)
    }
    window.addEventListener('resize', onResize)

    // Pause when tab is hidden, resume when visible
    const onVisibility = () => {
      pausedRef.current = document.hidden
      if (!document.hidden && rafRef.current === 0) {
        rafRef.current = requestAnimationFrame(draw)
      }
    }
    document.addEventListener('visibilitychange', onVisibility)

    // Init particles
    particlesRef.current = Array.from({ length: COUNT }, () => spawnParticle(canvas, dpr))

    let frameId = 0
    const draw = (time: number) => {
      if (pausedRef.current) {
        rafRef.current = 0
        return
      }

      const W = canvas.width
      const H = canvas.height
      const m = modeRef.current

      ctx.clearRect(0, 0, W, H)

      let baseColor = '124,255,79'
      if (m === 'threat') baseColor = '255,92,92'
      else if (m === 'tamper') baseColor = '245,184,75'

      particlesRef.current.forEach((p) => {
        const targetX = mouseX * W
        const targetY = mouseY * H
        const dx = targetX - p.x
        const dy = targetY - p.y
        const dist = Math.sqrt(dx * dx + dy * dy)

        let speedMul = 1
        if (m === 'threat') speedMul = 2.5
        else if (m === 'final') speedMul = 0.3

        if (dist < 200 * dpr && m !== 'threat') {
          p.vx += (dx / dist) * 0.008
          p.vy += (dy / dist) * 0.008
        }

        if (m === 'threat') {
          const cx = W / 2, cy = H / 2
          const ddx = p.x - cx, ddy = p.y - cy
          const d2 = Math.sqrt(ddx * ddx + ddy * ddy) + 1
          p.vx += (ddx / d2) * 0.05
          p.vy += (ddy / d2) * 0.05
        } else if (m === 'final' || m === 'hero') {
          const cx = W / 2, cy = H / 2
          const ddx = cx - p.x, ddy = cy - p.y
          const d2 = Math.sqrt(ddx * ddx + ddy * ddy) + 1
          p.vx += (ddx / d2) * 0.006
          p.vy += (ddy / d2) * 0.006
        }

        p.vx *= 0.97
        p.vy *= 0.97
        p.vx += (Math.random() - 0.5) * 0.02
        p.vy += (Math.random() - 0.5) * 0.02 - 0.01 * speedMul
        p.x += p.vx * speedMul
        p.y += p.vy * speedMul
        p.life += 1

        const lifeRatio = p.life / p.maxLife
        let alpha = p.baseOpacity * Math.sin(lifeRatio * Math.PI)
        alpha *= 0.5 + 0.5 * Math.sin(time * 0.001 + p.life * 0.05)

        if (
          p.life >= p.maxLife ||
          p.x < -20 * dpr || p.x > W + 20 * dpr ||
          p.y < -20 * dpr || p.y > H + 20 * dpr
        ) {
          Object.assign(p, spawnParticle(canvas, dpr))
          return
        }

        ctx.save()
        ctx.globalAlpha = Math.max(0, Math.min(1, alpha))

        if (p.glow) {
          ctx.shadowColor = `rgb(${baseColor})`
          ctx.shadowBlur = p.r * 3 * dpr
        }

        ctx.fillStyle = `rgba(${baseColor},1)`
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r * dpr, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      })

      frameId = requestAnimationFrame(draw)
      rafRef.current = frameId
    }

    // Defer canvas start by one frame to avoid blocking LCP paint
    const startTimer = requestAnimationFrame(() => {
      frameId = requestAnimationFrame(draw)
      rafRef.current = frameId
    })

    return () => {
      cancelAnimationFrame(startTimer)
      cancelAnimationFrame(frameId)
      clearTimeout(resizeTimer)
      window.removeEventListener('resize', onResize)
      document.removeEventListener('visibilitychange', onVisibility)
      rafRef.current = 0
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        pointerEvents: 'none',
        zIndex: 0,
        opacity: 0.7,
        // Promote to its own compositor layer — keeps particle paint off main content layer
        willChange: 'transform',
        transform: 'translateZ(0)',
      }}
    />
  )
}

function spawnParticle(canvas: HTMLCanvasElement, _dpr: number): Particle {
  const W = canvas.width
  const H = canvas.height
  const angle = Math.random() * Math.PI * 2
  const radius = Math.random() * Math.min(W, H) * 0.4
  return {
    x: W / 2 + Math.cos(angle) * radius + (Math.random() - 0.5) * W * 0.3,
    y: H / 2 + Math.sin(angle) * radius + (Math.random() - 0.5) * H * 0.3,
    vx: (Math.random() - 0.5) * 0.5,
    vy: (Math.random() - 0.5) * 0.5 - 0.2,
    r: 0.5 + Math.random() * 1.5,
    opacity: 0,
    baseOpacity: 0.2 + Math.random() * 0.6,
    life: 0,
    maxLife: 200 + Math.random() * 400,
    glow: Math.random() < 0.25, // fewer glow particles = fewer shadow draws
  }
}
