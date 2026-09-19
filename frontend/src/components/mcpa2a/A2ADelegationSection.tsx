import {
  ReactFlow,
  useNodesState,
  useEdgesState,
  MarkerType,
  Background,
} from '@xyflow/react'
import type { Edge, Node } from '@xyflow/react'
import '@xyflow/react/dist/style.css'

const initialNodes: Node[] = [
  {
    id: 'manager',
    type: 'default',
    data: { label: 'MANAGER AGENT\n(Task Origin)' },
    position: { x: 100, y: 150 },
    style: {
      background: '#0A0A0B',
      color: '#fff',
      border: '1px solid rgba(254,110,68,0.5)',
      borderRadius: '8px',
      padding: '1rem',
      fontFamily: 'var(--font-display)',
      fontSize: '0.8rem',
      textAlign: 'center',
      width: 180,
    },
  },
  {
    id: 'worker',
    type: 'default',
    data: { label: 'WORKER AGENT\n(Delegated Executor)' },
    position: { x: 500, y: 150 },
    style: {
      background: '#0A0A0B',
      color: '#fff',
      border: '1px solid rgba(255,255,255,0.2)',
      borderRadius: '8px',
      padding: '1rem',
      fontFamily: 'var(--font-display)',
      fontSize: '0.8rem',
      textAlign: 'center',
      width: 180,
    },
  },
]

const initialEdges: Edge[] = [
  {
    id: 'e1-2',
    source: 'manager',
    target: 'worker',
    animated: true,
    label: 'Delegated Task Packet',
    style: { stroke: 'var(--accent)', strokeWidth: 2 },
    labelStyle: { fill: 'var(--accent)', fontWeight: 700, fontSize: 12 },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: 'var(--accent)',
    },
  },
]

export default function A2ADelegationSection() {
  const [nodes, , onNodesChange] = useNodesState(initialNodes)
  const [edges, , onEdgesChange] = useEdgesState(initialEdges)

  return (
    <section
      aria-label="A2A Delegation"
      style={{
        background: '#0A0A0B',
        padding: '8rem 2.5rem',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '4rem',
      }}
    >
      <div style={{ textAlign: 'center', maxWidth: '800px' }}>
        <h2 style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'clamp(2rem, 5vw, 4rem)',
          fontWeight: 900,
          color: '#fff',
          textTransform: 'uppercase',
          marginBottom: '1.5rem',
        }}>
          Independent Agents.<br />Verified Hand-Off.
        </h2>
      </div>

      <div style={{
        width: '100%',
        maxWidth: '900px',
        height: '400px',
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(255,255,255,0.05)',
        borderRadius: '16px',
        overflow: 'hidden',
      }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          fitView
          proOptions={{ hideAttribution: true }}
          zoomOnScroll={false}
          panOnDrag={false}
        >
          <Background color="rgba(255,255,255,0.05)" gap={16} />
        </ReactFlow>
      </div>

      <div style={{ maxWidth: '800px', textAlign: 'center' }}>
        <p style={{
          fontFamily: 'var(--font-body)',
          fontSize: '0.85rem',
          color: 'var(--text-secondary)',
          lineHeight: 1.6,
        }}>
          <strong style={{ color: '#fff' }}>Small print:</strong> Prototyping starts in Week 5–6, in parallel with sandboxing work, not left to the final stretch. If signed agent-card verification isn't ready in time, the fallback is an unsigned local delegation demo between two independent processes — still showing a real task hand-off.
        </p>
      </div>
    </section>
  )
}
