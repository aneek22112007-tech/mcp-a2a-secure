import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDashboardStore } from '../../store/dashboardStore';
import type { SecurityEvent } from '../../data/dashboardMockData';

const getEventIcon = (type: SecurityEvent['type']) => {
  switch (type) {
    case 'tool_call':
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
        </svg>
      );
    case 'policy':
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
        </svg>
      );
    case 'scan':
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        </svg>
      );
    case 'a2a_connection':
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10"/><polyline points="8 12 12 16 16 12"/><line x1="12" y1="8" x2="12" y2="16"/>
        </svg>
      );
    case 'anomaly':
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
      );
    case 'auth':
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
      );
    case 'block':
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
        </svg>
      );
    default:
      return null;
  }
};

const getStatusColor = (status: SecurityEvent['status']) => {
  switch (status) {
    case 'allowed':
      return '#7CFF4F';
    case 'blocked':
      return '#ff4444';
    case 'verified':
      return '#7CFF4F';
    case 'detected':
      return '#FE6E44';
    case 'completed':
      return 'rgba(255,255,255,0.6)';
    default:
      return 'rgba(255,255,255,0.5)';
  }
};

const EventRow: React.FC<{ event: SecurityEvent; index: number }> = ({ event, index }) => {
  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
      style={{
        display: 'grid',
        gridTemplateColumns: '80px 100px 1fr 120px 100px',
        gap: '1rem',
        alignItems: 'center',
        padding: '0.75rem 1rem',
        background: index % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent',
        borderBottom: '1px solid rgba(255,255,255,0.03)',
        transition: 'background 0.2s',
      }}
      onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
      onMouseLeave={(e) => e.currentTarget.style.background = index % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent'}
    >
      {/* Timestamp */}
      <div style={{
        fontFamily: "'SF Mono', 'Courier New', monospace",
        fontSize: '0.75rem',
        color: 'rgba(255,255,255,0.4)',
      }}>
        {event.timestamp}
      </div>

      {/* Type */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        fontFamily: 'var(--font-body)',
        fontSize: '0.7rem',
        fontWeight: 600,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: 'rgba(255,255,255,0.6)',
      }}>
        <span style={{ color: getStatusColor(event.status) }}>
          {getEventIcon(event.type)}
        </span>
        {event.type.replace('_', ' ')}
      </div>

      {/* Action */}
      <div style={{
        fontFamily: "'SF Mono', 'Courier New', monospace",
        fontSize: '0.75rem',
        color: '#FE6E44',
      }}>
        {event.action}
      </div>

      {/* Source */}
      <div style={{
        fontFamily: 'var(--font-body)',
        fontSize: '0.75rem',
        color: 'rgba(255,255,255,0.5)',
      }}>
        {event.source}
      </div>

      {/* Status */}
      <div style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0.3rem 0.75rem',
        background: `${getStatusColor(event.status)}15`,
        border: `1px solid ${getStatusColor(event.status)}40`,
        borderRadius: '4px',
        fontFamily: 'var(--font-body)',
        fontSize: '0.65rem',
        fontWeight: 600,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: getStatusColor(event.status),
      }}>
        {event.status}
      </div>
    </motion.div>
  );
};

interface LiveEventStreamProps {
  maxHeight?: string;
}

export const LiveEventStream: React.FC<LiveEventStreamProps> = ({ maxHeight = '500px' }) => {
  const { events, isLiveMode, toggleLiveMode } = useDashboardStore();
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new events arrive
  useEffect(() => {
    if (containerRef.current && isLiveMode) {
      containerRef.current.scrollTop = 0;
    }
  }, [events, isLiveMode]);

  return (
    <div style={{
      background: 'rgba(0,0,0,0.2)',
      border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: '8px',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '1rem 1.5rem',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{
            fontFamily: 'var(--font-display)',
            fontSize: '0.95rem',
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: '#fff',
          }}>
            LIVE SECURITY EVENTS
          </div>
          {isLiveMode && (
            <motion.div
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ duration: 2, repeat: Number.POSITIVE_INFINITY }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.25rem 0.6rem',
                background: 'rgba(254,110,68,0.1)',
                border: '1px solid rgba(254,110,68,0.3)',
                borderRadius: '4px',
              }}
            >
              <div style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: '#FE6E44',
                boxShadow: '0 0 8px #FE6E44',
              }} />
              <span style={{
                fontFamily: 'var(--font-body)',
                fontSize: '0.65rem',
                fontWeight: 600,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: '#FE6E44',
              }}>
                LIVE
              </span>
            </motion.div>
          )}
        </div>

        {/* Live Mode Toggle */}
        <button
          onClick={toggleLiveMode}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.4rem 0.85rem',
            background: isLiveMode ? 'rgba(254,110,68,0.1)' : 'rgba(255,255,255,0.03)',
            border: `1px solid ${isLiveMode ? 'rgba(254,110,68,0.3)' : 'rgba(255,255,255,0.08)'}`,
            borderRadius: '4px',
            color: isLiveMode ? '#FE6E44' : 'rgba(255,255,255,0.6)',
            fontFamily: 'var(--font-body)',
            fontSize: '0.7rem',
            fontWeight: 500,
            letterSpacing: '0.05em',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = isLiveMode ? 'rgba(254,110,68,0.15)' : 'rgba(255,255,255,0.06)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = isLiveMode ? 'rgba(254,110,68,0.1)' : 'rgba(255,255,255,0.03)';
          }}
        >
          {isLiveMode ? (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
          )}
          {isLiveMode ? 'Pause' : 'Resume'}
        </button>
      </div>

      {/* Column Headers */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '80px 100px 1fr 120px 100px',
        gap: '1rem',
        padding: '0.75rem 1rem',
        background: 'rgba(0,0,0,0.3)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        {['TIME', 'TYPE', 'ACTION', 'SOURCE', 'STATUS'].map(header => (
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

      {/* Events List */}
      <div
        ref={containerRef}
        style={{
          maxHeight,
          overflowY: 'auto',
          overflowX: 'hidden',
        }}
      >
        <AnimatePresence initial={false}>
          {events.map((event, index) => (
            <EventRow key={event.id} event={event} index={index} />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
};
