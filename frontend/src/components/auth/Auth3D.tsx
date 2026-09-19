import React, { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';

/* ---------- Rotating angular shard cluster (matches landing page Hero3D) ---------- */
function ShardMesh() {
  const meshRef = useRef<THREE.Mesh>(null!);

  useFrame((_state, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.12;
    }
  });

  return (
    <group position={[0, -0.5, 0]}>
      {/* Main dark shard */}
      <mesh ref={meshRef}>
        <icosahedronGeometry args={[2.2, 1]} />
        <meshStandardMaterial
          color="#0d0600"
          roughness={0.2}
          metalness={0.9}
          emissive="#1a0800"
          emissiveIntensity={0.4}
          wireframe={false}
        />
      </mesh>

      {/* Orange wireframe overlay */}
      <mesh rotation={[0.3, 0.5, 0.2]}>
        <icosahedronGeometry args={[2.5, 1]} />
        <meshBasicMaterial
          color="#FE6E44"
          wireframe
          transparent
          opacity={0.07}
        />
      </mesh>

      {/* Outer glow sphere */}
      <mesh>
        <icosahedronGeometry args={[2.8, 2]} />
        <meshBasicMaterial
          color="#FE6E44"
          wireframe
          transparent
          opacity={0.025}
        />
      </mesh>

      {/* Orange crack planes */}
      {[0, 1, 2].map((i) => (
        <mesh key={i} position={[i * 0.5 - 0.5, i * 0.3 - 0.3, 0.5]} rotation={[0, 0, i * 0.3]}>
          <planeGeometry args={[0.03, 3.5 - i * 0.6]} />
          <meshBasicMaterial
            color={i === 0 ? '#FE6E44' : '#FF7C56'}
            transparent
            opacity={0.7 - i * 0.1}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}

      {/* Rim lighting */}
      <pointLight position={[-4, 3, 3]} color="#FE6E44" intensity={3} distance={10} />
      <pointLight position={[4, -2, 2]} color="#FF7C56" intensity={2} distance={8} />
      <ambientLight intensity={0.04} />
      <directionalLight position={[0, 5, 5]} intensity={0.2} color="#fff" />
    </group>
  );
}

/* ---------- Floating particle nodes ---------- */
function Nodes() {
  const groupRef = useRef<THREE.Group>(null!);

  useFrame((_state, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y -= delta * 0.04;
    }
  });

  const points = React.useMemo(() => {
    const pts = [];
    for (let i = 0; i < 30; i++) {
      const r = 3.4;
      const phi = Math.acos(-1 + (2 * i) / 30);
      const theta = Math.sqrt(30 * Math.PI) * phi;
      pts.push(new THREE.Vector3(
        r * Math.cos(theta) * Math.sin(phi),
        r * Math.sin(theta) * Math.sin(phi),
        r * Math.cos(phi)
      ));
    }
    return pts;
  }, []);

  return (
    <group ref={groupRef}>
      {points.map((pos, i) => (
        <mesh key={i} position={pos}>
          <sphereGeometry args={[0.04, 6, 6]} />
          <meshBasicMaterial color="#FE6E44" transparent opacity={0.5} />
        </mesh>
      ))}
    </group>
  );
}

/* ---------- Props ---------- */
interface Auth3DProps {
  isSignUp?: boolean;
}

export default function Auth3D({ isSignUp }: Auth3DProps) {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {/* 3D Canvas */}
      <div style={{ position: 'absolute', inset: 0 }}>
        <Canvas camera={{ position: [0, 0, 7], fov: 45 }}>
          <ShardMesh />
          <Nodes />
          <OrbitControls enableZoom={false} enablePan={false} autoRotate autoRotateSpeed={0.4} />
        </Canvas>
      </div>

      {/* Telemetry card — matches the orange/black theme */}
      <div style={{
        position: 'relative',
        zIndex: 10,
        width: '320px',
        background: 'rgba(0,0,0,0.72)',
        backdropFilter: 'blur(16px)',
        border: '1px solid rgba(254,110,68,0.15)',
        borderRadius: '8px',
        padding: '1.25rem',
        boxShadow: '0 0 40px rgba(254,110,68,0.06), inset 0 0 40px rgba(0,0,0,0.4)',
      }}>
        {/* Subtle orange top accent line */}
        <div style={{ position: 'absolute', top: 0, left: '1.5rem', right: '1.5rem', height: '1px', background: 'linear-gradient(90deg, transparent, rgba(254,110,68,0.5), transparent)' }} />

        {isSignUp ? (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#FE6E44', boxShadow: '0 0 8px rgba(254,110,68,0.8)' }} />
                <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: '#fff', fontWeight: 600 }}>Sandbox Status: Active</span>
              </div>
              <span style={{
                fontFamily: 'var(--font-body)', fontSize: '0.55rem', letterSpacing: '0.18em',
                textTransform: 'uppercase', color: '#FE6E44',
                padding: '0.2rem 0.5rem', border: '1px solid rgba(254,110,68,0.3)',
                borderRadius: '3px', background: 'rgba(254,110,68,0.06)',
              }}>Cluster_Live</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', marginBottom: '1rem' }}>
              {[
                { icon: '⬡', label: 'gVisor Enclave', value: 'Isolated (Tier-0)', color: '#FE6E44' },
                { icon: '⬡', label: 'Active Policy', value: 'OWASP-LLM-01:10 Enforced', color: 'rgba(255,255,255,0.5)' },
                { icon: '⬡', label: 'Syscall Interception', value: 'eBPF Ring Buffer (0.8µs)', color: 'rgba(255,255,255,0.5)' },
              ].map((row, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.7rem', color: 'rgba(255,255,255,0.45)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span style={{ color: row.color }}>{row.icon}</span> {row.label}
                  </span>
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.65rem', color: i === 0 ? '#FE6E44' : 'rgba(255,255,255,0.55)', fontWeight: 500 }}>{row.value}</span>
                </div>
              ))}
            </div>

            <div style={{ paddingTop: '0.75rem', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.55rem', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: '0.3rem' }}>Telemetry Counter</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 700, color: '#FE6E44', letterSpacing: '0.02em' }}>
                14,289,655 <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.65rem', color: 'rgba(255,255,255,0.4)', fontWeight: 400 }}>pkts/s</span>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.75rem' }}>
              <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.55rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.25)' }}>Node: node-eu-central-04</span>
              <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.55rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.25)' }}>Latency: 1.4ms</span>
            </div>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#FE6E44', animation: 'pulse 2s infinite', boxShadow: '0 0 8px rgba(254,110,68,0.8)' }} />
                <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.6rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: '#FE6E44', fontWeight: 600 }}>Live Security Enclave</span>
              </div>
              <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.55rem', color: 'rgba(255,255,255,0.3)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Latency 12ms</span>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 700, color: '#fff', letterSpacing: '0.02em' }}>
                1,280 <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.65rem', color: '#FE6E44', fontWeight: 400, letterSpacing: '0.14em', textTransform: 'uppercase' }}>Events</span>
              </div>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)' }}>events processed today across active sessions</div>
            </div>

            <div style={{ background: 'rgba(0,0,0,0.4)', borderRadius: '6px', padding: '0.75rem', border: '1px solid rgba(255,255,255,0.05)', marginBottom: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {[
                { icon: '✓', label: '0.82ms AST check passed', time: 'Just now', ok: true },
                { icon: '🔒', label: 'mcp:fs.read authorized', time: '3s ago', ok: false },
                { icon: '✓', label: 'Zero-Trust Ed25519 verified', time: '9s ago', ok: true },
              ].map((item, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.65rem', color: item.ok ? '#FE6E44' : 'rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span>{item.icon}</span> {item.label}
                  </span>
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.6rem', color: 'rgba(255,255,255,0.3)' }}>{item.time}</span>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.6rem', color: '#FE6E44', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                <span>⛨</span> Perimeter: Strict Egress
              </span>
              <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.6rem', color: '#FE6E44' }}>99.998% Uptime</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
