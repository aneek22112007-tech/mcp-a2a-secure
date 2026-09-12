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

const PARTICLE_COUNT_DESKTOP = 120
const PARTICLE_COUNT_MOBILE = 50

export default function ParticleAtmosphere({
  mode = 'hero',
  mouseX = 0.5,
  mouseY = 0.5,
}: ParticleAtmosphereProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const particlesRef = useRef<Particle[]>([])
  const rafRef = useRef<number>(0)
  const modeRef = useRef<ParticleMode>(mode)

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

    const resize = () => {
      canvas.width = window.innerWidth * window.devicePixelRatio
      canvas.height = window.innerHeight * window.devicePixelRatio
      canvas.style.width = `${window.innerWidth}px`
      canvas.style.height = `${window.innerHeight}px`
    }
    resize()
    window.addEventListener('resize', resize)

    // Init particles
    const initParticles = () => {
      particlesRef.current = Array.from({ length: COUNT }, () => spawnParticle(canvas))
    }
    initParticles()

    let frameId: number
    const draw = (time: number) => {
      const W = canvas.width
      const H = canvas.height
      const dpr = window.devicePixelRatio || 1
      const m = modeRef.current

      ctx.clearRect(0, 0, W, H)

      // Mode-based color
      let baseColor = '124,255,79'
      if (m === 'threat') baseColor = '255,92,92'
      else if (m === 'tamper') baseColor = '245,184,75'

      particlesRef.current.forEach((p) => {
        // Mouse influence (subtle)
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

        // Mode behavior
        if (m === 'threat') {
          // Disperse outward from center
          const cx = W / 2, cy = H / 2
          const ddx = p.x - cx, ddy = p.y - cy
          const d2 = Math.sqrt(ddx * ddx + ddy * ddy) + 1
          p.vx += (ddx / d2) * 0.05
          p.vy += (ddy / d2) * 0.05
        } else if (m === 'final' || m === 'hero') {
          // Attract toward center
          const cx = W / 2, cy = H / 2
          const ddx = cx - p.x, ddy = cy - p.y
          const d2 = Math.sqrt(ddx * ddx + ddy * ddy) + 1
          p.vx += (ddx / d2) * 0.006
          p.vy += (ddy / d2) * 0.006
        }

        // Dampen
        p.vx *= 0.97
        p.vy *= 0.97

        // Add gentle drift
        p.vx += (Math.random() - 0.5) * 0.02
        p.vy += (Math.random() - 0.5) * 0.02 - 0.01 * speedMul

        p.x += p.vx * speedMul
        p.y += p.vy * speedMul

        // Life
        p.life += 1
        const lifeRatio = p.life / p.maxLife
        let alpha = p.baseOpacity * Math.sin(lifeRatio * Math.PI)

        // Pulse
        alpha *= 0.5 + 0.5 * Math.sin(time * 0.001 + p.life * 0.05)

        // Respawn if out of bounds or life done
        if (
          p.life >= p.maxLife ||
          p.x < -20 * dpr || p.x > W + 20 * dpr ||
          p.y < -20 * dpr || p.y > H + 20 * dpr
        ) {
          Object.assign(p, spawnParticle(canvas))
          return
        }

        // Draw
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
    }

    frameId = requestAnimationFrame(draw)
    rafRef.current = frameId

    return () => {
      cancelAnimationFrame(frameId)
      window.removeEventListener('resize', resize)
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
      }}
    />
  )
}

function spawnParticle(canvas: HTMLCanvasElement): Particle {
  const W = canvas.width
  const H = canvas.height

  // Spawn at center-ish with random offset
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
    glow: Math.random() < 0.3,
  }
}
