import { useEffect, useState } from 'react'
import { useIntersectionReveal } from '../../hooks/useScrollProgress'
import ReactFlow, {
  Background,
  Controls,
  MarkerType,
  useNodesState,
  useEdgesState,
} from 'reactflow'
import type { Node, Edge } from 'reactflow'
import 'reactflow/dist/style.css'

const BASE_NODES: Node[] = [
  { id: 'agent',    position: { x: 200, y: 0   }, data: { label: 'AI AGENT'  }, type: 'default' },
  { id: 'client',   position: { x: 200, y: 80  }, data: { label: 'MCP CLIENT'}, type: 'default' },
  { id: 'server',   position: { x: 200, y: 160 }, data: { label: 'MCP SERVER'}, type: 'default' },
  { id: 'auth',     position: { x: 60,  y: 240 }, data: { label: 'AUTH'      }, type: 'default' },
  { id: 'policy',   position: { x: 340, y: 240 }, data: { label: 'POLICY'    }, type: 'default' },
  { id: 'sandbox',  position: { x: 200, y: 320 }, data: { label: 'SANDBOX'   }, type: 'default' },
  { id: 'tool',     position: { x: 200, y: 400 }, data: { label: 'TOOL'      }, type: 'default' },
  { id: 'audit',    position: { x: 200, y: 480 }, data: { label: 'AUDIT'     }, type: 'default' },
]

const BASE_EDGES: Edge[] = [
  { id: 'e1', source: 'agent',  target: 'client',  label: 'REQUEST',   markerEnd: { type: MarkerType.ArrowClosed } },
  { id: 'e2', source: 'client', target: 'server',  label: 'VERIFY',    markerEnd: { type: MarkerType.ArrowClosed } },
  { id: 'e3', source: 'server', target: 'auth',    label: 'AUTHORIZE', markerEnd: { type: MarkerType.ArrowClosed } },
  { id: 'e4', source: 'server', target: 'policy',  label: 'CHECK',     markerEnd: { type: MarkerType.ArrowClosed } },
  { id: 'e5', source: 'auth',   target: 'sandbox', markerEnd: { type: MarkerType.ArrowClosed } },
  { id: 'e6', source: 'policy', target: 'sandbox', markerEnd: { type: MarkerType.ArrowClosed } },
  { id: 'e7', source: 'sandbox',target: 'tool',    label: 'EXECUTE',   markerEnd: { type: MarkerType.ArrowClosed } },
  { id: 'e8', source: 'tool',   target: 'audit',   label: 'RECORD',    markerEnd: { type: MarkerType.ArrowClosed } },
]

const nodeStyle = (active: boolean): React.CSSProperties => ({
  background: active ? 'rgba(124,255,79,0.1)' : '#050905',
  border: `1px solid ${active ? 'rgba(124,255,79,0.5)' : '#1a2a1e'}`,
  color: active ? '#7CFF4F' : '#9BA39D',
  borderRadius: 6,
  padding: '4px 10px',
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.1em',
  boxShadow: active ? '0 0 16px rgba(124,255,79,0.2)' : 'none',
  transition: 'all 0.4s ease',
  minWidth: 90,
  textAlign: 'center' as const,
})

const ACTIVATION_ORDER = ['agent', 'client', 'server', 'auth', 'policy', 'sandbox', 'tool', 'audit']

export default function MCPNetworkSection() {
  const { ref, visible } = useIntersectionReveal(0.15)
  const [activeNodes, setActiveNodes] = useState<Set<string>>(new Set())
  const [nodes, setNodes, onNodesChange] = useNodesState(
    BASE_NODES.map((n) => ({ ...n, style: nodeStyle(false) }))
  )
  const [edges, , onEdgesChange] = useEdgesState(BASE_EDGES)

  // Sequential node activation on visible
  useEffect(() => {
    if (!visible) return
    let i = 0
    const activate = () => {
      if (i >= ACTIVATION_ORDER.length) return
      const nodeId = ACTIVATION_ORDER[i]
      setActiveNodes((prev) => new Set([...prev, nodeId]))
      i++
      setTimeout(activate, 350)
    }
    setTimeout(activate, 300)
  }, [visible])

  // Update node styles when activeNodes changes
  useEffect(() => {
    setNodes((nds) =>
      nds.map((n) => ({
        ...n,
        style: nodeStyle(activeNodes.has(n.id)),
      }))
    )
  }, [activeNodes, setNodes])

  return (
    <section
      id="network"
      ref={ref as React.RefObject<HTMLElement>}
      className="section-dark py-24 relative"
      aria-label="MCP security network graph"
    >
      <div className="max-w-[1400px] mx-auto px-6 md:px-10">
        <div className="mb-12">
          <span className={`label-tech text-[#5a6660] tracking-[0.2em] reveal ${visible ? 'visible' : ''}`}>
            INFRASTRUCTURE
          </span>
          <h2 className={`text-section font-black text-white mt-3 reveal reveal-delay-1 ${visible ? 'visible' : ''}`}>
            MCP SECURITY
            <br />
            NETWORK.
          </h2>
        </div>

        <div
          className={`reveal reveal-delay-2 ${visible ? 'visible' : ''}`}
          style={{ height: 560, borderRadius: 12, overflow: 'hidden', border: '1px solid #0f1a11', background: '#030604' }}
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            fitView
            fitViewOptions={{ padding: 0.3 }}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            panOnScroll={false}
            zoomOnScroll={false}
            attributionPosition="bottom-right"
          >
            <Background color="#1a2a1e" gap={32} size={1} />
            <Controls
              showInteractive={false}
              style={{
                background: '#050905',
                border: '1px solid #1a2a1e',
                borderRadius: 6,
              }}
            />
          </ReactFlow>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 divider" aria-hidden="true" />
    </section>
  )
}
