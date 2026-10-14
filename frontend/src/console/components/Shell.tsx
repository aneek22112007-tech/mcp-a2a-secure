import { useState, type ReactNode } from 'react';
import {
  Shield, LayoutDashboard, Key, FileText, BarChart2,
  Pin, Search, Box, Zap, HelpCircle, ChevronLeft, ChevronRight,
  WifiOff, Wifi, Database,
} from 'lucide-react';
import { StreamDot } from './ui';
import { forgetApiKey, getKeyPrefix } from '../api/client';
import { useHealth } from '../api/hooks';
import type { StreamState } from '../api/client';

export type ViewId =
  | 'overview'
  | 'keys'
  | 'audit'
  | 'metrics'
  | 'pins'
  | 'scanner'
  | 'sandbox'
  | 'attack'
  | 'planned';

// Lucide icons all accept { size?, style?, ... }
type LucideIcon = React.FC<{ size?: number; style?: React.CSSProperties; 'aria-label'?: string }>;

interface NavItem {
  id: ViewId;
  label: string;
  icon: LucideIcon;
  scope?: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'overview', label: 'Overview',       icon: LayoutDashboard },
  { id: 'keys',     label: 'API Keys',        icon: Key,           scope: 'admin' },
  { id: 'audit',    label: 'Live Audit',      icon: FileText,      scope: 'audit:read' },
  { id: 'metrics',  label: 'Metrics',         icon: BarChart2,     scope: 'metrics:read' },
  { id: 'pins',     label: 'Tool Pinning',    icon: Pin,           scope: 'tools:read' },
  { id: 'scanner',  label: 'Scanner',         icon: Search,        scope: 'scanner:read' },
  { id: 'sandbox',  label: 'Sandbox',         icon: Box,           scope: 'sandbox:read' },
  { id: 'attack',   label: 'Attack Simulator',icon: Zap },
  { id: 'planned',  label: 'Planned',         icon: HelpCircle },
];

interface ShellProps {
  activeView: ViewId;
  onViewChange: (v: ViewId) => void;
  streamState: StreamState;
  scopes: string[];
  isDemo: boolean;
  children: ReactNode;
}

export function ConsoleShell({
  activeView,
  onViewChange,
  streamState,
  scopes,
  isDemo,
  children,
}: ShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const { data: health, isError } = useHealth(!isDemo);
  const keyPrefix = getKeyPrefix();

  const isOnline = !isError && !!health;
  const hasScope = (scope?: string) => {
    if (!scope) return true;
    return scopes.includes('admin') || scopes.includes(scope);
  };

  const handleForget = () => {
    forgetApiKey();
    window.location.reload();
  };

  return (
    <div
      className="mcpg-console"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        overflow: 'hidden',
      }}
    >
      {/* ── Top status strip ── */}
      <div
        style={{
          height: 'var(--strip-h)',
          flexShrink: 0,
          background: 'var(--c-surface)',
          borderBottom: '1px solid var(--c-border)',
          display: 'flex',
          alignItems: 'center',
          paddingInline: 16,
          gap: 16,
          fontSize: 11,
          fontFamily: 'var(--font-sans)',
        }}
      >
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <Shield size={13} style={{ color: 'var(--c-amber)' }} />
          <span style={{ fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--c-text)' }}>
            MCP Guard
          </span>
        </div>

        <div style={{ width: 1, height: 16, background: 'var(--c-border)' }} />

        {/* Backend health */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: isOnline ? 'var(--c-allow)' : 'var(--c-deny)' }}>
          {isOnline
            ? <><Wifi size={11} /> Backend online</>
            : <><WifiOff size={11} /> Backend offline</>}
        </div>

        <div style={{ width: 1, height: 16, background: 'var(--c-border)' }} />

        {/* SSE Stream */}
        <StreamDot state={isDemo ? 'offline' : streamState} />

        <div style={{ width: 1, height: 16, background: 'var(--c-border)' }} />

        {/* Key prefix */}
        {keyPrefix && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--c-text-muted)' }}>
            <Key size={10} />
            <span className="mono">{keyPrefix}…</span>
          </div>
        )}

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Demo badge */}
        {isDemo && (
          <span
            className="badge badge-review"
            style={{ fontSize: 9, letterSpacing: '0.1em' }}
            title="Backend offline — showing static demo data"
            role="status"
            aria-label="Demo data — backend offline"
          >
            <Database size={10} />
            DEMO DATA (backend offline)
          </span>
        )}

        {/* Forget key */}
        <button
          className="btn btn-ghost btn-sm"
          onClick={handleForget}
          style={{ fontSize: 10 }}
          aria-label="Forget API key and disconnect"
        >
          Forget key
        </button>
      </div>

      {/* ── Body row ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Left rail */}
        <nav
          style={{
            width: collapsed ? 'var(--rail-w-collapsed)' : 'var(--rail-w)',
            flexShrink: 0,
            background: 'var(--c-surface)',
            borderRight: '1px solid var(--c-border)',
            display: 'flex',
            flexDirection: 'column',
            transition: `width var(--dur-base) var(--ease)`,
            overflow: 'hidden',
          }}
          aria-label="Main navigation"
        >
          <div style={{ padding: '10px 8px', flex: 1 }}>
            {NAV_ITEMS.map(item => {
              const active = activeView === item.id;
              const allowed = hasScope(item.scope);
              const Icon = item.icon;

              return (
                <button
                  key={item.id}
                  className="btn btn-ghost"
                  onClick={() => onViewChange(item.id)}
                  disabled={!allowed}
                  title={!allowed ? `Needs scope: ${item.scope}` : item.label}
                  aria-label={item.label}
                  aria-current={active ? 'page' : undefined}
                  style={{
                    width: '100%',
                    justifyContent: 'flex-start',
                    gap: 8,
                    padding: '7px 10px',
                    marginBottom: 2,
                    borderRadius: 'var(--radius)',
                    background: active ? 'var(--c-surface-2)' : 'transparent',
                    borderColor: active ? 'var(--c-border-2)' : 'transparent',
                    color: active
                      ? 'var(--c-text)'
                      : !allowed
                        ? 'var(--c-text-dim)'
                        : 'var(--c-text-muted)',
                    fontSize: 12,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                  }}
                >
                  <Icon size={14} style={{ flexShrink: 0 }} />
                  {!collapsed && (
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {item.label}
                    </span>
                  )}
                  {!collapsed && !allowed && item.scope && (
                    <span
                      style={{
                        marginLeft: 'auto',
                        fontSize: 9,
                        color: 'var(--c-text-dim)',
                        background: 'var(--c-surface-2)',
                        padding: '1px 4px',
                        borderRadius: 2,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {item.scope}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Collapse toggle */}
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setCollapsed(c => !c)}
            style={{
              margin: 8,
              justifyContent: 'center',
              padding: '6px',
            }}
            aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
          >
            {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>
        </nav>

        {/* Content area */}
        <main
          id="main-content"
          className="scroll-y"
          style={{ flex: 1, overflow: 'auto', background: 'var(--c-bg)' }}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
