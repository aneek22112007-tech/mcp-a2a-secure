import React from 'react';
import { useDashboardStore, type DashboardView } from '../../store/dashboardStore';
import { useNavigate } from 'react-router-dom';

interface NavItem {
  id: DashboardView;
  label: string;
  icon: React.ReactNode;
  section?: string;
}

const navItems: NavItem[] = [
  {
    id: 'overview',
    label: 'Overview',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
      </svg>
    ),
  },
  {
    id: 'servers',
    label: 'Servers',
    section: 'infrastructure',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/>
      </svg>
    ),
  },
  {
    id: 'agents',
    label: 'Agents',
    section: 'infrastructure',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><polyline points="17 11 19 13 23 9"/>
      </svg>
    ),
  },
  {
    id: 'tools',
    label: 'Tools',
    section: 'infrastructure',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
      </svg>
    ),
  },
  {
    id: 'scanner',
    label: 'Scanner',
    section: 'security',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M12 8v4"/><path d="M12 16h.01"/>
      </svg>
    ),
  },
  {
    id: 'findings',
    label: 'Findings',
    section: 'security',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
    ),
  },
  {
    id: 'policies',
    label: 'Policies',
    section: 'security',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="15" x2="15" y2="15"/>
      </svg>
    ),
  },
  {
    id: 'fingerprints',
    label: 'Fingerprints',
    section: 'security',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 12C2 6.5 6.5 2 12 2a10 10 0 0 1 8 4"/><path d="M5 19.5C5.5 18 6 15 6 12c0-.7.12-1.37.34-2"/><path d="M17.29 21.02c.12-.6.43-2.3.5-3.02"/><path d="M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4"/><path d="M8.65 22c.21-.66.45-1.32.57-2"/><path d="M14 13.12c0 2.38 0 6.38-1 8.88"/><path d="M2 16h.01"/><path d="M21.8 16c.2-2 .131-5.354 0-6"/><path d="M9 6.8a6 6 0 0 1 9 5.2c0 .47 0 1.17-.02 2"/>
      </svg>
    ),
  },
  {
    id: 'events',
    label: 'Live Events',
    section: 'observability',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
      </svg>
    ),
  },
  {
    id: 'architecture',
    label: 'Architecture',
    section: 'observability',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
      </svg>
    ),
  },
  {
    id: 'sandbox',
    label: 'Sandbox',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/><path d="M15 3v18"/><path d="M3 9h18"/><path d="M3 15h18"/>
      </svg>
    ),
  },
];

export const Sidebar: React.FC = () => {
  const navigate = useNavigate();
  const { currentView, setCurrentView, sidebarCollapsed, systemMetrics } = useDashboardStore();

  const handleLogout = () => {
    navigate('/signin');
  };

  const isActive = (view: DashboardView) => currentView === view;

  const renderNavItem = (item: NavItem) => (
    <button
      key={item.id}
      onClick={() => setCurrentView(item.id)}
      className="nav-item"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        width: '100%',
        padding: '0.7rem 1rem',
        background: isActive(item.id) ? 'rgba(254,110,68,0.06)' : 'transparent',
        border: 'none',
        borderLeft: isActive(item.id) ? '2px solid #FE6E44' : '2px solid transparent',
        color: isActive(item.id) ? '#FE6E44' : 'rgba(255,255,255,0.5)',
        fontFamily: 'var(--font-body)',
        fontSize: '0.8rem',
        fontWeight: 500,
        letterSpacing: '0.02em',
        textAlign: 'left',
        cursor: 'pointer',
        transition: 'all 0.2s',
        position: 'relative',
      }}
      onMouseEnter={(e) => {
        if (!isActive(item.id)) {
          e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
          e.currentTarget.style.color = 'rgba(255,255,255,0.75)';
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive(item.id)) {
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.color = 'rgba(255,255,255,0.5)';
        }
      }}
    >
      <span style={{ display: 'flex', opacity: isActive(item.id) ? 1 : 0.7 }}>{item.icon}</span>
      {!sidebarCollapsed && <span>{item.label}</span>}
      {isActive(item.id) && (
        <div style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: '2px',
          background: '#FE6E44',
          boxShadow: '0 0 8px rgba(254,110,68,0.5)',
        }} />
      )}
    </button>
  );

  const renderSection = (title: string, items: NavItem[]) => (
    <div key={title}>
      {!sidebarCollapsed && (
        <div style={{
          fontFamily: 'var(--font-body)',
          fontSize: '0.6rem',
          fontWeight: 600,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: 'rgba(255,255,255,0.25)',
          padding: '1rem 1rem 0.5rem',
        }}>
          {title}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {items.map(renderNavItem)}
      </div>
    </div>
  );

  return (
    <div style={{
      width: sidebarCollapsed ? '70px' : '240px',
      height: '100vh',
      background: 'linear-gradient(180deg, #0A0A0A 0%, #050505 100%)',
      borderRight: '1px solid rgba(255,255,255,0.06)',
      display: 'flex',
      flexDirection: 'column',
      transition: 'width 0.3s ease',
      position: 'relative',
      zIndex: 50,
    }}>
      {/* Brand */}
      <div style={{
        padding: '1.5rem 1rem',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FE6E44" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
          {!sidebarCollapsed && (
            <>
              <span style={{
                fontFamily: 'var(--font-display)',
                fontSize: '0.85rem',
                fontWeight: 700,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: '#fff',
              }}>MCP·A2A</span>
            </>
          )}
        </div>
        {!sidebarCollapsed && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            marginTop: '0.5rem',
            fontSize: '0.65rem',
            color: 'rgba(255,255,255,0.4)',
            fontFamily: 'var(--font-body)',
          }}>
            <div style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: systemMetrics.systemStatus === 'operational' ? '#7CFF4F' : '#FE6E44',
              boxShadow: `0 0 6px ${systemMetrics.systemStatus === 'operational' ? '#7CFF4F' : '#FE6E44'}`,
            }} />
            SYSTEM {systemMetrics.systemStatus.toUpperCase()}
          </div>
        )}
      </div>

      {/* Navigation */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', paddingTop: '0.5rem' }}>
        {renderNavItem(navItems[0])} {/* Overview */}
        
        {renderSection('Infrastructure', navItems.filter(i => i.section === 'infrastructure'))}
        {renderSection('Security', navItems.filter(i => i.section === 'security'))}
        {renderSection('Observability', navItems.filter(i => i.section === 'observability'))}
        
        <div style={{ paddingTop: '0.5rem' }}>
          {renderNavItem(navItems.find(i => i.id === 'sandbox')!)}
        </div>
      </div>

      {/* Bottom Section */}
      <div style={{
        borderTop: '1px solid rgba(255,255,255,0.05)',
        padding: '1rem',
      }}>
        {!sidebarCollapsed && (
          <>
            {/* Workspace Selector */}
            <button style={{
              width: '100%',
              padding: '0.65rem 0.75rem',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '6px',
              color: 'rgba(255,255,255,0.65)',
              fontFamily: 'var(--font-body)',
              fontSize: '0.75rem',
              cursor: 'pointer',
              marginBottom: '0.75rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              transition: 'background 0.2s',
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
            >
              <span>Production</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>

            {/* User Profile */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              padding: '0.5rem',
            }}>
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #FE6E44 0%, #FF7C56 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: 'var(--font-display)',
                fontSize: '0.7rem',
                fontWeight: 700,
                color: '#fff',
              }}>
                A
              </div>
              <div style={{ flex: 1 }}>
                <div style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.75rem',
                  fontWeight: 500,
                  color: '#fff',
                }}>Aneek</div>
                <div style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.65rem',
                  color: 'rgba(255,255,255,0.4)',
                }}>Admin</div>
              </div>
              <button
                onClick={handleLogout}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'rgba(255,255,255,0.4)',
                  cursor: 'pointer',
                  padding: '0.25rem',
                  display: 'flex',
                  transition: 'color 0.2s',
                }}
                onMouseEnter={(e) => e.currentTarget.style.color = '#FE6E44'}
                onMouseLeave={(e) => e.currentTarget.style.color = 'rgba(255,255,255,0.4)'}
                title="Logout"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
                </svg>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
