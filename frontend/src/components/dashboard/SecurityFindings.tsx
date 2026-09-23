import React from 'react';
import { motion } from 'framer-motion';
import { useDashboardStore } from '../../store/dashboardStore';
import type { SecurityFinding } from '../../data/dashboardMockData';

const getSeverityColor = (severity: SecurityFinding['severity']) => {
  switch (severity) {
    case 'critical': return '#ff0000';
    case 'high': return '#ff4444';
    case 'medium': return '#FE6E44';
    default: return '#ffaa00';
  }
};

export const SecurityFindings: React.FC = () => {
  const { findings, systemMetrics } = useDashboardStore();

  return (
    <div style={{
      background: 'rgba(0,0,0,0.2)',
      border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: '8px',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '1rem 1.5rem',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div style={{
          fontFamily: 'var(--font-display)',
          fontSize: '0.95rem',
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: '#fff',
        }}>
          SECURITY FINDINGS
        </div>
        <div style={{
          display: 'flex',
          gap: '1rem',
          fontFamily: 'var(--font-body)',
          fontSize: '0.7rem',
        }}>
          <div style={{ color: 'rgba(255,255,255,0.5)' }}>
            CRITICAL: <span style={{ color: '#ff0000', fontWeight: 600 }}>{systemMetrics.criticalFindings}</span>
          </div>
          <div style={{ color: 'rgba(255,255,255,0.5)' }}>
            HIGH: <span style={{ color: '#ff4444', fontWeight: 600 }}>{systemMetrics.highFindings}</span>
          </div>
          <div style={{ color: 'rgba(255,255,255,0.5)' }}>
            MEDIUM: <span style={{ color: '#FE6E44', fontWeight: 600 }}>{systemMetrics.mediumFindings}</span>
          </div>
        </div>
      </div>

      {/* Findings List */}
      <div>
        {findings.map((finding, index) => (
          <motion.div
            key={finding.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, delay: index * 0.1 }}
            style={{
              padding: '1.25rem 1.5rem',
              borderBottom: index < findings.length - 1 ? '1px solid rgba(255,255,255,0.03)' : 'none',
              background: index % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent',
              cursor: 'pointer',
              transition: 'background 0.2s',
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = `${getSeverityColor(finding.severity)}08`}
            onMouseLeave={(e) => e.currentTarget.style.background = index % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent'}
          >
            <div style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '1rem',
            }}>
              {/* Severity Badge */}
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '0.35rem 0.75rem',
                background: `${getSeverityColor(finding.severity)}15`,
                border: `1px solid ${getSeverityColor(finding.severity)}40`,
                borderRadius: '4px',
                fontFamily: 'var(--font-body)',
                fontSize: '0.65rem',
                fontWeight: 700,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: getSeverityColor(finding.severity),
                flexShrink: 0,
              }}>
                {finding.severity}
              </div>

              {/* Finding Content */}
              <div style={{ flex: 1 }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  marginBottom: '0.5rem',
                }}>
                  <div>
                    <div style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      color: getSeverityColor(finding.severity),
                      marginBottom: '0.25rem',
                    }}>
                      {finding.type}
                    </div>
                    <div style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: '0.9rem',
                      fontWeight: 600,
                      color: '#fff',
                      marginBottom: '0.5rem',
                    }}>
                      {finding.title}
                    </div>
                  </div>
                </div>

                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '1rem',
                  marginBottom: '0.75rem',
                }}>
                  <div>
                    <div style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: '0.65rem',
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      color: 'rgba(255,255,255,0.4)',
                      marginBottom: '0.25rem',
                    }}>
                      Resource
                    </div>
                    <div style={{
                      fontFamily: "'SF Mono', 'Courier New', monospace",
                      fontSize: '0.75rem',
                      color: '#FE6E44',
                    }}>
                      {finding.resource}
                    </div>
                  </div>
                  <div>
                    <div style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: '0.65rem',
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      color: 'rgba(255,255,255,0.4)',
                      marginBottom: '0.25rem',
                    }}>
                      Detected
                    </div>
                    <div style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: '0.75rem',
                      color: 'rgba(255,255,255,0.6)',
                    }}>
                      {finding.detectedAt}
                    </div>
                  </div>
                </div>

                <div style={{
                  fontFamily: "'SF Mono', 'Courier New', monospace",
                  fontSize: '0.75rem',
                  color: 'rgba(255,255,255,0.5)',
                  marginBottom: '0.75rem',
                }}>
                  {finding.details}
                </div>

                <button style={{
                  padding: '0.5rem 1rem',
                  background: 'rgba(254,110,68,0.1)',
                  border: '1px solid rgba(254,110,68,0.3)',
                  borderRadius: '4px',
                  color: '#FE6E44',
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(254,110,68,0.15)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(254,110,68,0.1)'}
                >
                  INVESTIGATE
                </button>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
};
