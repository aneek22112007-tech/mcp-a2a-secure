import React from 'react';
import { useDashboardStore } from '../../store/dashboardStore';

export const TopCommandBar: React.FC = () => {
  const { currentView, toggleCommandPalette, systemMetrics } = useDashboardStore();

  const breadcrumbs: Record<string, string> = {
    overview: 'Overview',
    servers: 'Infrastructure / Servers',
    agents: 'Infrastructure / Agents',
    tools: 'Infrastructure / Tools',
    scanner: 'Security / Scanner',
    findings: 'Security / Findings',
    policies: 'Security / Policies',
    fingerprints: 'Security / Fingerprints',
    events: 'Observability / Live Events',
    architecture: 'Architecture',
    sandbox: 'Sandbox',
    settings: 'Settings',
  };

  return (
    <div style={{
      height: '60px',
      background: '#0A0A0A',
      borderBottom: '1px solid rgba(255,255,255,0.06)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 2rem',
      position: 'sticky',
      top: 0,
      zIndex: 40,
    }}>
      {/* Left: Breadcrumb */}
      <div style={{
        fontFamily: 'var(--font-body)',
        fontSize: '0.8rem',
        fontWeight: 500,
        color: 'rgba(255,255,255,0.65)',
        letterSpacing: '0.02em',
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
      }}>
        <span style={{ color: 'rgba(255,255,255,0.35)' }}>COMMAND CENTER</span>
        <span style={{ color: 'rgba(255,255,255,0.2)' }}>/</span>
        <span style={{ color: '#fff' }}>{breadcrumbs[currentView]}</span>
      </div>

      {/* Right: Actions */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
      }}>
        {/* Search / Command Palette */}
        <button
          onClick={toggleCommandPalette}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            padding: '0.5rem 1rem',
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '6px',
            color: 'rgba(255,255,255,0.5)',
            fontFamily: 'var(--font-body)',
            fontSize: '0.75rem',
            cursor: 'pointer',
            transition: 'all 0.2s',
            minWidth: '240px',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <span>Search infrastructure...</span>
          <div style={{
            marginLeft: 'auto',
            display: 'flex',
            gap: '0.25rem',
          }}>
            <kbd style={{
              fontFamily: 'var(--font-body)',
              fontSize: '0.65rem',
              padding: '0.15rem 0.4rem',
              background: 'rgba(0,0,0,0.4)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '3px',
              color: 'rgba(255,255,255,0.5)',
            }}>⌘</kbd>
            <kbd style={{
              fontFamily: 'var(--font-body)',
              fontSize: '0.65rem',
              padding: '0.15rem 0.4rem',
              background: 'rgba(0,0,0,0.4)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '3px',
              color: 'rgba(255,255,255,0.5)',
            }}>K</kbd>
          </div>
        </button>

        {/* Notifications */}
        <button style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '36px',
          height: '36px',
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '6px',
          color: 'rgba(255,255,255,0.5)',
          cursor: 'pointer',
          transition: 'all 0.2s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
          e.currentTarget.style.color = '#fff';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
          e.currentTarget.style.color = 'rgba(255,255,255,0.5)';
        }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
          </svg>
          {/* Badge */}
          {systemMetrics.activeFindings > 0 && (
            <div style={{
              position: 'absolute',
              top: '-4px',
              right: '-4px',
              width: '16px',
              height: '16px',
              background: '#FE6E44',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.6rem',
              fontWeight: 700,
              color: '#fff',
              border: '2px solid #0A0A0A',
            }}>
              {systemMetrics.activeFindings}
            </div>
          )}
        </button>

        {/* System Status */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.5rem 0.75rem',
          background: systemMetrics.systemStatus === 'operational' ? 'rgba(124,255,79,0.06)' : 'rgba(254,110,68,0.06)',
          border: `1px solid ${systemMetrics.systemStatus === 'operational' ? 'rgba(124,255,79,0.2)' : 'rgba(254,110,68,0.2)'}`,
          borderRadius: '6px',
        }}>
          <div style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            background: systemMetrics.systemStatus === 'operational' ? '#7CFF4F' : '#FE6E44',
            boxShadow: `0 0 8px ${systemMetrics.systemStatus === 'operational' ? '#7CFF4F' : '#FE6E44'}`,
          }} />
          <span style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.7rem',
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: systemMetrics.systemStatus === 'operational' ? '#7CFF4F' : '#FE6E44',
          }}>
            {systemMetrics.systemStatus}
          </span>
        </div>

        {/* User Avatar */}
        <div style={{
          width: '36px',
          height: '36px',
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #FE6E44 0%, #FF7C56 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'var(--font-display)',
          fontSize: '0.75rem',
          fontWeight: 700,
          color: '#fff',
          cursor: 'pointer',
          border: '2px solid rgba(254,110,68,0.2)',
        }}>
          A
        </div>
      </div>
    </div>
  );
};
