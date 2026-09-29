import { useEffect, useState } from 'react'
import { useIntersectionReveal } from '../../hooks/useScrollProgress'
import ReactFlow, {
  Background,
  MarkerType,
  useNodesState,
  useEdgesState,
} from 'reactflow'
import type { Node, Edge } from 'reactflow'
import 'reactflow/dist/style.css'

const A2A_NODES: Node[] = [
  { id: 'orchestrator', position: { x: 200, y: 0   }, data: { label: 'LEAD ORCHESTRATOR' } },
  { id: 'card',         position: { x: 200, y: 80  }, data: { label: 'AGENT CARD'         } },
  { id: 'verify',       position: { x: 200, y: 160 }, data: { label: 'ED25519 VERIFY'     } },
  { id: 'envelope',     position: { x: 200, y: 240 }, data: { label: 'SIGNED ENVELOPE'    } },
  { id: 'specialist',   position: { x: 200, y: 320 }, data: { label: 'SECURITY SPECIALIST'} },
  { id: 'sandbox2',     position: { x: 80,  y: 400 }, data: { label: 'SANDBOX'            } },
  { id: 'mcptool',      position: { x: 320, y: 400 }, data: { label: 'MCP TOOL'           } },
  { id: 'result',       position: { x: 200, y: 480 }, data: { label: 'ATTESTED RESULT'    } },
]

const A2A_EDGES: Edge[] = [
  { id: 'a1', source: 'orchestrator', target: 'card',       markerEnd: { type: MarkerType.ArrowClosed } },
  { id: 'a2', source: 'card',         target: 'verify',     markerEnd: { type: MarkerType.ArrowClosed } },
  { id: 'a3', source: 'verify',       target: 'envelope',   markerEnd: { type: MarkerType.ArrowClosed } },
  { id: 'a4', source: 'envelope',     target: 'specialist', markerEnd: { type: MarkerType.ArrowClosed } },
  { id: 'a5', source: 'specialist',   target: 'sandbox2',   markerEnd: { type: MarkerType.ArrowClosed } },
  { id: 'a6', source: 'specialist',   target: 'mcptool',    markerEnd: { type: MarkerType.ArrowClosed } },
  { id: 'a7', source: 'sandbox2',     target: 'result',     markerEnd: { type: MarkerType.ArrowClosed } },
  { id: 'a8', source: 'mcptool',      target: 'result',     markerEnd: { type: MarkerType.ArrowClosed } },
]

const ATTESTATIONS = [
  { label: 'AGENT CARD',   status: 'VERIFIED'   },
  { label: 'SIGNATURE',    status: 'VALID'       },
  { label: 'DELEGATION',   status: 'AUTHORIZED'  },
  { label: 'SCOPE',        status: 'RESTRICTED'  },
  { label: 'SANDBOX',      status: 'ACTIVE'      },
  { label: 'RESULT',       status: 'ATTESTED'    },
]

const nodeStyle = (active: boolean): React.CSSProperties => ({
  background: active ? 'rgba(124,255,79,0.1)' : '#050905',
  border: `1px solid ${active ? 'rgba(124,255,79,0.5)' : '#1a2a1e'}`,
  color: active ? '#7CFF4F' : '#9BA39D',
  borderRadius: 6,
  padding: '4px 10px',
  fontSize: 9,
  fontWeight: 700,
  letterSpacing: '0.1em',
  boxShadow: active ? '0 0 16px rgba(124,255,79,0.2)' : 'none',
  transition: 'all 0.4s ease',
  minWidth: 120,
  textAlign: 'center' as const,
})

const ACTIVATION_ORDER = ['orchestrator','card','verify','envelope','specialist','sandbox2','mcptool','result']

export default function A2ADelegationSection() {
  const { ref, visible } = useIntersectionReveal(0.15)
  const [activeNodes, setActiveNodes] = useState<Set<string>>(new Set())
  const [activeAttestations, setActiveAttestations] = useState(0)
  const [nodes, setNodes, onNodesChange] = useNodesState(
    A2A_NODES.map((n) => ({ ...n, style: nodeStyle(false) }))
  )
  const [edges, , onEdgesChange] = useEdgesState(A2A_EDGES)

  useEffect(() => {
    if (!visible) return
    let i = 0
    const activate = () => {
      if (i >= ACTIVATION_ORDER.length) return
      const id = ACTIVATION_ORDER[i]
      setActiveNodes((prev) => new Set([...prev, id]))
      setActiveAttestations(i)
      i++
      setTimeout(activate, 400)
    }
    setTimeout(activate, 400)
  }, [visible])

  useEffect(() => {
    setNodes((nds) =>
      nds.map((n) => ({ ...n, style: nodeStyle(activeNodes.has(n.id)) }))
    )
  }, [activeNodes, setNodes])

  return (
    <section
      id="a2a"
      ref={ref as React.RefObject<HTMLElement>}
      className="section-dark py-24 relative"
      aria-label="A2A delegation flow"
    >
      <div className="max-w-[1400px] mx-auto px-6 md:px-10">
        {/* Heading */}
        <div className="mb-16">
          <span className={`label-tech text-[#5a6660] tracking-[0.2em] reveal ${visible ? 'visible' : ''}`}>
            AGENT-TO-AGENT
          </span>
          <h2 className={`text-display font-black text-white mt-3 reveal reveal-delay-1 ${visible ? 'visible' : ''}`}>
            AGENTS
            <br />
            CAN
            <br />
            <span className="text-[#7CFF4F]">DELEGATE.</span>
          </h2>
          <p className={`mt-4 text-section font-black reveal reveal-delay-2 ${visible ? 'visible' : ''}`}
            style={{ WebkitTextStroke: '1px rgba(255,255,255,0.15)', color: 'transparent' }}
          >
            SECURITY
            <br />
            FOLLOWS
            <br />
            THE TASK.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
          {/* Left: React Flow */}
          <div
            className={`reveal reveal-delay-2 ${visible ? 'visible' : ''}`}
            style={{ height: 540, borderRadius: 12, overflow: 'hidden', border: '1px solid #0f1a11', background: '#030604' }}
          >
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              fitView
              fitViewOptions={{ padding: 0.25 }}
              nodesDraggable={false}
              nodesConnectable={false}
              elementsSelectable={false}
              panOnScroll={false}
              zoomOnScroll={false}
            >
              <Background color="#1a2a1e" gap={32} size={1} />
            </ReactFlow>
          </div>

          {/* Right: Attestation list */}
          <div className={`reveal reveal-delay-3 ${visible ? 'visible' : ''}`}>
            <p className="text-sm text-[#9BA39D] leading-relaxed mb-8 max-w-xs">
              When an AI agent needs to delegate a task to a specialist,
              MCP Guard ensures the delegation is cryptographically verified
              and scope-restricted at every step.
            </p>

            <div className="space-y-3" role="list" aria-label="A2A attestation status">
              {ATTESTATIONS.map((att, i) => {
                const isActive = i <= activeAttestations
                return (
                  <div
                    key={att.label}
                    role="listitem"
                    className="flex items-center justify-between py-3 border-b border-[#0f1a11] transition-all duration-300"
                    style={{ opacity: isActive ? 1 : 0.2 }}
                    aria-label={`${att.label}: ${att.status}`}
                  >
                    <span className="label-tech text-[#9BA39D]">{att.label}</span>
                    <div className="flex items-center gap-2">
                      <div
                        className="w-1.5 h-1.5 rounded-full"
                        style={{
                          background: isActive ? '#7CFF4F' : '#1a2a1e',
                          boxShadow: isActive ? '0 0 6px #7CFF4F' : 'none',
                        }}
                        aria-hidden="true"
                      />
                      <span className="label-tech text-[#7CFF4F]">{att.status}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 divider" aria-hidden="true" />
    </section>
  )
}
