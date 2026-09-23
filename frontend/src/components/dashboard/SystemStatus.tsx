import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useDashboardStore } from '../../store/dashboardStore';

export const SystemStatus: React.FC = () => {
  const { systemMetrics } = useDashboardStore();
  const [greeting, setGreeting] = useState('');
  const [animatedScore, setAnimatedScore] = useState(0);

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 12) setGreeting('GOOD MORNING');
    else if (hour < 18) setGreeting('GOOD AFTERNOON');
    else setGreeting('GOOD EVENING');
  }, []);

  // Animate security score
  useEffect(() => {
    let current = 0;
    const target = systemMetrics.securityScore;
    const increment = target / 30;
    const timer = setInterval(() => {
      current += increment;
      if (current >= target) {
        setAnimatedScore(target);
        clearInterval(timer);
      } else {
        setAnimatedScore(Math.floor(current));
      }
    }, 30);
    return () => clearInterval(timer);
  }, [systemMetrics.securityScore]);

  const stats = [
    {
      label: 'SYSTEM STATUS',
      value: systemMetrics.systemStatus.toUpperCase(),
      color: systemMetrics.systemStatus === 'operational' ? '#7CFF4F' : '#FE6E44',
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10"/>
        </svg>
      ),
    },
    {
      label: 'LAST SCAN',
      value: systemMetrics.lastScan.toUpperCase(),
      color: '#FE6E44',
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
        </svg>
      ),
    },
    {
      label: 'ACTIVE SERVERS',
      value: String(systemMetrics.activeServers).padStart(2, '0'),
      color: '#fff',
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/>
        </svg>
      ),
    },
    {
      label: 'ACTIVE AGENTS',
      value: String(systemMetrics.activeAgents).padStart(2, '0'),
      color: '#fff',
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/>
        </svg>
      ),
    },
    {
      label: 'RISK LEVEL',
      value: systemMetrics.riskLevel.toUpperCase(),
      color: systemMetrics.riskLevel === 'low' ? '#7CFF4F' : systemMetrics.riskLevel === 'medium' ? '#FE6E44' : '#ff4444',
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        </svg>
      ),
    },
  ];

  return (
    <div style={{
      padding: '3rem 2rem 2rem',
      borderBottom: '1px solid rgba(255,255,255,0.06)',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Subtle background glow */}
      <div style={{
        position: 'absolute',
        top: '-50%',
        left: '20%',
        width: '600px',
        height: '600px',
        background: 'radial-gradient(circle, rgba(254,110,68,0.04) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      <div style={{ position: 'relative', zIndex: 1 }}>
        {/* Greeting */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(2rem, 5vw, 3.5rem)',
            fontWeight: 900,
            letterSpacing: '0.02em',
            textTransform: 'uppercase',
            color: '#fff',
            lineHeight: 1,
            marginBottom: '0.75rem',
          }}
        >
          {greeting}, ANEEK
        </motion.div>

        {/* Title */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(1.25rem, 3vw, 2rem)',
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: '#FE6E44',
            lineHeight: 1.2,
            marginBottom: '1rem',
          }}
        >
          SECURITY COMMAND CENTER
        </motion.div>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.95rem',
            color: 'rgba(255,255,255,0.5)',
            maxWidth: '600px',
            marginBottom: '3rem',
            letterSpacing: '0.02em',
          }}
        >
          Your MCP infrastructure is being monitored in real time.
          All agent-to-agent communications are verified and secured.
        </motion.p>

        {/* Stats Grid */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '2rem',
            marginBottom: '2rem',
          }}
        >
          {stats.map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.4 + index * 0.1 }}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem',
              }}
            >
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                fontFamily: 'var(--font-body)',
                fontSize: '0.65rem',
                fontWeight: 600,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.4)',
              }}>
                <span style={{ color: stat.color }}>{stat.icon}</span>
                {stat.label}
              </div>
              <div style={{
                fontFamily: 'var(--font-display)',
                fontSize: '1.75rem',
                fontWeight: 700,
                letterSpacing: '0.02em',
                color: stat.color,
              }}>
                {stat.value}
              </div>
            </motion.div>
          ))}
        </motion.div>

        {/* Security Score Circle */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.5 }}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '2rem',
            padding: '1.5rem 2rem',
            background: 'rgba(0,0,0,0.3)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '8px',
          }}
        >
          {/* Circle */}
          <div style={{ position: 'relative', width: '120px', height: '120px' }}>
            <svg width="120" height="120" style={{ transform: 'rotate(-90deg)' }}>
              {/* Background circle */}
              <circle
                cx="60"
                cy="60"
                r="50"
                fill="none"
                stroke="rgba(255,255,255,0.05)"
                strokeWidth="8"
              />
              {/* Progress circle */}
              <motion.circle
                cx="60"
                cy="60"
                r="50"
                fill="none"
                stroke="#7CFF4F"
                strokeWidth="8"
                strokeLinecap="round"
                initial={{ strokeDasharray: '314', strokeDashoffset: '314' }}
                animate={{ 
                  strokeDashoffset: 314 - (314 * animatedScore) / 100,
                }}
                transition={{ duration: 1.5, ease: 'easeOut' }}
                style={{ filter: 'drop-shadow(0 0 8px #7CFF4F)' }}
              />
            </svg>
            {/* Center text */}
            <div style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <div style={{
                fontFamily: 'var(--font-display)',
                fontSize: '2rem',
                fontWeight: 700,
                color: '#7CFF4F',
              }}>
                {animatedScore}
              </div>
              <div style={{
                fontFamily: 'var(--font-body)',
                fontSize: '0.65rem',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.4)',
              }}>
                / 100
              </div>
            </div>
          </div>

          {/* Score details */}
          <div>
            <div style={{
              fontFamily: 'var(--font-body)',
              fontSize: '0.7rem',
              fontWeight: 600,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.5)',
              marginBottom: '0.5rem',
            }}>
              SECURITY POSTURE
            </div>
            <div style={{
              fontFamily: 'var(--font-display)',
              fontSize: '1.5rem',
              fontWeight: 700,
              color: '#7CFF4F',
              marginBottom: '1rem',
            }}>
              EXCELLENT
            </div>
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.4rem',
            }}>
              <div style={{
                fontFamily: 'var(--font-body)',
                fontSize: '0.75rem',
                color: 'rgba(255,255,255,0.6)',
              }}>
                {systemMetrics.verifiedConnections.toLocaleString()} verified connections
              </div>
              <div style={{
                fontFamily: 'var(--font-body)',
                fontSize: '0.75rem',
                color: 'rgba(255,255,255,0.6)',
              }}>
                {systemMetrics.blockedRequests} threats blocked
              </div>
              <div style={{
                fontFamily: 'var(--font-body)',
                fontSize: '0.75rem',
                color: systemMetrics.activeFindings > 0 ? '#FE6E44' : 'rgba(255,255,255,0.6)',
              }}>
                {systemMetrics.activeFindings} active findings
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
};
