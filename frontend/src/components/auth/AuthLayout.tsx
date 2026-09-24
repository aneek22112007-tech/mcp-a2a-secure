import React from 'react';
import { Link } from 'react-router-dom';
import Auth3D from './Auth3D';

interface AuthLayoutProps {
  children: React.ReactNode;
  isSignUp?: boolean;
}

export const AuthLayout: React.FC<AuthLayoutProps> = ({ children, isSignUp }) => {
  return (
    <div style={{
      display: 'flex',
      minHeight: '100vh',
      background: '#000',
      color: '#fff',
      fontFamily: 'var(--font-body)',
      overflow: 'hidden',
    }}>
      {/* Left Column: Form */}
      <main style={{
        width: '100%',
        maxWidth: '500px',
        display: 'flex',
        flexDirection: 'column',
        padding: '3rem 3.5rem',
        position: 'relative',
        zIndex: 10,
        borderRight: '1px solid rgba(254,110,68,0.08)',
        background: 'linear-gradient(160deg, #0a0400 0%, #000 60%)',
        flexShrink: 0,
      }}>
        {/* Top Bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4rem' }}>
          <Link to="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            {/* Shield icon styled in orange */}
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FE6E44" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
            <span style={{
              fontFamily: 'var(--font-display)',
              fontSize: '0.75rem',
              fontWeight: 700,
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              color: '#fff',
            }}>MCP·A2A</span>
          </Link>
          <div style={{
            padding: '0.3rem 0.75rem',
            border: '1px solid rgba(254,110,68,0.35)',
            background: 'rgba(254,110,68,0.06)',
            borderRadius: '4px',
            fontFamily: 'var(--font-body)',
            fontSize: '0.6rem',
            fontWeight: 600,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: '#FE6E44',
          }}>
            {isSignUp ? '• V2.4_READY' : '• ZERO-TRUST ACTIVE'}
          </div>
        </div>

        {/* Main Form Content */}
        <div style={{ flex: 1 }}>
          {children}
        </div>

        {/* Footer */}
        <div style={{
          marginTop: '2rem',
          paddingTop: '1.5rem',
          borderTop: '1px solid rgba(255,255,255,0.05)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          {isSignUp ? (
            <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', fontFamily: 'var(--font-body)' }}>
              Already have an account?{' '}
              <Link to="/signin" style={{ color: '#FE6E44', textDecoration: 'none' }}>Sign in</Link>
            </span>
          ) : (
            <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', fontFamily: 'var(--font-body)' }}>
              Don't have an account?{' '}
              <Link to="/signup" style={{ color: '#FE6E44', textDecoration: 'none' }}>Get started ↗</Link>
            </span>
          )}
          <span style={{
            fontSize: '0.6rem',
            color: 'rgba(255,255,255,0.2)',
            fontFamily: 'var(--font-body)',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
          }}>mcp auth login</span>
        </div>
      </main>

      {/* Right Column: 3D Visual */}
      <div style={{
        flex: 1,
        position: 'relative',
        background: '#000',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        {/* Subtle grid */}
        <div style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `linear-gradient(rgba(254,110,68,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(254,110,68,0.04) 1px, transparent 1px)`,
          backgroundSize: '60px 60px',
          pointerEvents: 'none',
        }} />
        {/* Orange glow */}
        <div style={{
          position: 'absolute',
          top: '30%',
          left: '30%',
          width: '600px',
          height: '600px',
          background: 'radial-gradient(circle, rgba(254,110,68,0.07) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        <Auth3D isSignUp={isSignUp} />

        {/* Bottom right hint */}
        <div style={{
          position: 'absolute',
          bottom: '1.5rem',
          right: '2rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.4rem',
          color: 'rgba(255,255,255,0.2)',
          fontSize: '0.6rem',
          fontFamily: 'var(--font-body)',
          letterSpacing: '0.1em',
        }}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
          </svg>
          Drag to rotate 3D mesh
        </div>
      </div>
    </div>
  );
};
