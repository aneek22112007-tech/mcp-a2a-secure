import { useEffect, useRef } from 'react'
import * as THREE from 'three'

/**
 * Page-wide background: a slow field of orange and white points with faint
 * links between near neighbours. Two draw calls (points + line segments).
 * The drift is computed in the vertex shader, so the CPU only updates a few
 * uniforms per frame.
 *
 * Mounted once by McpA2aPage behind <main>. It is decorative only:
 * fixed, pointer-events none, aria-hidden.
 */

const POINT_COUNT = 2400
const LINK_SOURCE_COUNT = 520 // only these points are considered for links
const LINK_DISTANCE = 1.15
const MAX_LINKS = 900
const FRAME_MS = 1000 / 30

const VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uPixelRatio;
  attribute float aPhase;
  attribute vec3 aColor;
  attribute float aSize;
  varying vec3 vColor;
  varying float vAlpha;

  vec3 drift(vec3 p, float phase) {
    return p + vec3(
      sin(uTime * 0.11 + phase) * 0.35,
      cos(uTime * 0.09 + phase * 1.3) * 0.28,
      sin(uTime * 0.07 + phase * 0.7) * 0.3
    );
  }

  void main() {
    vec3 p = drift(position, aPhase);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    #ifdef IS_POINTS
      gl_PointSize = aSize * uPixelRatio * (9.0 / -mv.z);
    #endif
    vColor = aColor;
    vAlpha = smoothstep(26.0, 6.0, -mv.z);
  }
`

const POINT_FRAGMENT = /* glsl */ `
  uniform float uOpacity;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if (d > 0.5) discard;
    float a = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(vColor, a * vAlpha * uOpacity);
  }
`

const LINE_FRAGMENT = /* glsl */ `
  uniform float uOpacity;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    gl_FragColor = vec4(vColor, vAlpha * uOpacity);
  }
`

export default function BackgroundScene() {
  const mountRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, powerPreference: 'low-power' })
    } catch {
      // No WebGL: the static gradient behind this element stays visible.
      return
    }

    const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5)
    renderer.setPixelRatio(pixelRatio)
    renderer.setSize(window.innerWidth, window.innerHeight, false)
    renderer.setClearColor(0x000000, 0)
    renderer.domElement.style.width = '100%'
    renderer.domElement.style.height = '100%'
    renderer.domElement.style.display = 'block'
    mount.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 60)
    camera.position.set(0, 0, 12)

    // ---- points ----
    const positions = new Float32Array(POINT_COUNT * 3)
    const colors = new Float32Array(POINT_COUNT * 3)
    const phases = new Float32Array(POINT_COUNT)
    const sizes = new Float32Array(POINT_COUNT)
    const orange = new THREE.Color('#FE6E44')
    const warm = new THREE.Color('#FFB59C')
    const white = new THREE.Color('#E8E8E8')

    for (let i = 0; i < POINT_COUNT; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 34
      positions[i * 3 + 1] = (Math.random() - 0.5) * 22
      positions[i * 3 + 2] = (Math.random() - 0.5) * 18 - 2
      const r = Math.random()
      const c = r < 0.55 ? orange : r < 0.75 ? warm : white
      colors[i * 3] = c.r
      colors[i * 3 + 1] = c.g
      colors[i * 3 + 2] = c.b
      phases[i] = Math.random() * Math.PI * 2
      sizes[i] = 1.2 + Math.random() * 2.2
    }

    const pointGeo = new THREE.BufferGeometry()
    pointGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    pointGeo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3))
    pointGeo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1))
    pointGeo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))

    const uniforms = {
      uTime: { value: 0 },
      uPixelRatio: { value: pixelRatio },
      uOpacity: { value: 0.55 },
    }
    const pointMat = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: VERTEX,
      fragmentShader: POINT_FRAGMENT,
      defines: { IS_POINTS: '' },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    const points = new THREE.Points(pointGeo, pointMat)

    // ---- links between near neighbours (static topology, drifts with the points) ----
    const linkPos: number[] = []
    const linkCol: number[] = []
    const linkPhase: number[] = []
    let links = 0
    for (let a = 0; a < LINK_SOURCE_COUNT && links < MAX_LINKS; a++) {
      for (let b = a + 1; b < LINK_SOURCE_COUNT && links < MAX_LINKS; b++) {
        const dx = positions[a * 3] - positions[b * 3]
        const dy = positions[a * 3 + 1] - positions[b * 3 + 1]
        const dz = positions[a * 3 + 2] - positions[b * 3 + 2]
        if (dx * dx + dy * dy + dz * dz > LINK_DISTANCE * LINK_DISTANCE * 4) continue
        for (const idx of [a, b]) {
          linkPos.push(positions[idx * 3], positions[idx * 3 + 1], positions[idx * 3 + 2])
          linkCol.push(orange.r, orange.g, orange.b)
          linkPhase.push(phases[idx])
        }
        links++
      }
    }
    const lineGeo = new THREE.BufferGeometry()
    lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(linkPos, 3))
    lineGeo.setAttribute('aColor', new THREE.Float32BufferAttribute(linkCol, 3))
    lineGeo.setAttribute('aPhase', new THREE.Float32BufferAttribute(linkPhase, 1))
    const lineUniforms = { uTime: uniforms.uTime, uPixelRatio: uniforms.uPixelRatio, uOpacity: { value: 0.12 } }
    const lineMat = new THREE.ShaderMaterial({
      uniforms: lineUniforms,
      vertexShader: VERTEX,
      fragmentShader: LINE_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    const lines = new THREE.LineSegments(lineGeo, lineMat)

    const group = new THREE.Group()
    group.add(points, lines)
    scene.add(group)

    // ---- input: scroll + mouse parallax ----
    const target = { x: 0, y: 0, scroll: 0 }
    const current = { x: 0, y: 0, scroll: 0 }
    const onMouse = (e: MouseEvent) => {
      target.x = (e.clientX / window.innerWidth - 0.5) * 2
      target.y = (e.clientY / window.innerHeight - 0.5) * 2
    }
    const onScroll = () => {
      const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight)
      target.scroll = window.scrollY / max
    }
    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight
      camera.updateProjectionMatrix()
      renderer.setSize(window.innerWidth, window.innerHeight, false)
    }
    window.addEventListener('mousemove', onMouse, { passive: true })
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onResize)
    onScroll()

    // ---- loop: ~30fps, paused when the tab is hidden ----
    let raf = 0
    let last = 0
    let elapsed = 0
    let running = false

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      const dt = now - last
      if (dt < FRAME_MS) return
      last = now
      elapsed += Math.min(dt, 100) / 1000
      uniforms.uTime.value = elapsed

      current.x += (target.x - current.x) * 0.04
      current.y += (target.y - current.y) * 0.04
      current.scroll += (target.scroll - current.scroll) * 0.06

      camera.position.x = current.x * 0.6
      camera.position.y = -current.y * 0.4 - current.scroll * 3
      camera.lookAt(0, -current.scroll * 3, 0)
      group.rotation.y = elapsed * 0.01 + current.scroll * 0.5
      renderer.render(scene, camera)
    }
    const start = () => {
      if (running) return
      running = true
      last = performance.now()
      raf = requestAnimationFrame(frame)
    }
    const stop = () => {
      running = false
      cancelAnimationFrame(raf)
    }
    const onVisibility = () => (document.hidden ? stop() : start())
    document.addEventListener('visibilitychange', onVisibility)
    if (!document.hidden) start()

    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('mousemove', onMouse)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onResize)
      pointGeo.dispose()
      lineGeo.dispose()
      pointMat.dispose()
      lineMat.dispose()
      renderer.dispose()
      renderer.forceContextLoss()
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement)
    }
  }, [])

  return <div ref={mountRef} style={{ position: 'absolute', inset: 0 }} />
}
