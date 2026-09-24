import React, { useState, useEffect, Suspense, lazy } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { DashboardLayout } from '../components/dashboard/DashboardLayout';
import { SecurityInitialization } from '../components/dashboard/SecurityInitialization';
import { SystemStatus } from '../components/dashboard/SystemStatus';
import { LiveEventStream } from '../components/dashboard/LiveEventStream';
import { ServerInventory } from '../components/dashboard/ServerInventory';
import { SecurityFindings } from '../components/dashboard/SecurityFindings';
import { QuickActions } from '../components/dashboard/QuickActions';
import { NodeInspector } from '../components/dashboard/NodeInspector';
const A2ADelegationView = lazy(() => import('../components/dashboard/A2ADelegationView').then(m => ({ default: m.A2ADelegationView })));
const A2AAgentCardsView = lazy(() => import('../components/dashboard/A2AAgentCardsView').then(m => ({ default: m.A2AAgentCardsView })));
const ToolCallsView = lazy(() => import('../components/dashboard/ToolCallsView').then(m => ({ default: m.ToolCallsView })));
const AuditTrailView = lazy(() => import('../components/dashboard/AuditTrailView').then(m => ({ default: m.AuditTrailView })));
const AIAnalysisView = lazy(() => import('../components/dashboard/AIAnalysisView').then(m => ({ default: m.AIAnalysisView })));

import { getAuthToken, setAuthToken } from '../lib/api';
import { useDashboardStore } from '../store/dashboardStore';

// Lazy-load the heavy 3D topology (three.js = ~780KB) — only load when first rendered
const InfrastructureTopology3D = lazy(() =>
  import('../components/dashboard/InfrastructureTopology3D').then(m => ({
    default: m.InfrastructureTopology3D,
  }))
);

// Lazy-load recharts (393KB) — only needed when the overview chart is visible
const ActivityGraph = lazy(() =>
  import('../components/dashboard/ActivityGraph').then(m => ({
    default: m.ActivityGraph,
  }))
);

// Lightweight skeleton shown while three.js loads
function TopologySkeleton() {
  return (
    <div style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'rgba(0,0,0,0.2)',
      borderRadius: '8px',
      minHeight: '400px',
    }}>
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '1rem',
      }}>
        {/* Pulsing grid icon */}
        <svg
          width="40"
          height="40"
          viewBox="0 0 24 24"
          fill="none"
          stroke="rgba(254,110,68,0.4)"
          strokeWidth="1.5"
          style={{ animation: 'pulse 2s ease-in-out infinite' }}
        >
          <circle cx="12" cy="12" r="10" />
          <circle cx="12" cy="12" r="4" />
          <line x1="12" y1="2" x2="12" y2="8" />
          <line x1="12" y1="16" x2="12" y2="22" />
          <line x1="2" y1="12" x2="8" y2="12" />
          <line x1="16" y1="12" x2="22" y2="12" />
        </svg>
        <span style={{
          fontFamily: 'var(--font-body)',
          fontSize: '0.75rem',
          fontWeight: 600,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: 'rgba(254,110,68,0.5)',
        }}>
          LOADING TOPOLOGY...
        </span>
      </div>
    </div>
  );
}

export const Dashboard: React.FC = () => {
  const [showInitialization, setShowInitialization] = useState(() => {
    if (typeof window !== 'undefined') {
      if (sessionStorage.getItem('mcp_security_initialized') === 'true') {
        return false;
      }
      if (window.location.search.includes('no-splash')) {
        return false;
      }
    }
    return true;
  });
  const { currentView } = useDashboardStore();

  useEffect(() => {
    const token = getAuthToken();
    if (!token) {
      setAuthToken('mcp-admin-demo-token');
    }
  }, []);

  const handleInitializationComplete = () => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('mcp_security_initialized', 'true');
    }
    setShowInitialization(false);
  };

  const renderView = () => {
    if (currentView === 'a2aDelegation') return <Suspense fallback={<TopologySkeleton />}><A2ADelegationView /></Suspense>;
    if (currentView === 'a2aAgentCards') return <Suspense fallback={<TopologySkeleton />}><A2AAgentCardsView /></Suspense>;
    if (currentView === 'toolcalls') return <Suspense fallback={<TopologySkeleton />}><ToolCallsView /></Suspense>;
    if (currentView === 'audit') return <Suspense fallback={<TopologySkeleton />}><AuditTrailView /></Suspense>;
    if (currentView === 'aiAnalysis') return <Suspense fallback={<TopologySkeleton />}><AIAnalysisView /></Suspense>;

    if (currentView === 'architecture') {
      return (
        <div style={{ padding: '2rem' }}>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div style={{
              fontFamily: 'var(--font-display)',
              fontSize: '1.75rem',
              fontWeight: 900,
              letterSpacing: '0.02em',
              color: '#fff',
              marginBottom: '0.5rem',
            }}>
              INFRASTRUCTURE ARCHITECTURE
            </div>
            <p style={{
              fontFamily: 'var(--font-body)',
              fontSize: '0.9rem',
              color: 'rgba(255,255,255,0.5)',
              marginBottom: '1.5rem',
            }}>
              3D visualization of your MCP infrastructure topology with real-time status updates.
            </p>
            <div style={{
              background: 'rgba(0,0,0,0.3)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: '8px',
              overflow: 'hidden',
            }}>
              <Suspense fallback={<TopologySkeleton />}>
                <InfrastructureTopology3D height="700px" />
              </Suspense>
            </div>
          </motion.div>
        </div>
      );
    }

    // Default: Overview
    return (
      <div style={{ position: 'relative' }}>
        <SystemStatus />

        <div style={{
          padding: '2rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '2rem',
        }}>
          {/* 3D Infrastructure Topology — lazy loaded, non-blocking */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <div style={{
              fontFamily: 'var(--font-display)',
              fontSize: '1.25rem',
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: '#fff',
              marginBottom: '1rem',
            }}>
              INFRASTRUCTURE TOPOLOGY
            </div>
            <div style={{
              background: 'rgba(0,0,0,0.3)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: '8px',
              overflow: 'hidden',
            }}>
              <Suspense fallback={<TopologySkeleton />}>
                <InfrastructureTopology3D height="600px" />
              </Suspense>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '2rem',
            }}
          >
            <LiveEventStream maxHeight="400px" />
            <Suspense fallback={<div style={{ height: '400px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }} />}>
              <ActivityGraph />
            </Suspense>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
          >
            <ServerInventory />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.5 }}
            style={{
              display: 'grid',
              gridTemplateColumns: '2fr 1fr',
              gap: '2rem',
            }}
          >
            <SecurityFindings />
            <QuickActions />
          </motion.div>
        </div>
      </div>
    );
  };

  return (
    <>
      <AnimatePresence>
        {showInitialization && (
          <SecurityInitialization onComplete={handleInitializationComplete} />
        )}
      </AnimatePresence>

      <DashboardLayout>
        {renderView()}
        <NodeInspector />
      </DashboardLayout>
    </>
  );
};
