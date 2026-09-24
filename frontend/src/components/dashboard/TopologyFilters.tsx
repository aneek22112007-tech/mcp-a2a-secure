import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export interface TopologyFilterState {
  nodeTypes: {
    server: boolean;
    agent: boolean;
    tool: boolean;
  };
  riskLevels: {
    low: boolean;
    medium: boolean;
    high: boolean;
    critical: boolean;
  };
  searchQuery: string;
  focusMode: boolean;
}

interface TopologyFiltersProps {
  filters: TopologyFilterState;
  onChange: (filters: TopologyFilterState) => void;
  onReset: () => void;
}

export const TopologyFilters: React.FC<TopologyFiltersProps> = ({ filters, onChange, onReset }) => {
  const [expanded, setExpanded] = useState(false);

  const activeFilterCount = 
    Object.values(filters.nodeTypes).filter(v => !v).length +
    Object.values(filters.riskLevels).filter(v => !v).length +
    (filters.searchQuery.length > 0 ? 1 : 0) +
    (filters.focusMode ? 1 : 0);

  return (
    <div style={{
      background: 'rgba(0,0,0,0.3)',
      backdropFilter: 'blur(12px)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: '8px',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          padding: '1rem 1.25rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          transition: 'background 0.2s',
          background: expanded ? 'rgba(254,110,68,0.05)' : 'transparent',
        }}
        onMouseEnter={(e) => {
          if (!expanded) e.currentTarget.style.background = 'rgba(255,255,255,0.02)';
        }}
        onMouseLeave={(e) => {
          if (!expanded) e.currentTarget.style.background = 'transparent';
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FE6E44" strokeWidth="2">
            <line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/>
            <line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/>
            <line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/>
            <line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/>
            <line x1="17" y1="16" x2="23" y2="16"/>
          </svg>
          <div>
            <div style={{
              fontFamily: 'var(--font-display)',
              fontSize: '0.85rem',
              fontWeight: 700,
              letterSpacing: '0.05em',
              color: '#fff',
              textTransform: 'uppercase',
            }}>
              Topology Filters
            </div>
            <div style={{
              fontFamily: 'var(--font-body)',
              fontSize: '0.7rem',
              color: 'rgba(255,255,255,0.4)',
              marginTop: '0.15rem',
            }}>
              {activeFilterCount > 0 ? `${activeFilterCount} active filter${activeFilterCount > 1 ? 's' : ''}` : 'No filters applied'}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {activeFilterCount > 0 && (
            <motion.button
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              onClick={(e) => {
                e.stopPropagation();
                onReset();
              }}
              style={{
                padding: '0.35rem 0.75rem',
                background: 'rgba(254,110,68,0.15)',
                border: '1px solid rgba(254,110,68,0.3)',
                borderRadius: '4px',
                fontFamily: 'var(--font-body)',
                fontSize: '0.65rem',
                fontWeight: 600,
                letterSpacing: '0.05em',
                color: '#FE6E44',
                cursor: 'pointer',
                transition: 'all 0.2s',
                textTransform: 'uppercase',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(254,110,68,0.25)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(254,110,68,0.15)';
              }}
            >
              Reset
            </motion.button>
          )}
          <motion.div
            animate={{ rotate: expanded ? 180 : 0 }}
            transition={{ duration: 0.2 }}
            style={{ color: '#FE6E44', display: 'flex' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </motion.div>
        </div>
      </div>

      {/* Filter Content */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{
              padding: '1.5rem 1.25rem',
              borderTop: '1px solid rgba(255,255,255,0.05)',
              display: 'flex',
              flexDirection: 'column',
              gap: '1.5rem',
            }}>
              {/* Search */}
              <div>
                <label style={{
                  display: 'block',
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: 'rgba(255,255,255,0.5)',
                  marginBottom: '0.5rem',
                }}>
                  Search Nodes
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    value={filters.searchQuery}
                    onChange={(e) => onChange({ ...filters, searchQuery: e.target.value })}
                    placeholder="Search by name..."
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
                      transition: 'border 0.2s',
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
              </div>

              {/* Node Types */}
              <div>
                <label style={{
                  display: 'block',
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: 'rgba(255,255,255,0.5)',
                  marginBottom: '0.75rem',
                }}>
                  Node Type
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {(['server', 'agent', 'tool'] as const).map((type) => (
                    <label
                      key={type}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem',
                        cursor: 'pointer',
                        padding: '0.5rem',
                        borderRadius: '4px',
                        transition: 'background 0.2s',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(255,255,255,0.02)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={filters.nodeTypes[type]}
                        onChange={(e) =>
                          onChange({
                            ...filters,
                            nodeTypes: { ...filters.nodeTypes, [type]: e.target.checked },
                          })
                        }
                        style={{
                          width: '16px',
                          height: '16px',
                          cursor: 'pointer',
                          accentColor: '#FE6E44',
                        }}
                      />
                      <span style={{
                        fontFamily: 'var(--font-body)',
                        fontSize: '0.8rem',
                        color: filters.nodeTypes[type] ? '#fff' : 'rgba(255,255,255,0.5)',
                        textTransform: 'capitalize',
                        transition: 'color 0.2s',
                      }}>
                        {type}s
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Risk Levels */}
              <div>
                <label style={{
                  display: 'block',
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: 'rgba(255,255,255,0.5)',
                  marginBottom: '0.75rem',
                }}>
                  Risk Level
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {(['low', 'medium', 'high', 'critical'] as const).map((level) => {
                    const colors = {
                      low: '#7CFF4F',
                      medium: '#FE6E44',
                      high: '#ff4444',
                      critical: '#ff0000',
                    };

                    return (
                      <label
                        key={level}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.75rem',
                          cursor: 'pointer',
                          padding: '0.5rem',
                          borderRadius: '4px',
                          transition: 'background 0.2s',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'rgba(255,255,255,0.02)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'transparent';
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={filters.riskLevels[level]}
                          onChange={(e) =>
                            onChange({
                              ...filters,
                              riskLevels: { ...filters.riskLevels, [level]: e.target.checked },
                            })
                          }
                          style={{
                            width: '16px',
                            height: '16px',
                            cursor: 'pointer',
                            accentColor: colors[level],
                          }}
                        />
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1 }}>
                          <div
                            style={{
                              width: '8px',
                              height: '8px',
                              background: colors[level],
                              borderRadius: '50%',
                              boxShadow: `0 0 6px ${colors[level]}`,
                            }}
                          />
                          <span style={{
                            fontFamily: 'var(--font-body)',
                            fontSize: '0.8rem',
                            color: filters.riskLevels[level] ? '#fff' : 'rgba(255,255,255,0.5)',
                            textTransform: 'capitalize',
                            transition: 'color 0.2s',
                          }}>
                            {level}
                          </span>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Focus Mode */}
              <div style={{
                borderTop: '1px solid rgba(255,255,255,0.05)',
                paddingTop: '1rem',
              }}>
                <label style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  padding: '0.75rem',
                  background: filters.focusMode ? 'rgba(254,110,68,0.1)' : 'rgba(0,0,0,0.2)',
                  border: `1px solid ${filters.focusMode ? 'rgba(254,110,68,0.3)' : 'rgba(255,255,255,0.08)'}`,
                  borderRadius: '6px',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  if (!filters.focusMode) {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.02)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!filters.focusMode) {
                    e.currentTarget.style.background = 'rgba(0,0,0,0.2)';
                  }
                }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={filters.focusMode ? '#FE6E44' : 'rgba(255,255,255,0.5)'} strokeWidth="2">
                      <circle cx="12" cy="12" r="3"/>
                      <path d="M12 1v6m0 6v6M1 12h6m6 0h6"/>
                    </svg>
                    <div>
                      <div style={{
                        fontFamily: 'var(--font-body)',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        color: filters.focusMode ? '#FE6E44' : '#fff',
                      }}>
                        Focus Mode
                      </div>
                      <div style={{
                        fontFamily: 'var(--font-body)',
                        fontSize: '0.65rem',
                        color: 'rgba(255,255,255,0.4)',
                        marginTop: '0.15rem',
                      }}>
                        Hide unconnected nodes
                      </div>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={filters.focusMode}
                    onChange={(e) => onChange({ ...filters, focusMode: e.target.checked })}
                    style={{
                      width: '18px',
                      height: '18px',
                      cursor: 'pointer',
                      accentColor: '#FE6E44',
                    }}
                  />
                </label>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// Default filter state
export const defaultTopologyFilters: TopologyFilterState = {
  nodeTypes: {
    server: true,
    agent: true,
    tool: true,
  },
  riskLevels: {
    low: true,
    medium: true,
    high: true,
    critical: true,
  },
  searchQuery: '',
  focusMode: false,
};
