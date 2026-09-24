import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { DashboardLayout } from '../components/dashboard/DashboardLayout';
import { SecurityInitialization } from '../components/dashboard/SecurityInitialization';
import { SystemStatus } from '../components/dashboard/SystemStatus';
import { InfrastructureTopology3D } from '../components/dashboard/InfrastructureTopology3D';
import { LiveEventStream } from '../components/dashboard/LiveEventStream';
import { ActivityGraph } from '../components/dashboard/ActivityGraph';
import { ServerInventory } from '../components/dashboard/ServerInventory';
import { SecurityFindings } from '../components/dashboard/SecurityFindings';
import { QuickActions } from '../components/dashboard/QuickActions';
import { NodeInspector } from '../components/dashboard/NodeInspector';

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const [showInitialization, setShowInitialization] = useState(true);

  // Check authentication via API instead of local token
  useEffect(() => {
    // The fetchWithAuth wrapper handles 401 redirects automatically
  }, [navigate]);

  const handleInitializationComplete = () => {
    setShowInitialization(false);
  };

  return (
    <>
      {/* Security Initialization Overlay */}
      <AnimatePresence>
        {showInitialization && (
          <SecurityInitialization onComplete={handleInitializationComplete} />
        )}
      </AnimatePresence>

      {/* Main Dashboard */}
      <DashboardLayout>
        <div style={{ position: 'relative' }}>
          {/* System Status Hero */}
          <SystemStatus />

          {/* Main Content Area */}
          <div style={{
            padding: '2rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '2rem',
          }}>
            {/* 3D Infrastructure Topology */}
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
                <InfrastructureTopology3D height="600px" />
              </div>
            </motion.div>

            {/* Live Events and Activity */}
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
              <ActivityGraph />
            </motion.div>

            {/* Server Inventory */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.4 }}
            >
              <ServerInventory />
            </motion.div>

            {/* Security Findings and Quick Actions */}
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

        {/* Node Inspector Drawer */}
        <NodeInspector />
      </DashboardLayout>
    </>
  );
};
