import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDashboardStore } from '../../store/dashboardStore';

export const NodeInspector: React.FC = () => {
  const { inspectorOpen, selectedNodeId, topologyNodes, servers, agents, closeInspector } = useDashboardStore();

  const selectedNode = topologyNodes.find(n => n.id === selectedNodeId);
  
  if (!inspectorOpen || !selectedNode) return null;

  // Get detailed data
  const serverData = selectedNode.type === 'server' ? servers.find(s => s.id === selectedNode.id) : null;
  const agentData = selectedNode.type === 'agent' ? agents.find(a => a.id === selectedNode.id) : null;

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'critical': return '#ff0000';
      case 'high': return '#ff4444';
      case 'medium': return '#FE6E44';
      default: return '#7CFF4F';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'operational':
      case 'active':
        return '#7CFF4F';
      case 'warning':
        return '#ffaa00';
      case 'idle':
        return '#666666';
      default:
        return '#ff4444';
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        style={{
          position: 'fixed',
          right: 0,
          top: 0,
          bottom: 0,
          width: '420px',
          background: '#0A0A0A',
          borderLeft: '1px solid rgba(254,110,68,0.2)',
          zIndex: 60,
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '-10px 0 40px rgba(0,0,0,0.5)',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '1.5rem',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <div>
            <div style={{
              fontFamily: 'var(--font-body)',
              fontSize: '0.65rem',
              fontWeight: 600,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.5)',
              marginBottom: '0.5rem',
            }}>
              {selectedNode.type === 'server' ? 'MCP SERVER' : 'AGENT'} INSPECTOR
            </div>
            <div style={{
              fontFamily: 'var(--font-display)',
              fontSize: '1.1rem',
              fontWeight: 700,
              color: '#fff',
            }}>
              {selectedNode.name}
            </div>
          </div>
          <button
            onClick={closeInspector}
            style={{
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '4px',
              color: 'rgba(255,255,255,0.6)',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
              e.currentTarget.style.color = '#fff';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
              e.currentTarget.style.color = 'rgba(255,255,255,0.6)';
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Content */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '1.5rem',
        }}>
          {/* Status Section */}
          <div style={{ marginBottom: '2rem' }}>
            <div style={{
              fontFamily: 'var(--font-body)',
              fontSize: '0.7rem',
              fontWeight: 600,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.4)',
              marginBottom: '1rem',
            }}>
              STATUS
            </div>
            
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '1rem',
            }}>
              <div style={{
                padding: '1rem',
                background: 'rgba(0,0,0,0.3)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: '6px',
              }}>
                <div style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.65rem',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: 'rgba(255,255,255,0.4)',
                  marginBottom: '0.5rem',
                }}>
                  Status
                </div>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}>
                  <div style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: getStatusColor(selectedNode.status),
                    boxShadow: `0 0 8px ${getStatusColor(selectedNode.status)}`,
                  }} />
                  <span style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    color: getStatusColor(selectedNode.status),
                  }}>
                    {selectedNode.status}
                  </span>
                </div>
              </div>

              <div style={{
                padding: '1rem',
                background: 'rgba(0,0,0,0.3)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: '6px',
              }}>
                <div style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.65rem',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: 'rgba(255,255,255,0.4)',
                  marginBottom: '0.5rem',
                }}>
                  Risk Level
                </div>
                <div style={{
                  display: 'inline-flex',
                  padding: '0.3rem 0.6rem',
                  background: `${getRiskColor(selectedNode.riskLevel)}15`,
                  border: `1px solid ${getRiskColor(selectedNode.riskLevel)}40`,
                  borderRadius: '4px',
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: getRiskColor(selectedNode.riskLevel),
                }}>
                  {selectedNode.riskLevel}
                </div>
              </div>
            </div>
          </div>

          {/* Server-specific Details */}
          {serverData && (
            <>
              <div style={{ marginBottom: '2rem' }}>
                <div style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  color: 'rgba(255,255,255,0.4)',
                  marginBottom: '1rem',
                }}>
                  SERVER DETAILS
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div>
                    <div style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: '0.65rem',
                      color: 'rgba(255,255,255,0.4)',
                      marginBottom: '0.25rem',
                    }}>
                      Endpoint
                    </div>
                    <div style={{
                      fontFamily: "'SF Mono', 'Courier New', monospace",
                      fontSize: '0.75rem',
                      color: '#FE6E44',
                    }}>
                      {serverData.endpoint}
                    </div>
                  </div>

                  <div>
                    <div style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: '0.65rem',
                      color: 'rgba(255,255,255,0.4)',
                      marginBottom: '0.25rem',
                    }}>
                      Version
                    </div>
                    <div style={{
                      fontFamily: "'SF Mono', 'Courier New', monospace",
                      fontSize: '0.75rem',
                      color: 'rgba(255,255,255,0.7)',
                    }}>
                      {serverData.version}
                    </div>
                  </div>

                  <div>
                    <div style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: '0.65rem',
                      color: 'rgba(255,255,255,0.4)',
                      marginBottom: '0.25rem',
                    }}>
                      Tools Available
                    </div>
                    <div style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: '1.25rem',
                      fontWeight: 700,
                      color: '#FE6E44',
                    }}>
                      {serverData.tools}
                    </div>
                  </div>

                  <div>
                    <div style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: '0.65rem',
                      color: 'rgba(255,255,255,0.4)',
                      marginBottom: '0.25rem',
                    }}>
                      Last Security Scan
                    </div>
                    <div style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: '0.75rem',
                      color: 'rgba(255,255,255,0.7)',
                    }}>
                      {serverData.lastScan}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Agent-specific Details */}
          {agentData && (
            <>
              <div style={{ marginBottom: '2rem' }}>
                <div style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  color: 'rgba(255,255,255,0.4)',
                  marginBottom: '1rem',
                }}>
                  AGENT METRICS
                </div>
                
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '1rem',
                  marginBottom: '1rem',
                }}>
                  <div style={{
                    padding: '1rem',
                    background: 'rgba(0,0,0,0.3)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: '6px',
                  }}>
                    <div style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: '0.65rem',
                      color: 'rgba(255,255,255,0.4)',
                      marginBottom: '0.5rem',
                    }}>
                      Connections
                    </div>
                    <div style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: '1.5rem',
                      fontWeight: 700,
                      color: '#FE6E44',
                    }}>
                      {agentData.connections}
                    </div>
                  </div>

                  <div style={{
                    padding: '1rem',
                    background: 'rgba(0,0,0,0.3)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: '6px',
                  }}>
                    <div style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: '0.65rem',
                      color: 'rgba(255,255,255,0.4)',
                      marginBottom: '0.5rem',
                    }}>
                      Tool Calls
                    </div>
                    <div style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: '1.5rem',
                      fontWeight: 700,
                      color: '#fff',
                    }}>
                      {agentData.toolCalls.toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Connections */}
          <div style={{ marginBottom: '2rem' }}>
            <div style={{
              fontFamily: 'var(--font-body)',
              fontSize: '0.7rem',
              fontWeight: 600,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.4)',
              marginBottom: '1rem',
            }}>
              CONNECTIONS ({selectedNode.connections.length})
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {selectedNode.connections.slice(0, 5).map(connId => {
                const connNode = topologyNodes.find(n => n.id === connId);
                return connNode ? (
                  <div
                    key={connId}
                    style={{
                      padding: '0.75rem',
                      background: 'rgba(0,0,0,0.3)',
                      border: '1px solid rgba(255,255,255,0.06)',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(254,110,68,0.05)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(0,0,0,0.3)'}
                  >
                    <div style={{
                      fontFamily: "'SF Mono', 'Courier New', monospace",
                      fontSize: '0.75rem',
                      color: '#fff',
                      marginBottom: '0.25rem',
                    }}>
                      {connNode.name}
                    </div>
                    <div style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: '0.65rem',
                      color: 'rgba(255,255,255,0.4)',
                    }}>
                      {connNode.type.toUpperCase()}
                    </div>
                  </div>
                ) : null;
              })}
            </div>
          </div>

          {/* Activity */}
          <div>
            <div style={{
              fontFamily: 'var(--font-body)',
              fontSize: '0.7rem',
              fontWeight: 600,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.4)',
              marginBottom: '1rem',
            }}>
              LAST ACTIVITY
            </div>
            
            <div style={{
              padding: '1rem',
              background: 'rgba(0,0,0,0.3)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: '6px',
            }}>
              <div style={{
                fontFamily: 'var(--font-body)',
                fontSize: '0.9rem',
                color: 'rgba(255,255,255,0.7)',
              }}>
                {selectedNode.metadata.lastActivity}
              </div>
            </div>
          </div>
        </div>

        {/* Actions Footer */}
        <div style={{
          padding: '1.5rem',
          borderTop: '1px solid rgba(255,255,255,0.06)',
          display: 'flex',
          gap: '0.75rem',
        }}>
          <button style={{
            flex: 1,
            padding: '0.75rem',
            background: 'rgba(254,110,68,0.1)',
            border: '1px solid rgba(254,110,68,0.3)',
            borderRadius: '6px',
            color: '#FE6E44',
            fontFamily: 'var(--font-body)',
            fontSize: '0.75rem',
            fontWeight: 600,
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(254,110,68,0.15)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(254,110,68,0.1)'}
          >
            View Details
          </button>
          <button style={{
            flex: 1,
            padding: '0.75rem',
            background: 'rgba(0,0,0,0.3)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '6px',
            color: 'rgba(255,255,255,0.7)',
            fontFamily: 'var(--font-body)',
            fontSize: '0.75rem',
            fontWeight: 600,
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(0,0,0,0.3)'}
          >
            Run Scan
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
