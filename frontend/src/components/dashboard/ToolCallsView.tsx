import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useDashboardStore } from '../../store/dashboardStore';


export const ToolCallsView: React.FC = () => {
  const { toolCallTraces, servers, agents } = useDashboardStore();
  const [filterStatus, setFilterStatus] = useState<'all' | 'success' | 'failed' | 'verified'>('all');
  const [filterRisk, setFilterRisk] = useState<'all' | 'low' | 'medium' | 'high'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Filter traces
  const filteredTraces = useMemo(() => {
    return toolCallTraces.filter(trace => {
      // Status filter
      if (filterStatus === 'success' && !trace.success) return false;
      if (filterStatus === 'failed' && trace.success) return false;
      if (filterStatus === 'verified' && !trace.verified) return false;

      // Risk filter
      if (filterRisk !== 'all' && trace.riskLevel !== filterRisk) return false;

      // Search filter
      if (searchQuery.length > 0) {
        const query = searchQuery.toLowerCase();
        if (
          !trace.toolName.toLowerCase().includes(query) &&
          !trace.serverId.toLowerCase().includes(query) &&
          !trace.agentId.toLowerCase().includes(query)
        ) {
          return false;
        }
      }

      return true;
    });
  }, [toolCallTraces, filterStatus, filterRisk, searchQuery]);

  const getServerName = (serverId: string) => {
    return servers.find(s => s.id === serverId)?.name || serverId;
  };

  const getAgentName = (agentId: string) => {
    return agents.find(a => a.id === agentId)?.name || agentId;
  };



  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'critical': return '#ff0000';
      case 'high': return '#ff4444';
      case 'medium': return '#FE6E44';
      case 'low': return '#7CFF4F';
      default: return '#999';
    }
  };

  const getDurationColor = (duration: number) => {
    if (duration < 200) return '#7CFF4F';
    if (duration < 500) return '#4A9EFF';
    if (duration < 1000) return '#FE6E44';
    return '#ff4444';
  };

  return (
    <div style={{
      padding: '2rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '1.5rem',
      height: '100%',
      overflow: 'auto',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        flexWrap: 'wrap',
        gap: '1rem',
      }}>
        <div>
          <h2 style={{
            fontFamily: 'var(--font-display)',
            fontSize: '1.75rem',
            fontWeight: 900,
            letterSpacing: '0.02em',
            color: '#fff',
            marginBottom: '0.5rem',
          }}>
            TOOL EXECUTION TRACES
          </h2>
          <p style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.9rem',
            color: 'rgba(255,255,255,0.5)',
            maxWidth: '600px',
          }}>
            Detailed execution traces for all tool calls with timing, verification, and sandbox information.
          </p>
        </div>

        {/* Filter Controls */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {/* Search */}
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search tool calls..."
              style={{
                padding: '0.65rem 0.75rem 0.65rem 2.5rem',
                background: 'rgba(0,0,0,0.3)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '6px',
                fontFamily: 'var(--font-body)',
                fontSize: '0.8rem',
                color: '#fff',
                outline: 'none',
                width: '280px',
              }}
              onFocus={(e) => {
                e.currentTarget.style.border = '1px solid rgba(254,110,68,0.5)';
              }}
              onBlur={(e) => {
                e.currentTarget.style.border = '1px solid rgba(255,255,255,0.1)';
              }}
            />
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="rgba(255,255,255,0.3)"
              strokeWidth="2"
              style={{
                position: 'absolute',
                left: '0.75rem',
                top: '50%',
                transform: 'translateY(-50%)',
              }}
            >
              <circle cx="11" cy="11" r="8"/>
              <path d="m21 21-4.35-4.35"/>
            </svg>
          </div>

          {/* Filters */}
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {/* Status Filter */}
            <div style={{
              display: 'flex',
              gap: '0.35rem',
              background: 'rgba(0,0,0,0.3)',
              padding: '0.35rem',
              borderRadius: '6px',
              border: '1px solid rgba(255,255,255,0.08)',
            }}>
              {(['all', 'success', 'failed', 'verified'] as const).map((status) => (
                <button
                  key={status}
                  onClick={() => setFilterStatus(status)}
                  style={{
                    padding: '0.4rem 0.7rem',
                    background: filterStatus === status ? 'rgba(254,110,68,0.2)' : 'transparent',
                    border: filterStatus === status ? '1px solid rgba(254,110,68,0.4)' : '1px solid transparent',
                    borderRadius: '4px',
                    fontFamily: 'var(--font-body)',
                    fontSize: '0.7rem',
                    fontWeight: 600,
                    letterSpacing: '0.03em',
                    color: filterStatus === status ? '#FE6E44' : 'rgba(255,255,255,0.5)',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    textTransform: 'uppercase',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {status}
                </button>
              ))}
            </div>

            {/* Risk Filter */}
            <div style={{
              display: 'flex',
              gap: '0.35rem',
              background: 'rgba(0,0,0,0.3)',
              padding: '0.35rem',
              borderRadius: '6px',
              border: '1px solid rgba(255,255,255,0.08)',
            }}>
              {(['all', 'low', 'medium', 'high'] as const).map((risk) => (
                <button
                  key={risk}
                  onClick={() => setFilterRisk(risk)}
                  style={{
                    padding: '0.4rem 0.7rem',
                    background: filterRisk === risk ? 'rgba(254,110,68,0.2)' : 'transparent',
                    border: filterRisk === risk ? '1px solid rgba(254,110,68,0.4)' : '1px solid transparent',
                    borderRadius: '4px',
                    fontFamily: 'var(--font-body)',
                    fontSize: '0.7rem',
                    fontWeight: 600,
                    letterSpacing: '0.03em',
                    color: filterRisk === risk ? '#FE6E44' : 'rgba(255,255,255,0.5)',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    textTransform: 'uppercase',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {risk}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: '1rem',
      }}>
        {[
          { label: 'Total Calls', value: toolCallTraces.length, color: '#FE6E44' },
          { label: 'Successful', value: toolCallTraces.filter(t => t.success).length, color: '#7CFF4F' },
          { label: 'Failed', value: toolCallTraces.filter(t => !t.success).length, color: '#ff4444' },
          { label: 'Verified', value: toolCallTraces.filter(t => t.verified).length, color: '#4A9EFF' },
          { label: 'Avg Duration', value: `${Math.round(toolCallTraces.reduce((sum, t) => sum + t.duration, 0) / toolCallTraces.length)}ms`, color: '#FE6E44' },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
            style={{
              background: 'rgba(0,0,0,0.3)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '8px',
              padding: '1rem',
            }}
          >
            <div style={{
              fontFamily: 'var(--font-body)',
              fontSize: '0.65rem',
              fontWeight: 600,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.5)',
              marginBottom: '0.4rem',
            }}>
              {stat.label}
            </div>
            <div style={{
              fontFamily: 'var(--font-display)',
              fontSize: '1.6rem',
              fontWeight: 700,
              color: stat.color,
            }}>
              {stat.value}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Execution Traces List */}
      <div style={{
        background: 'rgba(0,0,0,0.3)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '8px',
        overflow: 'hidden',
      }}>
        {/* Table Header */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1.5fr 1fr 1fr 0.8fr 0.6fr 0.8fr 80px',
          gap: '1rem',
          padding: '1rem 1.5rem',
          background: 'rgba(254,110,68,0.05)',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
        }}>
          {['Tool', 'Server', 'Agent', 'Duration', 'Status', 'Risk', 'Verified'].map((header) => (
            <div
              key={header}
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '0.7rem',
                fontWeight: 700,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.5)',
              }}
            >
              {header}
            </div>
          ))}
        </div>

        {/* Table Body */}
        <div style={{ maxHeight: 'calc(100vh - 500px)', overflowY: 'auto' }}>
          {filteredTraces.map((trace, index) => {

            const durationColor = getDurationColor(trace.duration);

            return (
              <motion.div
                key={trace.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.03 }}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1.5fr 1fr 1fr 0.8fr 0.6fr 0.8fr 80px',
                  gap: '1rem',
                  padding: '1.25rem 1.5rem',
                  borderBottom: '1px solid rgba(255,255,255,0.03)',
                  alignItems: 'center',
                  transition: 'background 0.2s',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.02)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                {/* Tool Name */}
                <div>
                  <div style={{
                    fontFamily: 'monospace',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    color: '#fff',
                    marginBottom: '0.25rem',
                  }}>
                    {trace.toolName}
                  </div>
                  <div style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: '0.65rem',
                    color: 'rgba(255,255,255,0.4)',
                  }}>
                    {trace.timestamp}
                  </div>
                </div>

                {/* Server */}
                <div style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.75rem',
                  color: 'rgba(255,255,255,0.7)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {getServerName(trace.serverId)}
                </div>

                {/* Agent */}
                <div style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.75rem',
                  color: 'rgba(255,255,255,0.7)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {getAgentName(trace.agentId)}
                </div>

                {/* Duration */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}>
                  <div style={{
                    width: '4px',
                    height: '24px',
                    background: durationColor,
                    borderRadius: '2px',
                    boxShadow: `0 0 8px ${durationColor}`,
                  }} />
                  <span style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    color: durationColor,
                  }}>
                    {trace.duration}ms
                  </span>
                </div>

                {/* Status */}
                <div>
                  {trace.success ? (
                    <div style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      padding: '0.3rem 0.6rem',
                      background: 'rgba(124,255,79,0.15)',
                      border: '1px solid rgba(124,255,79,0.3)',
                      borderRadius: '4px',
                    }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#7CFF4F" strokeWidth="3">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                      <span style={{
                        fontFamily: 'var(--font-body)',
                        fontSize: '0.65rem',
                        fontWeight: 700,
                        color: '#7CFF4F',
                        textTransform: 'uppercase',
                      }}>
                        Success
                      </span>
                    </div>
                  ) : (
                    <div style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      padding: '0.3rem 0.6rem',
                      background: 'rgba(255,68,68,0.15)',
                      border: '1px solid rgba(255,68,68,0.3)',
                      borderRadius: '4px',
                    }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ff4444" strokeWidth="3">
                        <line x1="18" y1="6" x2="6" y2="18"/>
                        <line x1="6" y1="6" x2="18" y2="18"/>
                      </svg>
                      <span style={{
                        fontFamily: 'var(--font-body)',
                        fontSize: '0.65rem',
                        fontWeight: 700,
                        color: '#ff4444',
                        textTransform: 'uppercase',
                      }}>
                        Failed
                      </span>
                    </div>
                  )}
                </div>

                {/* Risk Level */}
                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  padding: '0.3rem 0.6rem',
                  background: `${getRiskColor(trace.riskLevel)}15`,
                  border: `1px solid ${getRiskColor(trace.riskLevel)}30`,
                  borderRadius: '4px',
                }}>
                  <div style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    background: getRiskColor(trace.riskLevel),
                    boxShadow: `0 0 6px ${getRiskColor(trace.riskLevel)}`,
                  }} />
                  <span style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: '0.65rem',
                    fontWeight: 700,
                    color: getRiskColor(trace.riskLevel),
                    textTransform: 'uppercase',
                  }}>
                    {trace.riskLevel}
                  </span>
                </div>

                {/* Verified */}
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  {trace.verified ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7CFF4F" strokeWidth="2.5">
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                      <polyline points="22 4 12 14.01 9 11.01"/>
                    </svg>
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="2">
                      <circle cx="12" cy="12" r="10"/>
                      <line x1="15" y1="9" x2="9" y2="15"/>
                      <line x1="9" y1="9" x2="15" y2="15"/>
                    </svg>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Empty State */}
        {filteredTraces.length === 0 && (
          <div style={{
            padding: '4rem 2rem',
            textAlign: 'center',
          }}>
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" style={{ margin: '0 auto 1rem' }}>
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
            </svg>
            <div style={{
              fontFamily: 'var(--font-display)',
              fontSize: '1.25rem',
              fontWeight: 700,
              color: 'rgba(255,255,255,0.5)',
              marginBottom: '0.5rem',
            }}>
              No Tool Calls Found
            </div>
            <div style={{
              fontFamily: 'var(--font-body)',
              fontSize: '0.85rem',
              color: 'rgba(255,255,255,0.3)',
            }}>
              {searchQuery ? 'Try adjusting your search or filters' : 'No calls match the selected filters'}
            </div>
          </div>
        )}
      </div>

      {/* Trace Details Section */}
      {filteredTraces.length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '1.5rem',
        }}>
          {/* Input/Output Hashes */}
          <div style={{
            background: 'rgba(0,0,0,0.3)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '8px',
            padding: '1.5rem',
          }}>
            <div style={{
              fontFamily: 'var(--font-display)',
              fontSize: '1rem',
              fontWeight: 700,
              letterSpacing: '0.05em',
              color: '#fff',
              marginBottom: '1rem',
              textTransform: 'uppercase',
            }}>
              Hash Verification
            </div>
            <div style={{
              fontFamily: 'var(--font-body)',
              fontSize: '0.8rem',
              color: 'rgba(255,255,255,0.6)',
              marginBottom: '1rem',
            }}>
              All tool calls include cryptographic hashes of input and output for tamper detection and audit trail verification.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{
                padding: '0.75rem',
                background: 'rgba(255,255,255,0.02)',
                borderRadius: '6px',
                border: '1px solid rgba(255,255,255,0.05)',
              }}>
                <div style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.65rem',
                  color: 'rgba(255,255,255,0.4)',
                  marginBottom: '0.35rem',
                }}>
                  Input Hash Example
                </div>
                <div style={{
                  fontFamily: 'monospace',
                  fontSize: '0.75rem',
                  color: '#4A9EFF',
                  wordBreak: 'break-all',
                }}>
                  {filteredTraces[0].inputHash}...
                </div>
              </div>
              <div style={{
                padding: '0.75rem',
                background: 'rgba(255,255,255,0.02)',
                borderRadius: '6px',
                border: '1px solid rgba(255,255,255,0.05)',
              }}>
                <div style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.65rem',
                  color: 'rgba(255,255,255,0.4)',
                  marginBottom: '0.35rem',
                }}>
                  Output Hash Example
                </div>
                <div style={{
                  fontFamily: 'monospace',
                  fontSize: '0.75rem',
                  color: '#7CFF4F',
                  wordBreak: 'break-all',
                }}>
                  {filteredTraces[0].outputHash}...
                </div>
              </div>
            </div>
          </div>

          {/* Sandbox Execution Info */}
          <div style={{
            background: 'rgba(0,0,0,0.3)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '8px',
            padding: '1.5rem',
          }}>
            <div style={{
              fontFamily: 'var(--font-display)',
              fontSize: '1rem',
              fontWeight: 700,
              letterSpacing: '0.05em',
              color: '#fff',
              marginBottom: '1rem',
              textTransform: 'uppercase',
            }}>
              Sandbox Execution
            </div>
            <div style={{
              fontFamily: 'var(--font-body)',
              fontSize: '0.8rem',
              color: 'rgba(255,255,255,0.6)',
              marginBottom: '1rem',
            }}>
              {toolCallTraces.filter(t => t.sandboxId).length} of {toolCallTraces.length} tool calls were executed in isolated sandbox environments for enhanced security.
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '1rem',
            }}>
              <div style={{
                padding: '1rem',
                background: 'rgba(124,255,79,0.05)',
                border: '1px solid rgba(124,255,79,0.15)',
                borderRadius: '6px',
                textAlign: 'center',
              }}>
                <div style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '2rem',
                  fontWeight: 700,
                  color: '#7CFF4F',
                  marginBottom: '0.25rem',
                }}>
                  {toolCallTraces.filter(t => t.sandboxId).length}
                </div>
                <div style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.7rem',
                  color: 'rgba(255,255,255,0.5)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}>
                  Sandboxed
                </div>
              </div>
              <div style={{
                padding: '1rem',
                background: 'rgba(254,110,68,0.05)',
                border: '1px solid rgba(254,110,68,0.15)',
                borderRadius: '6px',
                textAlign: 'center',
              }}>
                <div style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '2rem',
                  fontWeight: 700,
                  color: '#FE6E44',
                  marginBottom: '0.25rem',
                }}>
                  {toolCallTraces.filter(t => !t.sandboxId).length}
                </div>
                <div style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.7rem',
                  color: 'rgba(255,255,255,0.5)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}>
                  Direct
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
