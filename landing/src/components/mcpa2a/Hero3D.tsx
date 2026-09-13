import { useRef, useMemo, useEffect } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { useSpring } from 'framer-motion'
import * as THREE from 'three'

/* ---- Angular Shard Mesh ---- */
function ShardGeometry() {
  const mesh = useRef<THREE.Mesh>(null!)

  // Build custom jagged geometry — like dark rock pillars with angular faces
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry()

    // Hand-crafted vertices for a multi-pillar angular shard cluster
    const verts: number[] = []
    const indices: number[] = []

    function addPrism(
      cx: number, cz: number,
      w: number, d: number, h: number,
      tiltX = 0, tiltZ = 0
    ) {
      const base = verts.length / 3
      // bottom face (4 corners)
      verts.push(cx - w, -h / 2 + tiltX, cz - d)
      verts.push(cx + w, -h / 2 - tiltX, cz - d)
      verts.push(cx + w, -h / 2 + tiltZ, cz + d)
      verts.push(cx - w, -h / 2 - tiltZ, cz + d)
      // top face (4 corners) with random offset for jagged look
      verts.push(cx - w * 0.6 + tiltX, h / 2 + tiltX * 0.5, cz - d * 0.8)
      verts.push(cx + w * 0.8 - tiltZ, h / 2 - tiltZ * 0.3, cz - d * 0.6)
      verts.push(cx + w * 0.9 + tiltZ, h / 2 + tiltX * 0.4, cz + d * 0.7)
      verts.push(cx - w * 0.7 - tiltX, h / 2 + tiltZ * 0.6, cz + d * 0.9)

      // Build faces
      const f = [
        // bottom
        [0,2,1],[0,3,2],
        // top
        [4,5,6],[4,6,7],
        // sides
        [0,1,5],[0,5,4],
        [1,2,6],[1,6,5],
        [2,3,7],[2,7,6],
        [3,0,4],[3,4,7],
      ]
      f.forEach(([a, b, c]) => indices.push(base+a, base+b, base+c))
    }

    // Three overlapping pillars at different angles — mimics the 3 rock pillars in the video
    addPrism(-1.2, 0.3, 0.38, 0.35, 4.5, 0.3, -0.2)
    addPrism(0.1, -0.1, 0.42, 0.4, 5.2, -0.25, 0.15)
    addPrism(1.4, 0.5, 0.36, 0.32, 3.8, 0.2, 0.3)
    // Extra shards for complexity
    addPrism(-0.5, 1.0, 0.22, 0.2, 3.2, 0.15, -0.1)
    addPrism(0.9, -0.8, 0.28, 0.25, 4.0, -0.1, 0.2)
    addPrism(-1.8, -0.5, 0.18, 0.16, 2.8, 0.2, 0.1)

    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
    geo.setIndex(indices)
    geo.computeVertexNormals()
    return geo
  }, [])

  // Mouse parallax spring targets
  const mouseX = useSpring(0, { stiffness: 50, damping: 15 })
  const mouseY = useSpring(0, { stiffness: 50, damping: 15 })

  useEffect(() => {
    const handleMouse = (e: MouseEvent) => {
      const nx = (e.clientX / window.innerWidth - 0.5) * 2
      const ny = (e.clientY / window.innerHeight - 0.5) * 2
      mouseX.set(nx * 0.14) // max ~8°
      mouseY.set(-ny * 0.1)
    }
    window.addEventListener('mousemove', handleMouse)
    return () => window.removeEventListener('mousemove', handleMouse)
  }, [mouseX, mouseY])

  useFrame((_state, delta) => {
    if (!mesh.current) return
    // Slow auto-rotation
    mesh.current.rotation.y += delta * 0.18
    // Mouse-parallax overlay on top of auto-rotation
    mesh.current.rotation.x += (mouseY.get() - mesh.current.rotation.x) * 0.06
  })

  return (
    <group position={[0, -1.1, 0]} rotation={[-0.1, 0, 0]}>
      {/* Main shard body — dark charcoal with slight metallic sheen */}
      <mesh ref={mesh} geometry={geometry} castShadow>
        <meshStandardMaterial
          color="#1a0f0a"
          roughness={0.15}
          metalness={0.85}
          emissive="#0a0503"
          emissiveIntensity={0.3}
        />
      </mesh>

      {/* Emissive crack lines — orange glow */}
      {[0, 1, 2].map((i) => (
        <mesh key={i} position={[i * 0.6 - 0.6, i * 0.4 - 0.4, 0.42]}>
          <planeGeometry args={[0.04, 3.5 - i * 0.5]} />
          <meshBasicMaterial
            color={i === 0 ? '#FE6E44' : '#FF7C56'}
            transparent
            opacity={0.85 - i * 0.1}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}

      {/* Secondary crack lines at angles */}
      {[0, 1].map((i) => (
        <mesh
          key={`crack2-${i}`}
          position={[i * 1.2 - 0.6, i * 0.2 - 0.5, 0.38]}
          rotation={[0, 0, Math.PI * (0.1 + i * 0.15)]}
        >
          <planeGeometry args={[0.025, 2.2 - i * 0.3]} />
          <meshBasicMaterial
            color="#FE6E44"
            transparent
            opacity={0.6}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}

      {/* Point lights for rim lighting */}
      <pointLight position={[-3, 2, 3]} color="#FE6E44" intensity={2} distance={8} />
      <pointLight position={[3, -2, 2]} color="#FF7C56" intensity={1.5} distance={6} />
      <ambientLight intensity={0.05} />
      <directionalLight position={[0, 5, 5]} intensity={0.3} color="#fff" />
    </group>
  )
}

/* ---- Canvas Wrapper ---- */
interface Hero3DProps {
  className?: string
  reducedMotion?: boolean
}

export default function Hero3D({ className = '', reducedMotion = false }: Hero3DProps) {
  if (reducedMotion) return null

  return (
    <Canvas
      className={className}
      camera={{ position: [0, 0, 6], fov: 50 }}
      gl={{ antialias: true, alpha: true }}
      style={{ background: 'transparent' }}
      aria-label="3D animated angular shard — decorative"
      aria-hidden="true"
    >
      <ShardGeometry />
    </Canvas>
  )
}
