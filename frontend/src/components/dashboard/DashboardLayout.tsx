import React, { useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { TopCommandBar } from './TopCommandBar';
import { CommandPalette } from './CommandPalette';
import { useDashboardStore } from '../../store/dashboardStore';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children }) => {
  const { commandPaletteOpen, toggleCommandPalette } = useDashboardStore();

  // Command Palette keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        toggleCommandPalette();
      }
      if (e.key === 'Escape' && commandPaletteOpen) {
        toggleCommandPalette();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [commandPaletteOpen, toggleCommandPalette]);

  return (
    <div style={{
      display: 'flex',
      height: '100vh',
      background: '#050505',
      color: '#fff',
      fontFamily: 'var(--font-body)',
      overflow: 'hidden',
    }}>
      {/* Sidebar */}
      <Sidebar />

      {/* Main Content Area */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* Top Command Bar */}
        <TopCommandBar />

        {/* Main Content */}
        <main style={{
          flex: 1,
          overflow: 'auto',
          position: 'relative',
        }}>
          {children}
        </main>
      </div>

      {/* Subtle Background Grid */}
      <div style={{
        position: 'fixed',
        inset: 0,
        backgroundImage: `
          linear-gradient(rgba(255,255,255,0.01) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255,255,255,0.01) 1px, transparent 1px)
        `,
        backgroundSize: '80px 80px',
        pointerEvents: 'none',
        zIndex: 0,
      }} />

      {/* Subtle Orange Glow */}
      <div style={{
        position: 'fixed',
        top: '20%',
        right: '10%',
        width: '800px',
        height: '800px',
        background: 'radial-gradient(circle, rgba(254,110,68,0.03) 0%, transparent 70%)',
        pointerEvents: 'none',
        zIndex: 0,
      }} />

      {/* Command Palette */}
      <CommandPalette />
    </div>
  );
};
