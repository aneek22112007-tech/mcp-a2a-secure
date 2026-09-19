import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { useScroll } from 'framer-motion'

const STAGES = [
  { label: 'First Connect', detail: 'Canonicalize schema' },
  { label: 'Fingerprint', detail: 'SHA-256 hash' },
  { label: 'Baseline', detail: 'server_id + tool_name + hash + version' },
  { label: 'Later Call', detail: 'Re-canonicalize' },
  { label: 'Compare', detail: 'Hash + version policy' },
  { label: 'Decision', detail: 'Allow / re-review / refuse' }
]

const ACCENT = 0xfe6e44
const ACCENT_HOT = 0xff7c56
const ACCENT_COOL = 0x6e7bff
const RADIUS = 3.2
const TILT = 0.6

function makeGlowTexture() {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return new THREE.Texture()
  const gradient = ctx.createRadialGradient(
    size / 2, size / 2, 0,
    size / 2, size / 2, size / 2
  )
  gradient.addColorStop(0, 'rgba(255,255,255,1)')
  gradient.addColorStop(0.3, 'rgba(255,180,140,0.6)')
  gradient.addColorStop(1, 'rgba(255,120,80,0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)
  return new THREE.CanvasTexture(canvas)
}

function stagePosition(index: number, total: number, spin: number) {
  const angle = (index / total) * Math.PI * 2 + spin
  const x = Math.cos(angle) * RADIUS
  const z = Math.sin(angle) * RADIUS
  const y = Math.sin(angle * 2) * TILT
  return new THREE.Vector3(x, y, z)
}

export default function TamperDetectionSection() {
  const sectionRef = useRef<HTMLElement>(null)
  const mountRef = useRef<HTMLDivElement>(null)
  const labelRefs = useRef<(HTMLDivElement | null)[]>([])
  
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start center', 'end center']
  })

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return
    const width = mount.clientWidth
    const height = mount.clientHeight

    // ---------------- Scene setup ----------------
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100)
    camera.position.set(0, 0.8, 8.5)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setSize(width, height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    mount.appendChild(renderer.domElement)

    // ---------------- Lights ----------------
    scene.add(new THREE.AmbientLight(0xffffff, 0.25))
    const pLight1 = new THREE.PointLight(ACCENT_HOT, 1.4, 20)
    pLight1.position.set(4, 4, 4)
    scene.add(pLight1)
    const pLight2 = new THREE.PointLight(ACCENT_COOL, 0.7, 20)
    pLight2.position.set(-4, -2, -4)
    scene.add(pLight2)

    // ---------------- Core ----------------
    const coreGroup = new THREE.Group()
    const coreGeo = new THREE.IcosahedronGeometry(0.9, 1)
    const coreMat = new THREE.MeshStandardMaterial({
      color: 0x0a0a0b,
      emissive: ACCENT,
      emissiveIntensity: 0.6,
      roughness: 0.35,
      metalness: 0.4,
      flatShading: true,
    })
    const coreMesh = new THREE.Mesh(coreGeo, coreMat)
    coreGroup.add(coreMesh)

    const wireGeo = new THREE.IcosahedronGeometry(0.915, 1)
    const wireMat = new THREE.MeshBasicMaterial({
      color: ACCENT_HOT,
      wireframe: true,
      transparent: true,
      opacity: 0.5,
    })
    coreGroup.add(new THREE.Mesh(wireGeo, wireMat))
    scene.add(coreGroup)

    const glowTexture = makeGlowTexture()
    const coreGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture,
        color: ACCENT_HOT,
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    )
    coreGlow.scale.set(4, 4, 1)
    scene.add(coreGlow)

    // ---------------- Orbit nodes + connector lines ----------------
    const nodeMeshes: THREE.Mesh[] = []
    const nodeGlows: THREE.Sprite[] = []
    const lineObjects: THREE.Line[] = []

    STAGES.forEach(() => {
      const nodeGeo = new THREE.OctahedronGeometry(0.26, 0)
      const nodeMat = new THREE.MeshStandardMaterial({
        color: 0x141414,
        emissive: ACCENT_HOT,
        emissiveIntensity: 0.4,
        roughness: 0.3,
        metalness: 0.5,
      })
      const mesh = new THREE.Mesh(nodeGeo, nodeMat)
      scene.add(mesh)
      nodeMeshes.push(mesh)

      const glow = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: glowTexture,
          color: ACCENT_HOT,
          transparent: true,
          opacity: 0.25,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      )
      glow.scale.set(1.2, 1.2, 1)
      scene.add(glow)
      nodeGlows.push(glow)

      const lineGeo = new THREE.BufferGeometry()
      const lineMat = new THREE.LineBasicMaterial({
        color: ACCENT,
        transparent: true,
        opacity: 0.55,
      })
      const line = new THREE.Line(lineGeo, lineMat)
      scene.add(line)
      lineObjects.push(line)
    })

    // ---------------- Pointer parallax ----------------
    const pointer = { x: 0, y: 0 }
    function onPointerMove(e: PointerEvent) {
      const rect = mount!.getBoundingClientRect()
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -(((e.clientY - rect.top) / rect.height) * 2 - 1)
    }
    mount.addEventListener('pointermove', onPointerMove as EventListener)

    // ---------------- Resize handling ----------------
    function onResize() {
      const w = mount!.clientWidth
      const h = mount!.clientHeight
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    }
    window.addEventListener('resize', onResize)

    // ---------------- Animation loop ----------------
    let raf: number
    const activeStrengths = new Array(STAGES.length).fill(0.15)
    let currentScroll = 0
    
    // Subscribe to scroll progress
    const unsubscribeScroll = scrollYProgress.on("change", (v) => {
      currentScroll = v
    })

    const clock = new THREE.Clock()
    const camTarget = new THREE.Vector3(0, 0.8, 8.5)

    function animate() {
      raf = requestAnimationFrame(animate)
      const elapsed = clock.getElapsedTime()
      
      // Let spin continue over time so it feels alive
      const spin = elapsed * 0.18

      coreGroup.rotation.y += 0.006
      coreGroup.rotation.x += 0.002
      coreGlow.position.set(0, 0, 0)

      // use scroll progress to determine active stage
      // mapped 0..1 to 0..(STAGES.length - 1)
      const activeFloat = Math.max(0, Math.min(STAGES.length - 1, currentScroll * STAGES.length))
      
      // we can optionally keep time-based animation for preview, 
      // but if the user scrolls, it will snap to the scroll position
      let activeIndex = Math.floor(activeFloat)
      if (currentScroll === 0) {
        // Fallback to time-based if not scrolled into view yet (or if they prefer the auto-cycle)
        activeIndex = Math.floor((elapsed * 1000) / 2200) % STAGES.length
      }

      STAGES.forEach((_, i) => {
        const pos = stagePosition(i, STAGES.length, spin)
        nodeMeshes[i].position.copy(pos)
        nodeGlows[i].position.copy(pos)

        const mid = pos.clone().multiplyScalar(0.5).add(new THREE.Vector3(0, 0.7, 0))
        const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0, 0), mid, pos)
        const pts = curve.getPoints(20)
        lineObjects[i].geometry.setFromPoints(pts)

        const target = i === activeIndex ? 1 : 0.15
        activeStrengths[i] += (target - activeStrengths[i]) * 0.06
        const s = 1 + activeStrengths[i] * 0.7
        nodeMeshes[i].scale.setScalar(s)
        nodeMeshes[i].material.emissiveIntensity = 0.4 + activeStrengths[i] * 2.2
        nodeGlows[i].scale.setScalar(1.1 + activeStrengths[i] * 1.6)
        nodeGlows[i].material.opacity = 0.2 + activeStrengths[i] * 0.6

        // project to screen space for the HTML label overlay
        const projected = pos.clone().project(camera)
        const screenX = (projected.x * 0.5 + 0.5) * mount!.clientWidth
        const screenY = (-projected.y * 0.5 + 0.5) * mount!.clientHeight
        const labelEl = labelRefs.current[i]
        if (labelEl) {
          labelEl.style.transform = `translate(-50%, 10px) translate(${screenX}px, ${screenY}px)`
          labelEl.style.opacity = String(0.55 + activeStrengths[i] * 0.45)
        }
      })

      // gentle camera parallax toward pointer
      camTarget.x = pointer.x * 0.9
      camTarget.y = 0.8 + pointer.y * 0.5
      camera.position.lerp(new THREE.Vector3(camTarget.x, camTarget.y, 8.5), 0.05)
      camera.lookAt(0, 0, 0)

      renderer.render(scene, camera)
    }
    animate()

    // ---------------- Cleanup ----------------
    return () => {
      unsubscribeScroll()
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      mount.removeEventListener('pointermove', onPointerMove as EventListener)
      ;[coreGeo, wireGeo, ...nodeMeshes.map(m => m.geometry)].forEach(g => g.dispose())
      // @ts-ignore
      ;[coreMat, wireMat, ...nodeMeshes.map(m => m.material)].forEach(m => m.dispose())
      lineObjects.forEach(l => {
        l.geometry.dispose()
        // @ts-ignore
        l.material.dispose()
      })
      glowTexture.dispose()
      renderer.dispose()
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement)
    }
  }, [scrollYProgress])

  return (
    <section
      ref={sectionRef}
      aria-label="Tamper Detection"
      className="w-full bg-[#0A0A0B] py-32 px-4 flex flex-col items-center overflow-hidden"
    >
      <div className="max-w-4xl mx-auto text-center mb-8 z-10">
        <h2 style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'clamp(2.5rem, 6vw, 4.5rem)',
          fontWeight: 900,
          color: '#fff',
          textTransform: 'uppercase',
          marginBottom: '1rem',
        }}>
          Detecting the Rug Pull
        </h2>
      </div>

      <div ref={mountRef} className="relative mx-auto w-full max-w-4xl" style={{ height: '500px' }}>
        {STAGES.map((stage, i) => (
          <div
            key={stage.label}
            ref={(el) => (labelRefs.current[i] = el)}
            className="absolute top-0 left-0 pointer-events-none select-none text-center"
            style={{ width: 150 }}
          >
            <div className="text-white text-[11px] font-bold uppercase tracking-wide"
                 style={{ textShadow: "0 0 8px rgba(0,0,0,0.9)" }}>
              {stage.label}
            </div>
            <div className="text-neutral-400 text-[9px] mt-0.5 leading-tight"
                 style={{ textShadow: "0 0 6px rgba(0,0,0,0.95)" }}>
              {stage.detail}
            </div>
          </div>
        ))}
      </div>

      <div className="max-w-3xl mx-auto text-center z-10 mt-8">
        <p style={{
          fontFamily: 'var(--font-body)',
          fontSize: '1rem',
          color: 'var(--text-secondary)',
          lineHeight: 1.6,
          background: 'rgba(255,255,255,0.03)',
          padding: '1.5rem',
          borderRadius: '8px',
          border: '1px solid rgba(255,255,255,0.05)',
        }}>
          A signed, version-bumped schema update is approved. A silent change under an unchanged
          version is flagged as tampering — every fingerprint, old and new, is recorded.
        </p>
      </div>
    </section>
  )
}
