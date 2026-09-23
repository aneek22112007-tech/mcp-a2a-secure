import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDashboardStore } from '../../store/dashboardStore';

interface SearchResult {
  type: 'server' | 'agent' | 'tool' | 'finding' | 'action';
  id: string;
  name: string;
  description?: string;
  icon: React.ReactNode;
}

export const CommandPalette: React.FC = () => {
  const { commandPaletteOpen, toggleCommandPalette, servers, agents, findings, setCurrentView, selectNode } = useDashboardStore();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when opened
  useEffect(() => {
    if (commandPaletteOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [commandPaletteOpen]);

  // Generate search results
  const results: SearchResult[] = [];

  if (query.length > 0) {
    const lowerQuery = query.toLowerCase();

    // Search servers
    servers.forEach(server => {
      if (server.name.toLowerCase().includes(lowerQuery)) {
        results.push({
          type: 'server',
          id: server.id,
          name: server.name,
          description: `${server.tools} tools • ${server.status}`,
          icon: (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/>
            </svg>
          ),
        });
      }
    });

    // Search agents
    agents.forEach(agent => {
      if (agent.name.toLowerCase().includes(lowerQuery) || agent.id.toLowerCase().includes(lowerQuery)) {
        results.push({
          type: 'agent',
          id: agent.id,
          name: agent.name,
          description: `${agent.connections} connections • ${agent.status}`,
          icon: (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/>
            </svg>
          ),
        });
      }
    });

    // Search findings
    findings.forEach(finding => {
      if (finding.title.toLowerCase().includes(lowerQuery) || finding.type.toLowerCase().includes(lowerQuery)) {
        results.push({
          type: 'finding',
          id: finding.id,
          name: finding.title,
          description: `${finding.severity.toUpperCase()} • ${finding.resource}`,
          icon: (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          ),
        });
      }
    });

    // Quick actions
    const actions = [
      { id: 'scan', name: 'Run Security Scan', view: 'scanner' as const },
      { id: 'servers', name: 'View Servers', view: 'servers' as const },
      { id: 'agents', name: 'View Agents', view: 'agents' as const },
      { id: 'findings', name: 'View Findings', view: 'findings' as const },
      { id: 'architecture', name: 'View Architecture', view: 'architecture' as const },
      { id: 'sandbox', name: 'Open Sandbox', view: 'sandbox' as const },
    ];

    actions.forEach(action => {
      if (action.name.toLowerCase().includes(lowerQuery)) {
        results.push({
          type: 'action',
          id: action.id,
          name: action.name,
          icon: (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          ),
        });
      }
    });
  }

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev < results.length - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev > 0 ? prev - 1 : 0));
    } else if (e.key === 'Enter' && results[selectedIndex]) {
      e.preventDefault();
      handleSelect(results[selectedIndex]);
    }
  };

  const handleSelect = (result: SearchResult) => {
    if (result.type === 'server' || result.type === 'agent') {
      selectNode(result.id);
    } else if (result.type === 'action') {
      const actionMap: Record<string, any> = {
        scan: () => setCurrentView('scanner'),
        servers: () => setCurrentView('servers'),
        agents: () => setCurrentView('agents'),
        findings: () => setCurrentView('findings'),
        architecture: () => setCurrentView('architecture'),
        sandbox: () => setCurrentView('sandbox'),
      };
      actionMap[result.id]?.();
    }
    toggleCommandPalette();
    setQuery('');
    setSelectedIndex(0);
  };

  if (!commandPaletteOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.8)',
          backdropFilter: 'blur(8px)',
          zIndex: 100,
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'center',
          paddingTop: '15vh',
        }}
        onClick={toggleCommandPalette}
      >
        <motion.div
          initial={{ scale: 0.95, y: -20 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.95, y: -20 }}
          onClick={(e) => e.stopPropagation()}
          style={{
            width: '100%',
            maxWidth: '600px',
            background: '#0A0A0A',
            border: '1px solid rgba(254,110,68,0.3)',
            borderRadius: '8px',
            overflow: 'hidden',
            boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          }}
        >
          {/* Search Input */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelectedIndex(0);
              }}
              onKeyDown={handleKeyDown}
              placeholder="Search servers, agents, tools, findings..."
              style={{
                flex: 1,
                background: 'none',
                border: 'none',
                outline: 'none',
                color: '#fff',
                fontFamily: 'var(--font-body)',
                fontSize: '1rem',
                padding: 0,
              }}
            />
            <kbd style={{
              fontFamily: 'var(--font-body)',
              fontSize: '0.7rem',
              padding: '0.25rem 0.5rem',
              background: 'rgba(0,0,0,0.4)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '3px',
              color: 'rgba(255,255,255,0.5)',
            }}>ESC</kbd>
          </div>

          {/* Results */}
          <div style={{
            maxHeight: '400px',
            overflowY: 'auto',
          }}>
            {results.length === 0 && query.length > 0 && (
              <div style={{
                padding: '2rem',
                textAlign: 'center',
                fontFamily: 'var(--font-body)',
                fontSize: '0.85rem',
                color: 'rgba(255,255,255,0.4)',
              }}>
                No results found for "{query}"
              </div>
            )}

            {results.length === 0 && query.length === 0 && (
              <div style={{
                padding: '2rem',
                textAlign: 'center',
                fontFamily: 'var(--font-body)',
                fontSize: '0.85rem',
                color: 'rgba(255,255,255,0.4)',
              }}>
                Start typing to search infrastructure...
              </div>
            )}

            {results.map((result, index) => (
              <div
                key={`${result.type}-${result.id}`}
                onClick={() => handleSelect(result)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1rem',
                  padding: '1rem 1.5rem',
                  background: selectedIndex === index ? 'rgba(254,110,68,0.1)' : 'transparent',
                  borderLeft: selectedIndex === index ? '2px solid #FE6E44' : '2px solid transparent',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <div style={{ color: selectedIndex === index ? '#FE6E44' : 'rgba(255,255,255,0.5)' }}>
                  {result.icon}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    color: '#fff',
                    marginBottom: '0.15rem',
                  }}>
                    {result.name}
                  </div>
                  {result.description && (
                    <div style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: '0.7rem',
                      color: 'rgba(255,255,255,0.4)',
                    }}>
                      {result.description}
                    </div>
                  )}
                </div>
                <div style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.65rem',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: 'rgba(255,255,255,0.3)',
                  padding: '0.25rem 0.5rem',
                  background: 'rgba(255,255,255,0.05)',
                  borderRadius: '3px',
                }}>
                  {result.type}
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
