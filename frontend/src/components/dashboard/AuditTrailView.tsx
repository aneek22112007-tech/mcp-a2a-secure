import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useDashboardStore } from '../../store/dashboardStore';
import type { AuditAction } from '../../data/dashboardMockData';

export const AuditTrailView: React.FC = () => {
  const { auditEvents } = useDashboardStore();
  const [filterAction, setFilterAction] = useState<'all' | AuditAction>('all');
  const [filterActorType, setFilterActorType] = useState<'all' | 'agent' | 'user' | 'system'>('all');
  const [filterResourceType, setFilterResourceType] = useState<'all' | 'server' | 'agent' | 'tool' | 'policy' | 'finding'>('all');
  const [filterSuccess, setFilterSuccess] = useState<'all' | 'success' | 'failed'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Filter events
  const filteredEvents = useMemo(() => {
    return auditEvents.filter(event => {
      // Action filter
      if (filterAction !== 'all' && event.action !== filterAction) return false;

      // Actor type filter
      if (filterActorType !== 'all' && event.actorType !== filterActorType) return false;

      // Resource type filter
      if (filterResourceType !== 'all' && event.resourceType !== filterResourceType) return false;

      // Success filter
      if (filterSuccess === 'success' && !event.success) return false;
      if (filterSuccess === 'failed' && event.success) return false;

      // Search filter
      if (searchQuery.length > 0) {
        const query = searchQuery.toLowerCase();
        if (
          !event.actor.toLowerCase().includes(query) &&
          !event.resource.toLowerCase().includes(query) &&
          !event.details.toLowerCase().includes(query) &&
          !event.action.toLowerCase().includes(query)
        ) {
          return false;
        }
      }

      return true;
    });
  }, [auditEvents, filterAction, filterActorType, filterResourceType, filterSuccess, searchQuery]);

  const getActionColor = (action: AuditAction) => {
    switch (action) {
      case 'block': return '#ff4444';
      case 'delete': return '#ff4444';
      case 'execute': return '#4A9EFF';
      case 'write': return '#FE6E44';
      case 'delegate': return '#FE6E44';
      case 'verify': return '#7CFF4F';
      case 'policy_update': return '#FFA726';
      default: return '#999';
    }
  };

  const getActionIcon = (action: AuditAction) => {
    switch (action) {
      case 'read':
        return (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
            <circle cx="12" cy="12" r="3"/>
          </svg>
        );
      case 'write':
        return (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        );
      case 'execute':
        return (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="5 3 19 12 5 21 5 3"/>
          </svg>
        );
      case 'delete':
        return (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          </svg>
        );
      case 'delegate':
        return (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="17 8 21 12 17 16"/>
            <line x1="3" y1="12" x2="21" y2="12"/>
          </svg>
        );
      case 'verify':
        return (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
            <polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
        );
      case 'block':
        return (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
          </svg>
        );
      case 'policy_update':
        return (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        );
    }
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
            AUDIT TRAIL
          </h2>
          <p style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.9rem',
            color: 'rgba(255,255,255,0.5)',
            maxWidth: '600px',
          }}>
            Comprehensive audit log of all security events, actions, and resource access across your MCP infrastructure.
          </p>
        </div>

        {/* Export Button */}
        <button
          style={{
            padding: '0.65rem 1.25rem',
            background: 'rgba(254,110,68,0.15)',
            border: '1px solid rgba(254,110,68,0.3)',
            borderRadius: '6px',
            fontFamily: 'var(--font-body)',
            fontSize: '0.8rem',
            fontWeight: 600,
            letterSpacing: '0.03em',
            color: '#FE6E44',
            cursor: 'pointer',
            transition: 'all 0.2s',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(254,110,68,0.25)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(254,110,68,0.15)';
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          EXPORT AUDIT LOG
        </button>
      </div>

      {/* Stats Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        gap: '1rem',
      }}>
        {[
          { label: 'Total Events', value: auditEvents.length, color: '#FE6E44' },
          { label: 'Successful', value: auditEvents.filter(e => e.success).length, color: '#7CFF4F' },
          { label: 'Failed', value: auditEvents.filter(e => !e.success).length, color: '#ff4444' },
          { label: 'High Risk', value: auditEvents.filter(e => e.riskLevel === 'high' || e.riskLevel === 'critical').length, color: '#ff4444' },
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

      {/* Filters */}
      <div style={{
        background: 'rgba(0,0,0,0.3)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '8px',
        padding: '1.25rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
      }}>
        {/* Search */}
        <div style={{ position: 'relative', maxWidth: '400px' }}>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search audit events..."
            style={{
              width: '100%',
              padding: '0.65rem 0.75rem 0.65rem 2.5rem',
              background: 'rgba(0,0,0,0.3)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '6px',
              fontFamily: 'var(--font-body)',
              fontSize: '0.8rem',
              color: '#fff',
              outline: 'none',
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

        {/* Filter Buttons */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
          {/* Action Filter */}
          <div>
            <label style={{
              display: 'block',
              fontFamily: 'var(--font-body)',
              fontSize: '0.65rem',
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.5)',
              marginBottom: '0.5rem',
            }}>
              Action
            </label>
            <select
              value={filterAction}
              onChange={(e) => setFilterAction(e.target.value as any)}
              style={{
                padding: '0.5rem 0.75rem',
                background: 'rgba(0,0,0,0.3)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '6px',
                fontFamily: 'var(--font-body)',
                fontSize: '0.75rem',
                color: '#fff',
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              <option value="all">All Actions</option>
              <option value="read">Read</option>
              <option value="write">Write</option>
              <option value="execute">Execute</option>
              <option value="delete">Delete</option>
              <option value="delegate">Delegate</option>
              <option value="verify">Verify</option>
              <option value="block">Block</option>
              <option value="policy_update">Policy Update</option>
            </select>
          </div>

          {/* Actor Type Filter */}
          <div>
            <label style={{
              display: 'block',
              fontFamily: 'var(--font-body)',
              fontSize: '0.65rem',
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.5)',
              marginBottom: '0.5rem',
            }}>
              Actor Type
            </label>
            <select
              value={filterActorType}
              onChange={(e) => setFilterActorType(e.target.value as any)}
              style={{
                padding: '0.5rem 0.75rem',
                background: 'rgba(0,0,0,0.3)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '6px',
                fontFamily: 'var(--font-body)',
                fontSize: '0.75rem',
                color: '#fff',
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              <option value="all">All Actors</option>
              <option value="agent">Agent</option>
              <option value="user">User</option>
              <option value="system">System</option>
            </select>
          </div>

          {/* Resource Type Filter */}
          <div>
            <label style={{
              display: 'block',
              fontFamily: 'var(--font-body)',
              fontSize: '0.65rem',
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.5)',
              marginBottom: '0.5rem',
            }}>
              Resource Type
            </label>
            <select
              value={filterResourceType}
              onChange={(e) => setFilterResourceType(e.target.value as any)}
              style={{
                padding: '0.5rem 0.75rem',
                background: 'rgba(0,0,0,0.3)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '6px',
                fontFamily: 'var(--font-body)',
                fontSize: '0.75rem',
                color: '#fff',
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              <option value="all">All Resources</option>
              <option value="server">Server</option>
              <option value="agent">Agent</option>
              <option value="tool">Tool</option>
              <option value="policy">Policy</option>
              <option value="finding">Finding</option>
            </select>
          </div>

          {/* Success Filter */}
          <div>
            <label style={{
              display: 'block',
              fontFamily: 'var(--font-body)',
              fontSize: '0.65rem',
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.5)',
              marginBottom: '0.5rem',
            }}>
              Status
            </label>
            <select
              value={filterSuccess}
              onChange={(e) => setFilterSuccess(e.target.value as any)}
              style={{
                padding: '0.5rem 0.75rem',
                background: 'rgba(0,0,0,0.3)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '6px',
                fontFamily: 'var(--font-body)',
                fontSize: '0.75rem',
                color: '#fff',
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              <option value="all">All Status</option>
              <option value="success">Success</option>
              <option value="failed">Failed</option>
            </select>
          </div>

          {/* Reset Button */}
          {(filterAction !== 'all' || filterActorType !== 'all' || filterResourceType !== 'all' || filterSuccess !== 'all' || searchQuery.length > 0) && (
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button
                onClick={() => {
                  setFilterAction('all');
                  setFilterActorType('all');
                  setFilterResourceType('all');
                  setFilterSuccess('all');
                  setSearchQuery('');
                }}
                style={{
                  padding: '0.5rem 1rem',
                  background: 'rgba(254,110,68,0.15)',
                  border: '1px solid rgba(254,110,68,0.3)',
                  borderRadius: '6px',
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  color: '#FE6E44',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(254,110,68,0.25)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(254,110,68,0.15)';
                }}
              >
                Reset Filters
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Audit Events Timeline */}
      <div style={{
        background: 'rgba(0,0,0,0.3)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '8px',
        overflow: 'hidden',
      }}>
        {/* Results Count */}
        <div style={{
          padding: '1rem 1.5rem',
          background: 'rgba(254,110,68,0.03)',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <div style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.8rem',
            color: 'rgba(255,255,255,0.6)',
          }}>
            Showing <span style={{ color: '#FE6E44', fontWeight: 600 }}>{filteredEvents.length}</span> of {auditEvents.length} events
          </div>
          <div style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.7rem',
            color: 'rgba(255,255,255,0.4)',
          }}>
            Most recent first
          </div>
        </div>

        {/* Events List */}
        <div style={{ maxHeight: 'calc(100vh - 600px)', overflowY: 'auto' }}>
          {filteredEvents.map((event, index) => (
            <motion.div
              key={event.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.02 }}
              style={{
                padding: '1.25rem 1.5rem',
                borderBottom: index < filteredEvents.length - 1 ? '1px solid rgba(255,255,255,0.03)' : 'none',
                display: 'flex',
                gap: '1.5rem',
                alignItems: 'flex-start',
                transition: 'background 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.02)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              {/* Timeline Dot */}
              <div style={{ position: 'relative', paddingTop: '0.15rem' }}>
                <div style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  background: event.success ? '#7CFF4F' : '#ff4444',
                  boxShadow: `0 0 8px ${event.success ? '#7CFF4F' : '#ff4444'}`,
                  border: '2px solid rgba(0,0,0,0.5)',
                }} />
                {index < filteredEvents.length - 1 && (
                  <div style={{
                    position: 'absolute',
                    top: '18px',
                    left: '4px',
                    width: '2px',
                    height: 'calc(100% + 1.5rem)',
                    background: 'linear-gradient(to bottom, rgba(255,255,255,0.1), transparent)',
                  }} />
                )}
              </div>

              {/* Event Content */}
              <div style={{ flex: 1, minWidth: 0 }}>
                {/* Event Header */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  marginBottom: '0.75rem',
                  gap: '1rem',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1 }}>
                    {/* Action Badge */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      padding: '0.35rem 0.65rem',
                      background: `${getActionColor(event.action)}20`,
                      border: `1px solid ${getActionColor(event.action)}40`,
                      borderRadius: '4px',
                      color: getActionColor(event.action),
                    }}>
                      {getActionIcon(event.action)}
                      <span style={{
                        fontFamily: 'var(--font-body)',
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                      }}>
                        {event.action.replace('_', ' ')}
                      </span>
                    </div>

                    {/* Actor Badge */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      padding: '0.35rem 0.65rem',
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '4px',
                    }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2">
                        {event.actorType === 'user' ? (
                          <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></>
                        ) : event.actorType === 'system' ? (
                          <><rect x="4" y="4" width="16" height="16" rx="2" ry="2"/><rect x="9" y="9" width="6" height="6"/></>
                        ) : (
                          <><path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z"/></>
                        )}
                      </svg>
                      <span style={{
                        fontFamily: 'monospace',
                        fontSize: '0.7rem',
                        color: 'rgba(255,255,255,0.7)',
                      }}>
                        {event.actor}
                      </span>
                    </div>

                    {/* Risk Badge */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      padding: '0.35rem 0.65rem',
                      background: `${getRiskColor(event.riskLevel)}15`,
                      border: `1px solid ${getRiskColor(event.riskLevel)}30`,
                      borderRadius: '4px',
                    }}>
                      <div style={{
                        width: '6px',
                        height: '6px',
                        borderRadius: '50%',
                        background: getRiskColor(event.riskLevel),
                        boxShadow: `0 0 6px ${getRiskColor(event.riskLevel)}`,
                      }} />
                      <span style={{
                        fontFamily: 'var(--font-body)',
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        color: getRiskColor(event.riskLevel),
                        textTransform: 'uppercase',
                      }}>
                        {event.riskLevel}
                      </span>
                    </div>
                  </div>

                  {/* Timestamp */}
                  <div style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: '0.7rem',
                    color: 'rgba(255,255,255,0.4)',
                    whiteSpace: 'nowrap',
                  }}>
                    {event.timestamp}
                  </div>
                </div>

                {/* Event Details */}
                <div style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.85rem',
                  color: 'rgba(255,255,255,0.8)',
                  marginBottom: '0.5rem',
                  lineHeight: 1.5,
                }}>
                  {event.details}
                </div>

                {/* Resource Info */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  flexWrap: 'wrap',
                }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    fontFamily: 'var(--font-body)',
                    fontSize: '0.7rem',
                    color: 'rgba(255,255,255,0.5)',
                  }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                    </svg>
                    <span style={{ textTransform: 'capitalize' }}>{event.resourceType}:</span>
                    <span style={{ color: '#FE6E44', fontFamily: 'monospace' }}>{event.resource}</span>
                  </div>
                  {event.ipAddress && (
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      fontFamily: 'var(--font-body)',
                      fontSize: '0.7rem',
                      color: 'rgba(255,255,255,0.5)',
                    }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10"/>
                        <line x1="2" y1="12" x2="22" y2="12"/>
                        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                      </svg>
                      <span style={{ fontFamily: 'monospace' }}>{event.ipAddress}</span>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Empty State */}
        {filteredEvents.length === 0 && (
          <div style={{
            padding: '4rem 2rem',
            textAlign: 'center',
          }}>
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" style={{ margin: '0 auto 1rem' }}>
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
              <polyline points="10 9 9 9 8 9"/>
            </svg>
            <div style={{
              fontFamily: 'var(--font-display)',
              fontSize: '1.25rem',
              fontWeight: 700,
              color: 'rgba(255,255,255,0.5)',
              marginBottom: '0.5rem',
            }}>
              No Audit Events Found
            </div>
            <div style={{
              fontFamily: 'var(--font-body)',
              fontSize: '0.85rem',
              color: 'rgba(255,255,255,0.3)',
            }}>
              {searchQuery ? 'Try adjusting your search or filters' : 'No events match the selected filters'}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
