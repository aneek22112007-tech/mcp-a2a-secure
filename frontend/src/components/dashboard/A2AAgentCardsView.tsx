import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDashboardStore } from '../../store/dashboardStore';
import type { A2AAgentCard } from '../../data/dashboardMockData';

export const A2AAgentCardsView: React.FC = () => {
  const { a2aAgentCards, agents } = useDashboardStore();
  const [selectedCard, setSelectedCard] = useState<A2AAgentCard | null>(null);
  const [filterStatus, setFilterStatus] = useState<'all' | 'verified' | 'revoked' | 'expiring'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Filter and search cards
  const filteredCards = useMemo(() => {
    return a2aAgentCards.filter(card => {
      // Status filter
      if (filterStatus === 'verified' && (!card.verified || card.revoked)) return false;
      if (filterStatus === 'revoked' && !card.revoked) return false;
      if (filterStatus === 'expiring') {
        // Cards expiring soon (this is mock - in real app would calculate actual expiration)
        const expiringIds = ['card-004']; // Mock: card-004 expires in 10 days
        if (!expiringIds.includes(card.id)) return false;
      }

      // Search filter
      if (searchQuery.length > 0) {
        const query = searchQuery.toLowerCase();
        if (
          !card.agentName.toLowerCase().includes(query) &&
          !card.agentId.toLowerCase().includes(query) &&
          !card.issuer.toLowerCase().includes(query)
        ) {
          return false;
        }
      }

      return true;
    });
  }, [a2aAgentCards, filterStatus, searchQuery]);

  const getAgentStatus = (agentId: string) => {
    const agent = agents.find(a => a.id === agentId);
    return agent?.status || 'offline';
  };

  const getTrustScoreColor = (score: number) => {
    if (score >= 95) return '#7CFF4F';
    if (score >= 85) return '#4A9EFF';
    if (score >= 70) return '#FE6E44';
    return '#ff4444';
  };

  const getTrustScoreLabel = (score: number) => {
    if (score >= 95) return 'EXCELLENT';
    if (score >= 85) return 'GOOD';
    if (score >= 70) return 'FAIR';
    return 'POOR';
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
            AGENT CARDS
          </h2>
          <p style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.9rem',
            color: 'rgba(255,255,255,0.5)',
            maxWidth: '600px',
          }}>
            Agent-to-Agent trust cards for secure authentication and authorization. Monitor capabilities, trust scores, and verification status.
          </p>
        </div>

        {/* Filter Controls */}
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          {/* Search */}
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search cards..."
              style={{
                padding: '0.65rem 0.75rem 0.65rem 2.5rem',
                background: 'rgba(0,0,0,0.3)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '6px',
                fontFamily: 'var(--font-body)',
                fontSize: '0.8rem',
                color: '#fff',
                outline: 'none',
                width: '220px',
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

          {/* Status Filter */}
          <div style={{
            display: 'flex',
            gap: '0.5rem',
            background: 'rgba(0,0,0,0.3)',
            padding: '0.35rem',
            borderRadius: '6px',
            border: '1px solid rgba(255,255,255,0.08)',
          }}>
            {(['all', 'verified', 'expiring', 'revoked'] as const).map((status) => (
              <button
                key={status}
                onClick={() => setFilterStatus(status)}
                style={{
                  padding: '0.5rem 0.875rem',
                  background: filterStatus === status ? 'rgba(254,110,68,0.2)' : 'transparent',
                  border: filterStatus === status ? '1px solid rgba(254,110,68,0.4)' : '1px solid transparent',
                  borderRadius: '4px',
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  letterSpacing: '0.05em',
                  color: filterStatus === status ? '#FE6E44' : 'rgba(255,255,255,0.5)',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  textTransform: 'uppercase',
                  whiteSpace: 'nowrap',
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
      </div>

      {/* Stats Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '1rem',
      }}>
        {[
          { label: 'Total Cards', value: a2aAgentCards.length, color: '#FE6E44' },
          { label: 'Verified', value: a2aAgentCards.filter(c => c.verified && !c.revoked).length, color: '#7CFF4F' },
          { label: 'Revoked', value: a2aAgentCards.filter(c => c.revoked).length, color: '#ff4444' },
          { label: 'Avg Trust Score', value: Math.round(a2aAgentCards.reduce((sum, c) => sum + c.trustScore, 0) / a2aAgentCards.length), color: '#4A9EFF' },
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

      {/* Agent Cards Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
        gap: '1.5rem',
      }}>
        {filteredCards.map((card, index) => {
          const agentStatus = getAgentStatus(card.agentId);
          const trustColor = getTrustScoreColor(card.trustScore);

          return (
            <motion.div
              key={card.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              whileHover={{ scale: 1.02 }}
              onClick={() => setSelectedCard(card)}
              style={{
                background: 'rgba(0,0,0,0.3)',
                border: card.revoked ? '1px solid rgba(255,68,68,0.3)' : '1px solid rgba(255,255,255,0.08)',
                borderRadius: '10px',
                overflow: 'hidden',
                cursor: 'pointer',
                transition: 'all 0.2s',
                position: 'relative',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
                e.currentTarget.style.borderColor = card.revoked ? 'rgba(255,68,68,0.5)' : 'rgba(254,110,68,0.3)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(0,0,0,0.3)';
                e.currentTarget.style.borderColor = card.revoked ? 'rgba(255,68,68,0.3)' : 'rgba(255,255,255,0.08)';
              }}
            >
              {/* Card Header with gradient */}
              <div style={{
                padding: '1.5rem',
                background: card.revoked 
                  ? 'linear-gradient(135deg, rgba(255,68,68,0.15), rgba(255,68,68,0.05))'
                  : card.verified 
                    ? 'linear-gradient(135deg, rgba(124,255,79,0.1), rgba(74,158,255,0.05))'
                    : 'linear-gradient(135deg, rgba(254,110,68,0.1), rgba(254,110,68,0.05))',
                borderBottom: '1px solid rgba(255,255,255,0.05)',
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', marginBottom: '1rem' }}>
                  {/* Agent Avatar */}
                  <div style={{
                    width: '56px',
                    height: '56px',
                    borderRadius: '12px',
                    background: card.revoked 
                      ? 'linear-gradient(135deg, rgba(255,68,68,0.2), rgba(255,68,68,0.1))'
                      : 'linear-gradient(135deg, rgba(254,110,68,0.2), rgba(74,158,255,0.1))',
                    border: `2px solid ${card.revoked ? '#ff4444' : trustColor}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={card.revoked ? '#ff4444' : trustColor} strokeWidth="2">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                      <circle cx="12" cy="7" r="4"/>
                    </svg>
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: '1.1rem',
                      fontWeight: 700,
                      color: '#fff',
                      marginBottom: '0.25rem',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {card.agentName}
                    </div>
                    <div style={{
                      fontFamily: 'monospace',
                      fontSize: '0.7rem',
                      color: 'rgba(255,255,255,0.4)',
                    }}>
                      {card.agentId}
                    </div>
                  </div>

                  {/* Status Badge */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    padding: '0.35rem 0.65rem',
                    background: agentStatus === 'active' ? 'rgba(124,255,79,0.15)' : 'rgba(255,255,255,0.05)',
                    border: `1px solid ${agentStatus === 'active' ? 'rgba(124,255,79,0.3)' : 'rgba(255,255,255,0.1)'}`,
                    borderRadius: '4px',
                  }}>
                    <div style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      background: agentStatus === 'active' ? '#7CFF4F' : '#999',
                      boxShadow: agentStatus === 'active' ? '0 0 6px #7CFF4F' : 'none',
                    }} />
                    <span style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: '0.65rem',
                      fontWeight: 600,
                      color: agentStatus === 'active' ? '#7CFF4F' : '#999',
                      textTransform: 'uppercase',
                    }}>
                      {agentStatus}
                    </span>
                  </div>
                </div>

                {/* Trust Score Circle */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}>
                  <div>
                    <div style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: '0.65rem',
                      color: 'rgba(255,255,255,0.5)',
                      marginBottom: '0.35rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}>
                      Trust Score
                    </div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
                      <span style={{
                        fontFamily: 'var(--font-display)',
                        fontSize: '2rem',
                        fontWeight: 700,
                        color: trustColor,
                      }}>
                        {card.trustScore}
                      </span>
                      <span style={{
                        fontFamily: 'var(--font-body)',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        color: trustColor,
                      }}>
                        {getTrustScoreLabel(card.trustScore)}
                      </span>
                    </div>
                  </div>

                  {/* Verification Badge */}
                  {card.revoked ? (
                    <div style={{
                      padding: '0.5rem 0.75rem',
                      background: 'rgba(255,68,68,0.2)',
                      border: '1px solid rgba(255,68,68,0.4)',
                      borderRadius: '6px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                    }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ff4444" strokeWidth="2.5">
                        <circle cx="12" cy="12" r="10"/>
                        <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
                      </svg>
                      <span style={{
                        fontFamily: 'var(--font-body)',
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        color: '#ff4444',
                        textTransform: 'uppercase',
                      }}>
                        REVOKED
                      </span>
                    </div>
                  ) : card.verified ? (
                    <div style={{
                      padding: '0.5rem 0.75rem',
                      background: 'rgba(124,255,79,0.15)',
                      border: '1px solid rgba(124,255,79,0.3)',
                      borderRadius: '6px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                    }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7CFF4F" strokeWidth="2.5">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                        <polyline points="22 4 12 14.01 9 11.01"/>
                      </svg>
                      <span style={{
                        fontFamily: 'var(--font-body)',
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        color: '#7CFF4F',
                        textTransform: 'uppercase',
                      }}>
                        VERIFIED
                      </span>
                    </div>
                  ) : (
                    <div style={{
                      padding: '0.5rem 0.75rem',
                      background: 'rgba(255,167,38,0.15)',
                      border: '1px solid rgba(255,167,38,0.3)',
                      borderRadius: '6px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                    }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FFA726" strokeWidth="2.5">
                        <circle cx="12" cy="12" r="10"/>
                        <line x1="12" y1="16" x2="12" y2="12"/>
                        <line x1="12" y1="8" x2="12.01" y2="8"/>
                      </svg>
                      <span style={{
                        fontFamily: 'var(--font-body)',
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        color: '#FFA726',
                        textTransform: 'uppercase',
                      }}>
                        PENDING
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Card Body */}
              <div style={{ padding: '1.25rem' }}>
                {/* Capabilities */}
                <div style={{ marginBottom: '1rem' }}>
                  <div style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: '0.65rem',
                    fontWeight: 600,
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    color: 'rgba(255,255,255,0.5)',
                    marginBottom: '0.5rem',
                  }}>
                    Capabilities ({card.capabilities.length})
                  </div>
                  <div style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '0.4rem',
                    maxHeight: '80px',
                    overflow: 'hidden',
                  }}>
                    {card.capabilities.slice(0, 3).map((cap) => (
                      <div
                        key={cap}
                        style={{
                          padding: '0.35rem 0.6rem',
                          background: 'rgba(255,255,255,0.05)',
                          border: '1px solid rgba(255,255,255,0.1)',
                          borderRadius: '4px',
                          fontFamily: 'monospace',
                          fontSize: '0.7rem',
                          color: 'rgba(255,255,255,0.7)',
                        }}
                      >
                        {cap}
                      </div>
                    ))}
                    {card.capabilities.length > 3 && (
                      <div style={{
                        padding: '0.35rem 0.6rem',
                        background: 'rgba(254,110,68,0.1)',
                        border: '1px solid rgba(254,110,68,0.2)',
                        borderRadius: '4px',
                        fontFamily: 'var(--font-body)',
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        color: '#FE6E44',
                      }}>
                        +{card.capabilities.length - 3} more
                      </div>
                    )}
                  </div>
                </div>

                {/* Stats */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '0.75rem',
                  paddingTop: '1rem',
                  borderTop: '1px solid rgba(255,255,255,0.05)',
                }}>
                  <div>
                    <div style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: '0.65rem',
                      color: 'rgba(255,255,255,0.4)',
                      marginBottom: '0.25rem',
                    }}>
                      Usage Count
                    </div>
                    <div style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: '1rem',
                      fontWeight: 700,
                      color: '#FE6E44',
                    }}>
                      {card.usageCount.toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <div style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: '0.65rem',
                      color: 'rgba(255,255,255,0.4)',
                      marginBottom: '0.25rem',
                    }}>
                      Last Used
                    </div>
                    <div style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: '0.75rem',
                      color: 'rgba(255,255,255,0.7)',
                    }}>
                      {card.lastUsed}
                    </div>
                  </div>
                </div>
              </div>

              {/* Card Footer */}
              <div style={{
                padding: '0.75rem 1.25rem',
                background: 'rgba(0,0,0,0.3)',
                borderTop: '1px solid rgba(255,255,255,0.05)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}>
                <div style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.7rem',
                  color: 'rgba(255,255,255,0.4)',
                }}>
                  Issued {card.issuedAt}
                </div>
                <div style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.7rem',
                  color: card.id === 'card-004' ? '#FFA726' : 'rgba(255,255,255,0.4)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                }}>
                  {card.id === 'card-004' && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#FFA726" strokeWidth="2">
                      <circle cx="12" cy="12" r="10"/>
                      <polyline points="12 6 12 12 16 14"/>
                    </svg>
                  )}
                  Expires {card.expiresAt}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Empty State */}
      {filteredCards.length === 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          style={{
            padding: '4rem 2rem',
            textAlign: 'center',
          }}
        >
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" style={{ margin: '0 auto 1rem' }}>
            <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
            <line x1="1" y1="10" x2="23" y2="10"/>
          </svg>
          <div style={{
            fontFamily: 'var(--font-display)',
            fontSize: '1.25rem',
            fontWeight: 700,
            color: 'rgba(255,255,255,0.5)',
            marginBottom: '0.5rem',
          }}>
            No Agent Cards Found
          </div>
          <div style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.85rem',
            color: 'rgba(255,255,255,0.3)',
          }}>
            {searchQuery ? 'Try adjusting your search or filters' : 'No cards match the selected filter'}
          </div>
        </motion.div>
      )}

      {/* Card Detail Modal */}
      <AnimatePresence>
        {selectedCard && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedCard(null)}
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
                maxWidth: '700px',
                maxHeight: '85vh',
                background: 'rgba(5,5,5,0.98)',
                border: `1px solid ${selectedCard.revoked ? 'rgba(255,68,68,0.3)' : 'rgba(254,110,68,0.3)'}`,
                borderRadius: '12px',
                overflow: 'hidden',
                zIndex: 1001,
              }}
            >
              {/* Modal Header */}
              <div style={{
                padding: '1.5rem',
                background: selectedCard.revoked 
                  ? 'linear-gradient(135deg, rgba(255,68,68,0.15), rgba(255,68,68,0.05))'
                  : 'linear-gradient(135deg, rgba(254,110,68,0.1), rgba(74,158,255,0.05))',
                borderBottom: '1px solid rgba(255,255,255,0.08)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
              }}>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                  <div style={{
                    width: '64px',
                    height: '64px',
                    borderRadius: '12px',
                    background: selectedCard.revoked
                      ? 'linear-gradient(135deg, rgba(255,68,68,0.2), rgba(255,68,68,0.1))'
                      : 'linear-gradient(135deg, rgba(254,110,68,0.2), rgba(74,158,255,0.1))',
                    border: `2px solid ${selectedCard.revoked ? '#ff4444' : getTrustScoreColor(selectedCard.trustScore)}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={selectedCard.revoked ? '#ff4444' : getTrustScoreColor(selectedCard.trustScore)} strokeWidth="2">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                      <circle cx="12" cy="7" r="4"/>
                    </svg>
                  </div>
                  <div>
                    <div style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: '0.7rem',
                      fontWeight: 600,
                      letterSpacing: '0.1em',
                      textTransform: 'uppercase',
                      color: 'rgba(255,255,255,0.5)',
                      marginBottom: '0.5rem',
                    }}>
                      Agent Trust Card
                    </div>
                    <div style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: '1.5rem',
                      fontWeight: 700,
                      color: '#fff',
                      marginBottom: '0.25rem',
                    }}>
                      {selectedCard.agentName}
                    </div>
                    <div style={{
                      fontFamily: 'monospace',
                      fontSize: '0.75rem',
                      color: 'rgba(255,255,255,0.4)',
                    }}>
                      {selectedCard.id} • {selectedCard.agentId}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedCard(null)}
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
                    flexShrink: 0,
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
                maxHeight: 'calc(85vh - 150px)',
              }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  {/* Trust Score & Status */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '1rem',
                  }}>
                    <div style={{
                      padding: '1.25rem',
                      background: 'rgba(0,0,0,0.3)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: '8px',
                    }}>
                      <div style={{
                        fontFamily: 'var(--font-body)',
                        fontSize: '0.7rem',
                        color: 'rgba(255,255,255,0.5)',
                        marginBottom: '0.75rem',
                      }}>
                        Trust Score
                      </div>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem' }}>
                        <span style={{
                          fontFamily: 'var(--font-display)',
                          fontSize: '3rem',
                          fontWeight: 700,
                          color: getTrustScoreColor(selectedCard.trustScore),
                        }}>
                          {selectedCard.trustScore}
                        </span>
                        <span style={{
                          fontFamily: 'var(--font-body)',
                          fontSize: '0.9rem',
                          fontWeight: 600,
                          color: getTrustScoreColor(selectedCard.trustScore),
                        }}>
                          / 100
                        </span>
                      </div>
                      <div style={{
                        marginTop: '0.5rem',
                        fontFamily: 'var(--font-body)',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        color: getTrustScoreColor(selectedCard.trustScore),
                      }}>
                        {getTrustScoreLabel(selectedCard.trustScore)}
                      </div>
                    </div>

                    <div style={{
                      padding: '1.25rem',
                      background: 'rgba(0,0,0,0.3)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: '8px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.75rem',
                    }}>
                      <div>
                        <div style={{
                          fontFamily: 'var(--font-body)',
                          fontSize: '0.7rem',
                          color: 'rgba(255,255,255,0.5)',
                          marginBottom: '0.5rem',
                        }}>
                          Verification Status
                        </div>
                        <div style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          padding: '0.5rem 0.75rem',
                          background: selectedCard.revoked 
                            ? 'rgba(255,68,68,0.2)' 
                            : selectedCard.verified 
                              ? 'rgba(124,255,79,0.15)' 
                              : 'rgba(255,167,38,0.15)',
                          border: `1px solid ${selectedCard.revoked ? 'rgba(255,68,68,0.4)' : selectedCard.verified ? 'rgba(124,255,79,0.3)' : 'rgba(255,167,38,0.3)'}`,
                          borderRadius: '6px',
                        }}>
                          {selectedCard.revoked ? (
                            <>
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ff4444" strokeWidth="2.5">
                                <circle cx="12" cy="12" r="10"/>
                                <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
                              </svg>
                              <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', fontWeight: 700, color: '#ff4444' }}>
                                REVOKED
                              </span>
                            </>
                          ) : selectedCard.verified ? (
                            <>
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7CFF4F" strokeWidth="2.5">
                                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                                <polyline points="22 4 12 14.01 9 11.01"/>
                              </svg>
                              <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', fontWeight: 700, color: '#7CFF4F' }}>
                                VERIFIED
                              </span>
                            </>
                          ) : (
                            <>
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FFA726" strokeWidth="2.5">
                                <circle cx="12" cy="12" r="10"/>
                                <line x1="12" y1="16" x2="12" y2="12"/>
                                <line x1="12" y1="8" x2="12.01" y2="8"/>
                              </svg>
                              <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', fontWeight: 700, color: '#FFA726' }}>
                                PENDING
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      <div>
                        <div style={{
                          fontFamily: 'var(--font-body)',
                          fontSize: '0.7rem',
                          color: 'rgba(255,255,255,0.5)',
                          marginBottom: '0.35rem',
                        }}>
                          Agent Status
                        </div>
                        <div style={{
                          fontFamily: 'var(--font-body)',
                          fontSize: '0.8rem',
                          fontWeight: 600,
                          color: getAgentStatus(selectedCard.agentId) === 'active' ? '#7CFF4F' : '#999',
                          textTransform: 'uppercase',
                        }}>
                          {getAgentStatus(selectedCard.agentId)}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Capabilities */}
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
                      Authorized Capabilities ({selectedCard.capabilities.length})
                    </div>
                    <div style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '0.5rem',
                    }}>
                      {selectedCard.capabilities.map((cap) => (
                        <div
                          key={cap}
                          style={{
                            padding: '0.5rem 0.75rem',
                            background: 'rgba(254,110,68,0.1)',
                            border: '1px solid rgba(254,110,68,0.2)',
                            borderRadius: '6px',
                            fontFamily: 'monospace',
                            fontSize: '0.75rem',
                            color: '#FE6E44',
                          }}
                        >
                          {cap}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Card Metadata */}
                  <div style={{
                    padding: '1.25rem',
                    background: 'rgba(0,0,0,0.3)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '8px',
                  }}>
                    <div style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: '0.7rem',
                      fontWeight: 600,
                      letterSpacing: '0.1em',
                      textTransform: 'uppercase',
                      color: 'rgba(255,255,255,0.5)',
                      marginBottom: '1rem',
                    }}>
                      Card Information
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      {[
                        { label: 'Issuer', value: selectedCard.issuer },
                        { label: 'Issued At', value: selectedCard.issuedAt },
                        { label: 'Expires At', value: selectedCard.expiresAt },
                        { label: 'Usage Count', value: selectedCard.usageCount.toLocaleString() },
                        { label: 'Last Used', value: selectedCard.lastUsed },
                      ].map((item) => (
                        <div key={item.label} style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                        }}>
                          <span style={{
                            fontFamily: 'var(--font-body)',
                            fontSize: '0.8rem',
                            color: 'rgba(255,255,255,0.5)',
                          }}>
                            {item.label}
                          </span>
                          <span style={{
                            fontFamily: 'var(--font-body)',
                            fontSize: '0.8rem',
                            color: 'rgba(255,255,255,0.8)',
                            fontWeight: 500,
                          }}>
                            {item.value}
                          </span>
                        </div>
                      ))}
                    </div>
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
