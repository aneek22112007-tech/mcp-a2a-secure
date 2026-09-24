import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDashboardStore } from '../../store/dashboardStore';
import type { A2ATask } from '../../data/dashboardMockData';

export const A2ADelegationView: React.FC = () => {
  const { a2aTasks, agents } = useDashboardStore();
  const [selectedTask, setSelectedTask] = useState<A2ATask | null>(null);
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'completed' | 'failed'>('all');

  // Filter tasks
  const filteredTasks = a2aTasks.filter(task => {
    if (filterStatus === 'all') return true;
    if (filterStatus === 'active') return task.status === 'active' || task.status === 'pending' || task.status === 'delegated';
    return task.status === filterStatus;
  });

  // Group tasks by manager
  const tasksByManager = filteredTasks.reduce((acc, task) => {
    if (!acc[task.managerAgent]) {
      acc[task.managerAgent] = [];
    }
    acc[task.managerAgent].push(task);
    return acc;
  }, {} as Record<string, A2ATask[]>);

  const getAgentName = (agentId: string) => {
    return agents.find(a => a.id === agentId)?.name || agentId;
  };

  const getStatusColor = (status: A2ATask['status']) => {
    switch (status) {
      case 'completed': return '#7CFF4F';
      case 'active': return '#FE6E44';
      case 'delegated': return '#4A9EFF';
      case 'pending': return '#FFA726';
      case 'failed': return '#ff4444';
      default: return '#999';
    }
  };

  const getPriorityColor = (priority: A2ATask['priority']) => {
    switch (priority) {
      case 'critical': return '#ff0000';
      case 'high': return '#ff4444';
      case 'medium': return '#FE6E44';
      case 'low': return '#7CFF4F';
      default: return '#999';
    }
  };

  const getRiskColor = (riskLevel: A2ATask['riskLevel']) => {
    switch (riskLevel) {
      case 'critical': return '#ff0000';
      case 'high': return '#ff4444';
      case 'medium': return '#FE6E44';
      case 'low': return '#7CFF4F';
      default: return '#999';
    }
  };

  const getVerificationIcon = (status: A2ATask['verificationStatus']) => {
    switch (status) {
      case 'verified':
        return (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7CFF4F" strokeWidth="2.5">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
            <polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
        );
      case 'failed':
        return (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ff4444" strokeWidth="2.5">
            <circle cx="12" cy="12" r="10"/>
            <line x1="15" y1="9" x2="9" y2="15"/>
            <line x1="9" y1="9" x2="15" y2="15"/>
          </svg>
        );
      default:
        return (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FFA726" strokeWidth="2.5">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="16" x2="12" y2="12"/>
            <line x1="12" y1="8" x2="12.01" y2="8"/>
          </svg>
        );
    }
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
            A2A DELEGATION
          </h2>
          <p style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.9rem',
            color: 'rgba(255,255,255,0.5)',
            maxWidth: '600px',
          }}>
            Monitor agent-to-agent task delegation and execution flows. Track manager-worker relationships and verification status.
          </p>
        </div>

        {/* Status Filter */}
        <div style={{
          display: 'flex',
          gap: '0.5rem',
          background: 'rgba(0,0,0,0.3)',
          padding: '0.35rem',
          borderRadius: '6px',
          border: '1px solid rgba(255,255,255,0.08)',
        }}>
          {(['all', 'active', 'completed', 'failed'] as const).map((status) => (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              style={{
                padding: '0.5rem 1rem',
                background: filterStatus === status ? 'rgba(254,110,68,0.2)' : 'transparent',
                border: filterStatus === status ? '1px solid rgba(254,110,68,0.4)' : '1px solid transparent',
                borderRadius: '4px',
                fontFamily: 'var(--font-body)',
                fontSize: '0.75rem',
                fontWeight: 600,
                letterSpacing: '0.05em',
                color: filterStatus === status ? '#FE6E44' : 'rgba(255,255,255,0.5)',
                cursor: 'pointer',
                transition: 'all 0.2s',
                textTransform: 'uppercase',
              }}
              onMouseEnter={(e) => {
                if (filterStatus !== status) {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                  e.currentTarget.style.color = 'rgba(255,255,255,0.8)';
                }
              }}
              onMouseLeave={(e) => {
                if (filterStatus !== status) {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = 'rgba(255,255,255,0.5)';
                }
              }}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      {/* Stats Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '1rem',
      }}>
        {[
          { label: 'Total Tasks', value: a2aTasks.length, color: '#FE6E44' },
          { label: 'Active', value: a2aTasks.filter(t => t.status === 'active').length, color: '#FE6E44' },
          { label: 'Completed', value: a2aTasks.filter(t => t.status === 'completed').length, color: '#7CFF4F' },
          { label: 'Failed', value: a2aTasks.filter(t => t.status === 'failed').length, color: '#ff4444' },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            style={{
              background: 'rgba(0,0,0,0.3)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '8px',
              padding: '1.25rem',
            }}
          >
            <div style={{
              fontFamily: 'var(--font-body)',
              fontSize: '0.7rem',
              fontWeight: 600,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.5)',
              marginBottom: '0.5rem',
            }}>
              {stat.label}
            </div>
            <div style={{
              fontFamily: 'var(--font-display)',
              fontSize: '2rem',
              fontWeight: 700,
              color: stat.color,
            }}>
              {stat.value}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Delegation Flow Visualization */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '1.5rem',
      }}>
        {Object.entries(tasksByManager).map(([managerId, tasks]) => {
          const managerName = getAgentName(managerId);
          
          return (
            <motion.div
              key={managerId}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              style={{
                background: 'rgba(0,0,0,0.3)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '8px',
                overflow: 'hidden',
              }}
            >
              {/* Manager Header */}
              <div style={{
                padding: '1.25rem',
                background: 'rgba(254,110,68,0.05)',
                borderBottom: '1px solid rgba(255,255,255,0.05)',
                display: 'flex',
                alignItems: 'center',
                gap: '1rem',
              }}>
                <div style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, rgba(254,110,68,0.2), rgba(254,110,68,0.05))',
                  border: '2px solid rgba(254,110,68,0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FE6E44" strokeWidth="2">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                    <circle cx="9" cy="7" r="4"/>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                  </svg>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: '0.7rem',
                    fontWeight: 600,
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    color: 'rgba(255,255,255,0.5)',
                    marginBottom: '0.25rem',
                  }}>
                    Manager Agent
                  </div>
                  <div style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: '1.1rem',
                    fontWeight: 700,
                    color: '#fff',
                  }}>
                    {managerName}
                  </div>
                </div>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.5rem 1rem',
                  background: 'rgba(254,110,68,0.15)',
                  borderRadius: '4px',
                }}>
                  <span style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: '0.7rem',
                    color: 'rgba(255,255,255,0.5)',
                  }}>
                    Delegated Tasks:
                  </span>
                  <span style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: '0.9rem',
                    fontWeight: 700,
                    color: '#FE6E44',
                  }}>
                    {tasks.length}
                  </span>
                </div>
              </div>

              {/* Worker Tasks */}
              <div style={{ padding: '1.25rem' }}>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                  gap: '1rem',
                }}>
                  {tasks.map((task) => {
                    const workerName = getAgentName(task.workerAgent);
                    
                    return (
                      <motion.div
                        key={task.id}
                        whileHover={{ scale: 1.02 }}
                        onClick={() => setSelectedTask(task)}
                        style={{
                          background: 'rgba(255,255,255,0.02)',
                          border: '1px solid rgba(255,255,255,0.08)',
                          borderRadius: '6px',
                          padding: '1rem',
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                          position: 'relative',
                          overflow: 'hidden',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                          e.currentTarget.style.borderColor = 'rgba(254,110,68,0.3)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'rgba(255,255,255,0.02)';
                          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
                        }}
                      >
                        {/* Status Bar */}
                        <div style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          right: 0,
                          height: '3px',
                          background: getStatusColor(task.status),
                          boxShadow: `0 0 8px ${getStatusColor(task.status)}`,
                        }} />

                        {/* Task Header */}
                        <div style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'flex-start',
                          marginBottom: '0.75rem',
                        }}>
                          <div style={{ flex: 1 }}>
                            <div style={{
                              fontFamily: 'var(--font-display)',
                              fontSize: '0.9rem',
                              fontWeight: 700,
                              color: '#fff',
                              marginBottom: '0.25rem',
                            }}>
                              {task.title}
                            </div>
                            <div style={{
                              fontFamily: 'var(--font-body)',
                              fontSize: '0.7rem',
                              color: 'rgba(255,255,255,0.4)',
                            }}>
                              {task.id}
                            </div>
                          </div>
                          {getVerificationIcon(task.verificationStatus)}
                        </div>

                        {/* Worker Info */}
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.75rem',
                          padding: '0.75rem',
                          background: 'rgba(0,0,0,0.3)',
                          borderRadius: '4px',
                          marginBottom: '0.75rem',
                        }}>
                          <div style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '50%',
                            background: 'linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0.05))',
                            border: '1px solid rgba(255,255,255,0.2)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
                              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                              <circle cx="12" cy="7" r="4"/>
                            </svg>
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{
                              fontFamily: 'var(--font-body)',
                              fontSize: '0.65rem',
                              color: 'rgba(255,255,255,0.4)',
                              marginBottom: '0.15rem',
                            }}>
                              Worker Agent
                            </div>
                            <div style={{
                              fontFamily: 'var(--font-body)',
                              fontSize: '0.8rem',
                              fontWeight: 600,
                              color: '#fff',
                            }}>
                              {workerName}
                            </div>
                          </div>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2">
                            <line x1="5" y1="12" x2="19" y2="12"/>
                            <polyline points="12 5 19 12 12 19"/>
                          </svg>
                        </div>

                        {/* Task Metadata */}
                        <div style={{
                          display: 'grid',
                          gridTemplateColumns: '1fr 1fr',
                          gap: '0.5rem',
                          marginBottom: '0.75rem',
                        }}>
                          <div>
                            <div style={{
                              fontFamily: 'var(--font-body)',
                              fontSize: '0.65rem',
                              color: 'rgba(255,255,255,0.4)',
                              marginBottom: '0.25rem',
                            }}>
                              Status
                            </div>
                            <div style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.35rem',
                              padding: '0.25rem 0.5rem',
                              background: `${getStatusColor(task.status)}20`,
                              border: `1px solid ${getStatusColor(task.status)}40`,
                              borderRadius: '3px',
                            }}>
                              <div style={{
                                width: '6px',
                                height: '6px',
                                borderRadius: '50%',
                                background: getStatusColor(task.status),
                                boxShadow: `0 0 4px ${getStatusColor(task.status)}`,
                              }} />
                              <span style={{
                                fontFamily: 'var(--font-body)',
                                fontSize: '0.7rem',
                                fontWeight: 600,
                                color: getStatusColor(task.status),
                                textTransform: 'uppercase',
                              }}>
                                {task.status}
                              </span>
                            </div>
                          </div>

                          <div>
                            <div style={{
                              fontFamily: 'var(--font-body)',
                              fontSize: '0.65rem',
                              color: 'rgba(255,255,255,0.4)',
                              marginBottom: '0.25rem',
                            }}>
                              Priority
                            </div>
                            <div style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.35rem',
                              padding: '0.25rem 0.5rem',
                              background: `${getPriorityColor(task.priority)}20`,
                              border: `1px solid ${getPriorityColor(task.priority)}40`,
                              borderRadius: '3px',
                            }}>
                              <span style={{
                                fontFamily: 'var(--font-body)',
                                fontSize: '0.7rem',
                                fontWeight: 600,
                                color: getPriorityColor(task.priority),
                                textTransform: 'uppercase',
                              }}>
                                {task.priority}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Footer */}
                        <div style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          paddingTop: '0.75rem',
                          borderTop: '1px solid rgba(255,255,255,0.05)',
                        }}>
                          <div style={{
                            fontFamily: 'var(--font-body)',
                            fontSize: '0.7rem',
                            color: 'rgba(255,255,255,0.4)',
                          }}>
                            {task.createdAt}
                          </div>
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                          }}>
                            <div style={{
                              width: '6px',
                              height: '6px',
                              borderRadius: '50%',
                              background: getRiskColor(task.riskLevel),
                            }} />
                            <span style={{
                              fontFamily: 'var(--font-body)',
                              fontSize: '0.7rem',
                              color: getRiskColor(task.riskLevel),
                              textTransform: 'uppercase',
                            }}>
                              {task.riskLevel} Risk
                            </span>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Task Detail Modal */}
      <AnimatePresence>
        {selectedTask && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedTask(null)}
              style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0,0,0,0.8)',
                backdropFilter: 'blur(4px)',
                zIndex: 1000,
              }}
            />

            {/* Modal */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              style={{
                position: 'fixed',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: '90%',
                maxWidth: '600px',
                maxHeight: '80vh',
                background: 'rgba(5,5,5,0.98)',
                border: '1px solid rgba(254,110,68,0.3)',
                borderRadius: '12px',
                overflow: 'hidden',
                zIndex: 1001,
              }}
            >
              {/* Modal Header */}
              <div style={{
                padding: '1.5rem',
                background: 'rgba(254,110,68,0.05)',
                borderBottom: '1px solid rgba(255,255,255,0.08)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: '0.7rem',
                    fontWeight: 600,
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    color: 'rgba(255,255,255,0.5)',
                    marginBottom: '0.5rem',
                  }}>
                    A2A Task Details
                  </div>
                  <div style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: '1.25rem',
                    fontWeight: 700,
                    color: '#fff',
                  }}>
                    {selectedTask.title}
                  </div>
                </div>
                <button
                  onClick={() => setSelectedTask(null)}
                  style={{
                    width: '32px',
                    height: '32px',
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(254,110,68,0.2)';
                    e.currentTarget.style.borderColor = 'rgba(254,110,68,0.5)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>

              {/* Modal Content */}
              <div style={{
                padding: '1.5rem',
                overflowY: 'auto',
                maxHeight: 'calc(80vh - 120px)',
              }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  {/* Delegation Flow */}
                  <div>
                    <div style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: '0.7rem',
                      fontWeight: 600,
                      letterSpacing: '0.1em',
                      textTransform: 'uppercase',
                      color: 'rgba(255,255,255,0.5)',
                      marginBottom: '1rem',
                    }}>
                      Delegation Flow
                    </div>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '1rem',
                    }}>
                      <div style={{
                        flex: 1,
                        padding: '1rem',
                        background: 'rgba(254,110,68,0.1)',
                        border: '1px solid rgba(254,110,68,0.3)',
                        borderRadius: '6px',
                        textAlign: 'center',
                      }}>
                        <div style={{
                          fontFamily: 'var(--font-body)',
                          fontSize: '0.65rem',
                          color: 'rgba(255,255,255,0.5)',
                          marginBottom: '0.5rem',
                        }}>
                          Manager
                        </div>
                        <div style={{
                          fontFamily: 'var(--font-display)',
                          fontSize: '0.95rem',
                          fontWeight: 700,
                          color: '#FE6E44',
                        }}>
                          {getAgentName(selectedTask.managerAgent)}
                        </div>
                      </div>

                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FE6E44" strokeWidth="2">
                        <line x1="5" y1="12" x2="19" y2="12"/>
                        <polyline points="12 5 19 12 12 19"/>
                      </svg>

                      <div style={{
                        flex: 1,
                        padding: '1rem',
                        background: 'rgba(255,255,255,0.05)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '6px',
                        textAlign: 'center',
                      }}>
                        <div style={{
                          fontFamily: 'var(--font-body)',
                          fontSize: '0.65rem',
                          color: 'rgba(255,255,255,0.5)',
                          marginBottom: '0.5rem',
                        }}>
                          Worker
                        </div>
                        <div style={{
                          fontFamily: 'var(--font-display)',
                          fontSize: '0.95rem',
                          fontWeight: 700,
                          color: '#fff',
                        }}>
                          {getAgentName(selectedTask.workerAgent)}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Task Attributes */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '1rem',
                  }}>
                    {[
                      { label: 'Status', value: selectedTask.status, color: getStatusColor(selectedTask.status) },
                      { label: 'Priority', value: selectedTask.priority, color: getPriorityColor(selectedTask.priority) },
                      { label: 'Risk Level', value: selectedTask.riskLevel, color: getRiskColor(selectedTask.riskLevel) },
                      { label: 'Verification', value: selectedTask.verificationStatus, color: selectedTask.verificationStatus === 'verified' ? '#7CFF4F' : selectedTask.verificationStatus === 'failed' ? '#ff4444' : '#FFA726' },
                    ].map((attr) => (
                      <div key={attr.label}>
                        <div style={{
                          fontFamily: 'var(--font-body)',
                          fontSize: '0.7rem',
                          color: 'rgba(255,255,255,0.5)',
                          marginBottom: '0.5rem',
                        }}>
                          {attr.label}
                        </div>
                        <div style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          padding: '0.5rem 0.75rem',
                          background: `${attr.color}20`,
                          border: `1px solid ${attr.color}40`,
                          borderRadius: '4px',
                        }}>
                          <div style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            background: attr.color,
                            boxShadow: `0 0 6px ${attr.color}`,
                          }} />
                          <span style={{
                            fontFamily: 'var(--font-body)',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            color: attr.color,
                            textTransform: 'uppercase',
                          }}>
                            {attr.value}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Tools Used */}
                  <div>
                    <div style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: '0.7rem',
                      fontWeight: 600,
                      letterSpacing: '0.1em',
                      textTransform: 'uppercase',
                      color: 'rgba(255,255,255,0.5)',
                      marginBottom: '0.75rem',
                    }}>
                      Tools Used ({selectedTask.toolsUsed.length})
                    </div>
                    <div style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '0.5rem',
                    }}>
                      {selectedTask.toolsUsed.map((tool) => (
                        <div
                          key={tool}
                          style={{
                            padding: '0.5rem 0.75rem',
                            background: 'rgba(255,255,255,0.05)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: '4px',
                            fontFamily: 'monospace',
                            fontSize: '0.75rem',
                            color: 'rgba(255,255,255,0.8)',
                          }}
                        >
                          {tool}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Timestamps */}
                  <div style={{
                    padding: '1rem',
                    background: 'rgba(0,0,0,0.3)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '6px',
                  }}>
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginBottom: '0.5rem',
                    }}>
                      <span style={{
                        fontFamily: 'var(--font-body)',
                        fontSize: '0.75rem',
                        color: 'rgba(255,255,255,0.5)',
                      }}>
                        Created
                      </span>
                      <span style={{
                        fontFamily: 'var(--font-body)',
                        fontSize: '0.75rem',
                        color: 'rgba(255,255,255,0.8)',
                      }}>
                        {selectedTask.createdAt}
                      </span>
                    </div>
                    {selectedTask.completedAt && (
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                      }}>
                        <span style={{
                          fontFamily: 'var(--font-body)',
                          fontSize: '0.75rem',
                          color: 'rgba(255,255,255,0.5)',
                        }}>
                          Completed
                        </span>
                        <span style={{
                          fontFamily: 'var(--font-body)',
                          fontSize: '0.75rem',
                          color: 'rgba(255,255,255,0.8)',
                        }}>
                          {selectedTask.completedAt}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};
