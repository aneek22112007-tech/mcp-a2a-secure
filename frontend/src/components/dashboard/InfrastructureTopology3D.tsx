import React, { useRef, useMemo, useState, useEffect } from 'react';
import { Canvas, invalidate } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { useDashboardStore } from '../../store/dashboardStore';
import type { TopologyNode } from '../../data/dashboardMockData';
import { TopologyFilters, type TopologyFilterState, defaultTopologyFilters } from './TopologyFilters';

/* ===== Node Component ===== */
interface NodeMeshProps {
  node: TopologyNode;
  position: [number, number, number];
  onHover: (node: TopologyNode | null) => void;
  onSelect: (node: TopologyNode) => void;
  isSelected: boolean;
}

const NodeMesh: React.FC<NodeMeshProps> = ({ node, position, onHover, onSelect, isSelected }) => {
  const meshRef = useRef<THREE.Mesh>(null!);
  const [hovered, setHovered] = useState(false);


  const getNodeColor = () => {
    if (node.type === 'server') return '#FE6E44';
    if (node.type === 'agent') return '#ffffff';
    return '#999999';
  };

  const getNodeSize = () => {
    if (node.type === 'server') return 0.3;
    if (node.type === 'agent') return 0.2;
    return 0.15;
  };

  const getRiskColor = () => {
    if (node.riskLevel === 'critical') return '#ff0000';
    if (node.riskLevel === 'high') return '#ff4444';
    if (node.riskLevel === 'medium') return '#FE6E44';
    return '#7CFF4F';
  };

  return (
    <group position={position}>
      {/* Main node sphere */}
      <mesh
        ref={meshRef}
        scale={hovered || isSelected ? 1.1 : 1}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          onHover(node);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          setHovered(false);
          onHover(null);
          document.body.style.cursor = 'default';
        }}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(node);
        }}
      >
        {node.type === 'server' ? (
          <dodecahedronGeometry args={[getNodeSize(), 0]} />
        ) : (
          <icosahedronGeometry args={[getNodeSize(), 0]} />
        )}
        <meshStandardMaterial
          color={getNodeColor()}
          emissive={getNodeColor()}
          emissiveIntensity={hovered || isSelected ? 0.5 : 0.2}
          roughness={0.3}
          metalness={0.7}
        />
      </mesh>

      {/* Outer glow ring */}
      {(hovered || isSelected) && (
        <mesh>
          <ringGeometry args={[getNodeSize() * 1.5, getNodeSize() * 1.8, 32]} />
          <meshBasicMaterial
            color={getNodeColor()}
            transparent
            opacity={0.3}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}

      {/* Risk indicator */}
      {(node.riskLevel === 'high' || node.riskLevel === 'critical') && (
        <mesh position={[0, getNodeSize() + 0.15, 0]}>
          <sphereGeometry args={[0.08, 8, 8]} />
          <meshBasicMaterial
            color={getRiskColor()}
            transparent
            opacity={0.8}
          />
          <pointLight color={getRiskColor()} intensity={2} distance={1} />
        </mesh>
      )}

      {/* Status indicator for operational nodes */}
      {node.type === 'server' && node.status === 'operational' && (
        <mesh position={[getNodeSize() * 0.8, getNodeSize() * 0.8, 0]}>
          <sphereGeometry args={[0.06, 8, 8]} />
          <meshBasicMaterial color="#7CFF4F" />
          <pointLight color="#7CFF4F" intensity={1} distance={0.5} />
        </mesh>
      )}
    </group>
  );
};

/* ===== Connection Lines ===== */
interface ConnectionLinesProps {
  nodes: Array<{ id: string; position: [number, number, number] }>;
  connections: Array<{ from: string; to: string }>;
}

const ConnectionLines: React.FC<ConnectionLinesProps> = ({ nodes, connections }) => {
  const linesRef = useRef<THREE.Group>(null!);

  const nodePositions = useMemo(() => {
    const map = new Map<string, [number, number, number]>();
    nodes.forEach(n => map.set(n.id, n.position));
    return map;
  }, [nodes]);

  return (
    <group ref={linesRef}>
      {connections.map((conn, i) => {
        const from = nodePositions.get(conn.from);
        const to = nodePositions.get(conn.to);
        if (!from || !to) return null;

        const points = [
          new THREE.Vector3(...from),
          new THREE.Vector3(...to),
        ];
        const geometry = new THREE.BufferGeometry().setFromPoints(points);

        return (
          <primitive key={i} object={new THREE.Line(
            geometry,
            new THREE.LineBasicMaterial({
              color: 0xFE6E44,
              transparent: true,
              opacity: 0.15,
            })
          )} />
        );
      })}
    </group>
  );
};

/* ===== Floating Particles ===== */
const FloatingParticles: React.FC = () => {
  const particlesRef = useRef<THREE.Points>(null!);

  // Reduced from 150 to 60 — still looks great, 60% less GPU/CPU
  const particleCount = 60;
  const positions = useMemo(() => {
    const pos = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 20;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 20;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 20;
    }
    return pos;
  }, []);

  return (
    <points ref={particlesRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={particleCount}
          array={positions}
          itemSize={3}
          args={[positions, 3]}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.03}
        color="#FE6E44"
        transparent
        opacity={0.4}
        sizeAttenuation
      />
    </points>
  );
};

/* ===== Scene Component ===== */
const Scene: React.FC<{
  nodes: TopologyNode[];
  onNodeHover: (node: TopologyNode | null) => void;
  onNodeSelect: (node: TopologyNode) => void;
  selectedNodeId: string | null;
}> = ({ nodes, onNodeHover, onNodeSelect, selectedNodeId }) => {
  // Calculate positions for nodes in 3D space
  const nodesWithPositions = useMemo(() => {
    const servers = nodes.filter(n => n.type === 'server');
    const agents = nodes.filter(n => n.type === 'agent');

    const positioned: Array<{ node: TopologyNode; position: [number, number, number] }> = [];

    // Position servers in an outer ring
    servers.forEach((server, i) => {
      const angle = (i / servers.length) * Math.PI * 2;
      const radius = 4;
      positioned.push({
        node: server,
        position: [
          Math.cos(angle) * radius,
          Math.sin(i * 0.5) * 1,
          Math.sin(angle) * radius,
        ],
      });
    });

    // Position agents in inner positions
    agents.forEach((agent, i) => {
      const angle = (i / agents.length) * Math.PI * 2 + Math.PI / 4;
      const radius = 2;
      positioned.push({
        node: agent,
        position: [
          Math.cos(angle) * radius,
          Math.sin(i * 0.7) * 1.5,
          Math.sin(angle) * radius,
        ],
      });
    });

    return positioned;
  }, [nodes]);

  // Build connections
  const connections = useMemo(() => {
    const conns: Array<{ from: string; to: string }> = [];
    nodes.forEach(node => {
      node.connections.forEach(targetId => {
        conns.push({ from: node.id, to: targetId });
      });
    });
    return conns;
  }, [nodes]);

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.2} />
      <pointLight position={[10, 10, 10]} intensity={0.5} color="#FE6E44" />
      <pointLight position={[-10, -10, -10]} intensity={0.3} color="#ffffff" />
      <directionalLight position={[0, 10, 5]} intensity={0.3} />

      {/* Grid Helper */}
      <gridHelper args={[20, 20, '#FE6E44', '#333333']} position={[0, -5, 0]} />

      {/* Nodes */}
      {nodesWithPositions.map(({ node, position }) => (
        <NodeMesh
          key={node.id}
          node={node}
          position={position}
          onHover={onNodeHover}
          onSelect={onNodeSelect}
          isSelected={selectedNodeId === node.id}
        />
      ))}

      {/* Connection Lines */}
      <ConnectionLines
        nodes={nodesWithPositions.map(n => ({ id: n.node.id, position: n.position }))}
        connections={connections}
      />

      {/* Floating Particles */}
      <FloatingParticles />

      {/* Camera Controls */}
      <OrbitControls
        enableZoom={true}
        enablePan={true}
        minDistance={5}
        maxDistance={20}
        autoRotate={false}
      />
    </>
  );
};

/* ===== Main Component ===== */
interface InfrastructureTopology3DProps {
  height?: string;
}

export const InfrastructureTopology3D: React.FC<InfrastructureTopology3DProps> = ({ height = '600px' }) => {
  const { topologyNodes, selectNode, selectedNodeId } = useDashboardStore();
  const [hoveredNode, setHoveredNode] = useState<TopologyNode | null>(null);
  const [filters, setFilters] = useState<TopologyFilterState>(defaultTopologyFilters);
  const containerRef = useRef<HTMLDivElement>(null);

  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // Mount the WebGL canvas after initial DOM paint so it doesn't block FCP/LCP
    const timer = setTimeout(() => setIsReady(true), 40);
    return () => clearTimeout(timer);
  }, []);

  // Pause WebGL rendering when canvas is not visible (e.g. navigated to another view)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) invalidate();
      },
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Apply filters to nodes
  const filteredNodes = useMemo(() => {
    return topologyNodes.filter(node => {
      // Filter by node type
      if (!filters.nodeTypes[node.type]) return false;

      // Filter by risk level
      if (!filters.riskLevels[node.riskLevel]) return false;

      // Filter by search query
      if (filters.searchQuery.length > 0) {
        const query = filters.searchQuery.toLowerCase();
        if (!node.name.toLowerCase().includes(query) && !node.id.toLowerCase().includes(query)) {
          return false;
        }
      }

      // Focus mode: only show nodes with connections OR selected node
      if (filters.focusMode) {
        const hasConnections = node.connections.length > 0 || 
                              topologyNodes.some(n => n.connections.includes(node.id));
        const isSelected = node.id === selectedNodeId;
        if (!hasConnections && !isSelected) return false;
      }

      return true;
    });
  }, [topologyNodes, filters, selectedNodeId]);

  const handleResetFilters = () => {
    setFilters(defaultTopologyFilters);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%' }}>
      {/* Filters */}
      <TopologyFilters
        filters={filters}
        onChange={setFilters}
        onReset={handleResetFilters}
      />

      {/* Topology Visualization */}
      <div ref={containerRef} style={{ position: 'relative', width: '100%', height }}>
        {/* 3D Canvas — dpr capped at 1.5 (retina at 2x = 4x pixels, no visible difference)
            frameloop="demand" — only renders when invalidate() is called, not 60fps idle */}
        {isReady && (
          <Canvas
            camera={{ position: [8, 5, 8], fov: 50 }}
            style={{ background: 'transparent' }}
            dpr={[1, 1.5]}
            frameloop="demand"
          >
            <Scene
              nodes={filteredNodes}
              onNodeHover={setHoveredNode}
              onNodeSelect={(node) => selectNode(node.id)}
              selectedNodeId={selectedNodeId}
            />
          </Canvas>
        )}

        {/* Hover Tooltip */}
        {hoveredNode && (
          <div style={{
            position: 'absolute',
            top: '1rem',
            left: '1rem',
            background: 'rgba(0,0,0,0.9)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(254,110,68,0.3)',
            borderRadius: '6px',
            padding: '1rem',
            minWidth: '240px',
            pointerEvents: 'none',
            zIndex: 10,
          }}>
            {/* Title */}
            <div style={{
              fontFamily: 'var(--font-body)',
              fontSize: '0.7rem',
              fontWeight: 600,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.5)',
              marginBottom: '0.5rem',
              borderBottom: '1px solid rgba(254,110,68,0.2)',
              paddingBottom: '0.5rem',
            }}>
              {hoveredNode.type === 'server' ? 'MCP SERVER' : hoveredNode.type === 'agent' ? 'AGENT' : 'TOOL'}
            </div>

            {/* Name */}
            <div style={{
              fontFamily: 'var(--font-display)',
              fontSize: '0.9rem',
              fontWeight: 700,
              color: '#fff',
              marginBottom: '0.75rem',
            }}>
              {hoveredNode.name}
            </div>

            {/* Stats */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.4rem',
            }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontFamily: 'var(--font-body)',
                fontSize: '0.7rem',
              }}>
                <span style={{ color: 'rgba(255,255,255,0.5)' }}>STATUS</span>
                <span style={{ 
                  color: hoveredNode.status === 'operational' || hoveredNode.status === 'active' ? '#7CFF4F' : '#FE6E44',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                }}>
                  {hoveredNode.status}
                </span>
              </div>

              {hoveredNode.metadata.toolCount && (
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.7rem',
                }}>
                  <span style={{ color: 'rgba(255,255,255,0.5)' }}>TOOLS</span>
                  <span style={{ color: '#FE6E44', fontWeight: 600 }}>{hoveredNode.metadata.toolCount}</span>
                </div>
              )}

              {hoveredNode.metadata.callCount && (
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.7rem',
                }}>
                  <span style={{ color: 'rgba(255,255,255,0.5)' }}>CALLS</span>
                  <span style={{ color: '#FE6E44', fontWeight: 600 }}>{hoveredNode.metadata.callCount}</span>
                </div>
              )}

              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontFamily: 'var(--font-body)',
                fontSize: '0.7rem',
              }}>
                <span style={{ color: 'rgba(255,255,255,0.5)' }}>LAST ACTIVITY</span>
                <span style={{ color: 'rgba(255,255,255,0.75)' }}>{hoveredNode.metadata.lastActivity}</span>
              </div>

              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontFamily: 'var(--font-body)',
                fontSize: '0.7rem',
              }}>
                <span style={{ color: 'rgba(255,255,255,0.5)' }}>RISK</span>
                <span style={{ 
                  color: hoveredNode.riskLevel === 'low' ? '#7CFF4F' : 
                         hoveredNode.riskLevel === 'medium' ? '#FE6E44' : '#ff4444',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                }}>
                  {hoveredNode.riskLevel}
                </span>
              </div>
            </div>

            {/* Hint */}
            <div style={{
              marginTop: '0.75rem',
              paddingTop: '0.75rem',
              borderTop: '1px solid rgba(255,255,255,0.05)',
              fontFamily: 'var(--font-body)',
              fontSize: '0.65rem',
              color: 'rgba(255,255,255,0.3)',
              fontStyle: 'italic',
            }}>
              Click to inspect details
            </div>
          </div>
        )}

        {/* Filter Results Badge */}
        {filteredNodes.length < topologyNodes.length && (
          <div style={{
            position: 'absolute',
            top: '1rem',
            right: '1rem',
            background: 'rgba(254,110,68,0.15)',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(254,110,68,0.3)',
            borderRadius: '6px',
            padding: '0.5rem 0.75rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FE6E44" strokeWidth="2">
              <line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/>
              <line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/>
              <line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/>
            </svg>
            <span style={{
              fontFamily: 'var(--font-body)',
              fontSize: '0.7rem',
              fontWeight: 600,
              color: '#FE6E44',
            }}>
              {filteredNodes.length} / {topologyNodes.length} nodes
            </span>
          </div>
        )}

        {/* Controls Hint */}
        <div style={{
          position: 'absolute',
          bottom: '1rem',
          right: '1rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.25rem',
          alignItems: 'flex-end',
          fontFamily: 'var(--font-body)',
          fontSize: '0.65rem',
          color: 'rgba(255,255,255,0.3)',
          pointerEvents: 'none',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
            </svg>
            Drag to rotate
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            Scroll to zoom
          </div>
        </div>

        {/* Legend */}
        <div style={{
          position: 'absolute',
          bottom: '1rem',
          left: '1rem',
          background: 'rgba(0,0,0,0.7)',
          backdropFilter: 'blur(8px)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '6px',
          padding: '0.75rem',
          display: 'flex',
          gap: '1rem',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{
              width: '8px',
              height: '8px',
              background: '#FE6E44',
              boxShadow: '0 0 6px #FE6E44',
            }} />
            <span style={{
              fontFamily: 'var(--font-body)',
              fontSize: '0.65rem',
              color: 'rgba(255,255,255,0.6)',
            }}>Servers</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{
              width: '8px',
              height: '8px',
              background: '#ffffff',
              boxShadow: '0 0 6px #ffffff',
            }} />
            <span style={{
              fontFamily: 'var(--font-body)',
              fontSize: '0.65rem',
              color: 'rgba(255,255,255,0.6)',
            }}>Agents</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{
              width: '8px',
              height: '8px',
              background: '#7CFF4F',
              boxShadow: '0 0 6px #7CFF4F',
            }} />
            <span style={{
              fontFamily: 'var(--font-body)',
              fontSize: '0.65rem',
              color: 'rgba(255,255,255,0.6)',
            }}>Healthy</span>
          </div>
        </div>
      </div>
    </div>
  );
};
