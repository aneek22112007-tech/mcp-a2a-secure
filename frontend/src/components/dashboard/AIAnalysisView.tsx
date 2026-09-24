import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useDashboardStore } from '../../store/dashboardStore';
import type { AIAnalysis } from '../../data/dashboardMockData';

export const AIAnalysisView: React.FC = () => {
  const { aiAnalyses } = useDashboardStore();
  const [filterType, setFilterType] = useState<'all' | 'threat_detection' | 'anomaly_detection' | 'pattern_analysis' | 'risk_assessment'>('all');
  const [filterSeverity, setFilterSeverity] = useState<'all' | 'low' | 'medium' | 'high' | 'critical'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Filter analyses
  const filteredAnalyses = useMemo(() => {
    return aiAnalyses.filter(analysis => {
      // Type filter
      if (filterType !== 'all' && analysis.analysisType !== filterType) return false;

      // Severity filter
      if (filterSeverity !== 'all' && analysis.severity !== filterSeverity) return false;

      // Search filter
      if (searchQuery.length > 0) {
        const query = searchQuery.toLowerCase();
        if (
          !analysis.finding.toLowerCase().includes(query) &&
          !analysis.recommendation.toLowerCase().includes(query) &&
          !analysis.affectedResources.some(r => r.toLowerCase().includes(query))
        ) {
          return false;
        }
      }

      return true;
    });
  }, [aiAnalyses, filterType, filterSeverity, searchQuery]);

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 90) return '#7CFF4F';
    if (confidence >= 75) return '#4A9EFF';
    if (confidence >= 60) return '#FE6E44';
    return '#ff4444';
  };

  const getConfidenceLabel = (confidence: number) => {
    if (confidence >= 90) return 'VERY HIGH';
    if (confidence >= 75) return 'HIGH';
    if (confidence >= 60) return 'MEDIUM';
    return 'LOW';
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return '#ff0000';
      case 'high': return '#ff4444';
      case 'medium': return '#FE6E44';
      case 'low': return '#7CFF4F';
      default: return '#999';
    }
  };

  const getTypeIcon = (type: AIAnalysis['analysisType']) => {
    switch (type) {
      case 'threat_detection':
        return (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            <path d="M12 8v4"/>
            <path d="M12 16h.01"/>
          </svg>
        );
      case 'anomaly_detection':
        return (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
          </svg>
        );
      case 'pattern_analysis':
        return (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="1" x2="12" y2="23"/>
            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
          </svg>
        );
      case 'risk_assessment':
        return (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
        );
    }
  };

  const avgConfidence = Math.round(aiAnalyses.reduce((sum, a) => sum + a.confidence, 0) / aiAnalyses.length);

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
      <div>
        <h2 style={{
          fontFamily: 'var(--font-display)',
          fontSize: '1.75rem',
          fontWeight: 900,
          letterSpacing: '0.02em',
          color: '#fff',
          marginBottom: '0.5rem',
        }}>
          AI SECURITY ANALYSIS
        </h2>
        <p style={{
          fontFamily: 'var(--font-body)',
          fontSize: '0.9rem',
          color: 'rgba(255,255,255,0.5)',
          maxWidth: '600px',
        }}>
          LLM-powered security insights with confidence scoring. Real-time threat detection, anomaly analysis, and risk assessment.
        </p>
      </div>

      {/* Model Status Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        style={{
          background: 'linear-gradient(135deg, rgba(74,158,255,0.1), rgba(124,255,79,0.05))',
          border: '1px solid rgba(74,158,255,0.3)',
          borderRadius: '10px',
          padding: '1.5rem',
          display: 'flex',
          gap: '2rem',
          alignItems: 'center',
        }}
      >
        {/* Model Icon */}
        <div style={{
          width: '80px',
          height: '80px',
          borderRadius: '12px',
          background: 'linear-gradient(135deg, rgba(74,158,255,0.2), rgba(124,255,79,0.1))',
          border: '2px solid rgba(74,158,255,0.4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#4A9EFF" strokeWidth="2">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
            <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
            <line x1="12" y1="22.08" x2="12" y2="12"/>
          </svg>
        </div>

        {/* Model Info */}
        <div style={{ flex: 1 }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            marginBottom: '0.75rem',
          }}>
            <div style={{
              fontFamily: 'var(--font-display)',
              fontSize: '1.5rem',
              fontWeight: 700,
              color: '#fff',
            }}>
              Sentinel AI v3.2.1
            </div>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.35rem 0.65rem',
              background: 'rgba(124,255,79,0.2)',
              border: '1px solid rgba(124,255,79,0.4)',
              borderRadius: '4px',
            }}>
              <div style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: '#7CFF4F',
                boxShadow: '0 0 8px #7CFF4F',
              }} />
              <span style={{
                fontFamily: 'var(--font-body)',
                fontSize: '0.7rem',
                fontWeight: 700,
                color: '#7CFF4F',
                textTransform: 'uppercase',
              }}>
                ONLINE
              </span>
            </div>
          </div>
          <div style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.85rem',
            color: 'rgba(255,255,255,0.6)',
            marginBottom: '1rem',
          }}>
            Advanced LLM security model trained on OWASP LLM Top 10 and MCP-specific attack vectors
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '1.5rem',
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
                Avg Confidence
              </div>
              <div style={{
                fontFamily: 'var(--font-display)',
                fontSize: '1.5rem',
                fontWeight: 700,
                color: getConfidenceColor(avgConfidence),
              }}>
                {avgConfidence}%
              </div>
            </div>
            <div>
              <div style={{
                fontFamily: 'var(--font-body)',
                fontSize: '0.65rem',
                color: 'rgba(255,255,255,0.5)',
                marginBottom: '0.35rem',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}>
                Analyses Run
              </div>
              <div style={{
                fontFamily: 'var(--font-display)',
                fontSize: '1.5rem',
                fontWeight: 700,
                color: '#4A9EFF',
              }}>
                {aiAnalyses.length}
              </div>
            </div>
            <div>
              <div style={{
                fontFamily: 'var(--font-body)',
                fontSize: '0.65rem',
                color: 'rgba(255,255,255,0.5)',
                marginBottom: '0.35rem',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}>
                Avg Processing
              </div>
              <div style={{
                fontFamily: 'var(--font-display)',
                fontSize: '1.5rem',
                fontWeight: 700,
                color: '#FE6E44',
              }}>
                {Math.round(aiAnalyses.reduce((sum, a) => sum + a.processingTime, 0) / aiAnalyses.length)}ms
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Stats Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: '1rem',
      }}>
        {[
          { label: 'Threat Detection', value: aiAnalyses.filter(a => a.analysisType === 'threat_detection').length, color: '#ff4444' },
          { label: 'Anomaly Detection', value: aiAnalyses.filter(a => a.analysisType === 'anomaly_detection').length, color: '#FE6E44' },
          { label: 'Pattern Analysis', value: aiAnalyses.filter(a => a.analysisType === 'pattern_analysis').length, color: '#4A9EFF' },
          { label: 'Risk Assessment', value: aiAnalyses.filter(a => a.analysisType === 'risk_assessment').length, color: '#FFA726' },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 + 0.2 }}
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
        flexWrap: 'wrap',
        gap: '1rem',
        alignItems: 'flex-end',
      }}>
        {/* Search */}
        <div style={{ flex: '1 1 300px', position: 'relative' }}>
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
            Search
          </label>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search findings..."
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
              bottom: '0.65rem',
            }}
          >
            <circle cx="11" cy="11" r="8"/>
            <path d="m21 21-4.35-4.35"/>
          </svg>
        </div>

        {/* Type Filter */}
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
            Analysis Type
          </label>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as any)}
            style={{
              padding: '0.65rem 0.75rem',
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
            <option value="all">All Types</option>
            <option value="threat_detection">Threat Detection</option>
            <option value="anomaly_detection">Anomaly Detection</option>
            <option value="pattern_analysis">Pattern Analysis</option>
            <option value="risk_assessment">Risk Assessment</option>
          </select>
        </div>

        {/* Severity Filter */}
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
            Severity
          </label>
          <select
            value={filterSeverity}
            onChange={(e) => setFilterSeverity(e.target.value as any)}
            style={{
              padding: '0.65rem 0.75rem',
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
            <option value="all">All Severities</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </div>
      </div>

      {/* Analysis Cards */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
      }}>
        {filteredAnalyses.map((analysis, index) => (
          <motion.div
            key={analysis.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            style={{
              background: 'rgba(0,0,0,0.3)',
              border: `1px solid ${getSeverityColor(analysis.severity)}30`,
              borderLeft: `4px solid ${getSeverityColor(analysis.severity)}`,
              borderRadius: '8px',
              padding: '1.5rem',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.02)';
              e.currentTarget.style.borderColor = `${getSeverityColor(analysis.severity)}50`;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(0,0,0,0.3)';
              e.currentTarget.style.borderColor = `${getSeverityColor(analysis.severity)}30`;
            }}
          >
            {/* Header */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              marginBottom: '1rem',
              gap: '1rem',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: 1 }}>
                {/* Type Icon */}
                <div style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '8px',
                  background: `${getSeverityColor(analysis.severity)}15`,
                  border: `1px solid ${getSeverityColor(analysis.severity)}30`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: getSeverityColor(analysis.severity),
                  flexShrink: 0,
                }}>
                  {getTypeIcon(analysis.analysisType)}
                </div>

                {/* Type and Severity */}
                <div style={{ flex: 1 }}>
                  <div style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: '0.7rem',
                    fontWeight: 600,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: 'rgba(255,255,255,0.5)',
                    marginBottom: '0.35rem',
                  }}>
                    {analysis.analysisType.replace('_', ' ')}
                  </div>
                  <div style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    padding: '0.35rem 0.65rem',
                    background: `${getSeverityColor(analysis.severity)}20`,
                    border: `1px solid ${getSeverityColor(analysis.severity)}40`,
                    borderRadius: '4px',
                  }}>
                    <div style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: getSeverityColor(analysis.severity),
                      boxShadow: `0 0 8px ${getSeverityColor(analysis.severity)}`,
                    }} />
                    <span style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      color: getSeverityColor(analysis.severity),
                      textTransform: 'uppercase',
                    }}>
                      {analysis.severity} SEVERITY
                    </span>
                  </div>
                </div>
              </div>

              {/* Confidence Score */}
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-end',
                gap: '0.5rem',
              }}>
                <div style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.65rem',
                  color: 'rgba(255,255,255,0.5)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}>
                  Confidence
                </div>
                <div style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: '0.5rem',
                }}>
                  <span style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: '2rem',
                    fontWeight: 700,
                    color: getConfidenceColor(analysis.confidence),
                  }}>
                    {analysis.confidence}
                  </span>
                  <span style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    color: getConfidenceColor(analysis.confidence),
                  }}>
                    %
                  </span>
                </div>
                <div style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  color: getConfidenceColor(analysis.confidence),
                  textTransform: 'uppercase',
                }}>
                  {getConfidenceLabel(analysis.confidence)}
                </div>
              </div>
            </div>

            {/* Finding */}
            <div style={{ marginBottom: '1rem' }}>
              <div style={{
                fontFamily: 'var(--font-body)',
                fontSize: '0.7rem',
                fontWeight: 600,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.5)',
                marginBottom: '0.5rem',
              }}>
                Finding
              </div>
              <div style={{
                fontFamily: 'var(--font-body)',
                fontSize: '0.95rem',
                color: '#fff',
                lineHeight: 1.6,
              }}>
                {analysis.finding}
              </div>
            </div>

            {/* Recommendation */}
            <div style={{ marginBottom: '1rem' }}>
              <div style={{
                fontFamily: 'var(--font-body)',
                fontSize: '0.7rem',
                fontWeight: 600,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.5)',
                marginBottom: '0.5rem',
              }}>
                Recommendation
              </div>
              <div style={{
                fontFamily: 'var(--font-body)',
                fontSize: '0.85rem',
                color: 'rgba(255,255,255,0.8)',
                lineHeight: 1.6,
                padding: '0.75rem',
                background: 'rgba(74,158,255,0.05)',
                border: '1px solid rgba(74,158,255,0.2)',
                borderRadius: '6px',
              }}>
                {analysis.recommendation}
              </div>
            </div>

            {/* Footer */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingTop: '1rem',
              borderTop: '1px solid rgba(255,255,255,0.05)',
            }}>
              {/* Affected Resources */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                flexWrap: 'wrap',
              }}>
                <span style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.7rem',
                  color: 'rgba(255,255,255,0.5)',
                }}>
                  Affected:
                </span>
                {analysis.affectedResources.map((resource) => (
                  <div
                    key={resource}
                    style={{
                      padding: '0.3rem 0.6rem',
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '4px',
                      fontFamily: 'monospace',
                      fontSize: '0.7rem',
                      color: '#FE6E44',
                    }}
                  >
                    {resource}
                  </div>
                ))}
              </div>

              {/* Meta Info */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '1.5rem',
              }}>
                <div style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.7rem',
                  color: 'rgba(255,255,255,0.4)',
                }}>
                  {analysis.timestamp}
                </div>
                <div style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.7rem',
                  color: 'rgba(255,255,255,0.4)',
                }}>
                  {analysis.modelVersion}
                </div>
                <div style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.7rem',
                  color: 'rgba(255,255,255,0.4)',
                }}>
                  {analysis.processingTime}ms
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Empty State */}
      {filteredAnalyses.length === 0 && (
        <div style={{
          padding: '4rem 2rem',
          textAlign: 'center',
          background: 'rgba(0,0,0,0.3)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '8px',
        }}>
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" style={{ margin: '0 auto 1rem' }}>
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
            <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
            <line x1="12" y1="22.08" x2="12" y2="12"/>
          </svg>
          <div style={{
            fontFamily: 'var(--font-display)',
            fontSize: '1.25rem',
            fontWeight: 700,
            color: 'rgba(255,255,255,0.5)',
            marginBottom: '0.5rem',
          }}>
            No AI Analyses Found
          </div>
          <div style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.85rem',
            color: 'rgba(255,255,255,0.3)',
          }}>
            {searchQuery ? 'Try adjusting your search or filters' : 'No analyses match the selected filters'}
          </div>
        </div>
      )}
    </div>
  );
};
