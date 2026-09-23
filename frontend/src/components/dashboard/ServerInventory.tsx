import React from 'react';
import { motion } from 'framer-motion';
import { useDashboardStore } from '../../store/dashboardStore';
import type { MCPServer } from '../../data/dashboardMockData';

const getRiskColor = (risk: MCPServer['riskLevel']) => {
  switch (risk) {
    case 'critical': return '#ff0000';
    case 'high': return '#ff4444';
    case 'medium': return '#FE6E44';
    default: return '#7CFF4F';
  }
};

const getStatusColor = (status: MCPServer['status']) => {
  switch (status) {
    case 'operational': return '#7CFF4F';
    case 'warning': return '#ffaa00';
    case 'critical': return '#ff4444';
    default: return '#666666';
  }
};

export const ServerInventory: React.FC = () => {
  const { servers } = useDashboardStore();

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
      }}>
        <div style={{
          fontFamily: 'var(--font-display)',
          fontSize: '0.95rem',
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: '#fff',
        }}>
          REGISTERED SERVERS
        </div>
      </div>

      {/* Column Headers */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '40px 1fr 100px 80px 100px 80px 120px',
        gap: '1rem',
        padding: '0.75rem 1.5rem',
        background: 'rgba(0,0,0,0.3)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        {['', 'SERVER NAME', 'VERSION', 'TOOLS', 'LAST SCAN', 'RISK', 'ACTIVITY'].map(header => (
          <div key={header} style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.65rem',
            fontWeight: 600,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.4)',
          }}>
            {header}
          </div>
        ))}
      </div>

      {/* Server Rows */}
      <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
        {servers.map((server, index) => (
          <motion.div
            key={server.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, delay: index * 0.05 }}
            style={{
              display: 'grid',
              gridTemplateColumns: '40px 1fr 100px 80px 100px 80px 120px',
              gap: '1rem',
              alignItems: 'center',
              padding: '1rem 1.5rem',
              background: index % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent',
              borderBottom: '1px solid rgba(255,255,255,0.03)',
              cursor: 'pointer',
              transition: 'background 0.2s',
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(254,110,68,0.05)'}
            onMouseLeave={(e) => e.currentTarget.style.background = index % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent'}
          >
            {/* Status Indicator */}
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <div style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: getStatusColor(server.status),
                boxShadow: `0 0 8px ${getStatusColor(server.status)}`,
              }} />
            </div>

            {/* Server Name */}
            <div>
              <div style={{
                fontFamily: "'SF Mono', 'Courier New', monospace",
                fontSize: '0.85rem',
                color: '#fff',
                fontWeight: 600,
                marginBottom: '0.15rem',
              }}>
                {server.name}
              </div>
              {server.endpoint && (
                <div style={{
                  fontFamily: "'SF Mono', 'Courier New', monospace",
                  fontSize: '0.65rem',
                  color: 'rgba(255,255,255,0.3)',
                }}>
                  {server.endpoint}
                </div>
              )}
            </div>

            {/* Version */}
            <div style={{
              fontFamily: "'SF Mono', 'Courier New', monospace",
              fontSize: '0.75rem',
              color: 'rgba(255,255,255,0.6)',
            }}>
              {server.version}
            </div>

            {/* Tools */}
            <div style={{
              fontFamily: 'var(--font-body)',
              fontSize: '0.8rem',
              color: '#FE6E44',
              fontWeight: 600,
            }}>
              {server.tools}
            </div>

            {/* Last Scan */}
            <div style={{
              fontFamily: 'var(--font-body)',
              fontSize: '0.75rem',
              color: 'rgba(255,255,255,0.5)',
            }}>
              {server.lastScan}
            </div>

            {/* Risk */}
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0.25rem 0.6rem',
              background: `${getRiskColor(server.riskLevel)}15`,
              border: `1px solid ${getRiskColor(server.riskLevel)}40`,
              borderRadius: '4px',
              fontFamily: 'var(--font-body)',
              fontSize: '0.65rem',
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: getRiskColor(server.riskLevel),
            }}>
              {server.riskLevel}
            </div>

            {/* Activity */}
            <div style={{
              fontFamily: 'var(--font-body)',
              fontSize: '0.75rem',
              color: 'rgba(255,255,255,0.5)',
            }}>
              {server.lastActivity}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
};
