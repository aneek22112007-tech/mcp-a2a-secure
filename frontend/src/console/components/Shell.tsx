import { useState, type ReactNode } from 'react';
import {
  Shield, LayoutDashboard, Key, FileText, BarChart2,
  Pin, Search, Box, Zap, HelpCircle, ChevronLeft, ChevronRight,
  WifiOff, Wifi, Database,
} from 'lucide-react';
import { StreamDot } from './ui';
import { forgetApiKey, getApiBase, getKeyPrefix } from '../api/client';
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

type LucideIcon = React.FC<{ size?: number; style?: React.CSSProperties; 'aria-label'?: string }>;

interface NavItem {
  id: ViewId;
  label: string;
  icon: LucideIcon;
  scope?: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'keys', label: 'API Keys', icon: Key, scope: 'admin' },
  { id: 'audit', label: 'Live Audit', icon: FileText, scope: 'audit:read' },
  { id: 'metrics', label: 'Metrics', icon: BarChart2, scope: 'metrics:read' },
  { id: 'pins', label: 'Tool Pinning', icon: Pin, scope: 'tools:read' },
  { id: 'scanner', label: 'Scanner', icon: Search, scope: 'scanner:read' },
  { id: 'sandbox', label: 'Sandbox', icon: Box, scope: 'sandbox:read' },
  { id: 'attack', label: 'Attack Simulator', icon: Zap },
  { id: 'planned', label: 'Planned', icon: HelpCircle },
];

interface ShellProps {
  activeView: ViewId;
  onViewChange: (v: ViewId) => void;
  streamState: StreamState;
  scopes: string[];
  isDemo: boolean;
  backendUp: boolean;
  children: ReactNode;
}

export function ConsoleShell({
  activeView,
  onViewChange,
  streamState,
  scopes,
  isDemo,
  backendUp,
  children,
}: ShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const keyPrefix = getKeyPrefix();
  const base = getApiBase();

  const hasScope = (scope?: string) => {
    if (!scope) return true;
    return scopes.includes('admin') || scopes.includes(scope);
  };

  const visible = NAV_ITEMS.filter(item => isDemo || hasScope(item.scope));

  const handleForget = () => {
    forgetApiKey();
    window.location.reload();
  };

  return (
    <div className={`mcpg-console ${collapsed ? 'is-collapsed' : ''}`}>
      <header className="status-strip">
        <div className="brand">
          <Shield size={14} aria-hidden />
          <span>MCP Guard</span>
        </div>
        <span className="strip-rule" aria-hidden />

        {!isDemo && (
          <div className={backendUp ? 'strip-ok' : 'strip-bad'}>
            {backendUp ? <Wifi size={12} aria-hidden /> : <WifiOff size={12} aria-hidden />}
            {backendUp ? 'Backend online' : 'Backend offline'}
          </div>
        )}

        {!isDemo && (
          <>
            <span className="strip-rule" aria-hidden />
            <StreamDot state={streamState} />
          </>
        )}

        {keyPrefix && !isDemo && (
          <>
            <span className="strip-rule" aria-hidden />
            <span className="strip-key"><Key size={12} aria-hidden /><span className="mono">{keyPrefix}…</span></span>
          </>
        )}

        <span className="strip-spacer" />

        {isDemo && (
          <span className="badge badge-review" role="status" aria-label="Demo data, backend offline">
            <Database size={11} aria-hidden />
            DEMO DATA (backend offline)
          </span>
        )}

        <span className="mono strip-base" title="API base URL">{base}</span>

        <button className="btn btn-ghost btn-sm" onClick={handleForget} aria-label="Forget API key and disconnect">
          Forget key
        </button>
      </header>

      <div className="shell-body">
        <nav className="rail" aria-label="Main navigation">
          <div className="rail-items">
            {visible.map(item => {
              const active = activeView === item.id;
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  className={`rail-btn ${active ? 'is-active' : ''}`}
                  onClick={() => onViewChange(item.id)}
                  aria-label={item.label}
                  aria-current={active ? 'page' : undefined}
                  title={item.label}
                >
                  <Icon size={15} aria-hidden />
                  {!collapsed && <span>{item.label}</span>}
                </button>
              );
            })}
          </div>
          <button
            className="btn btn-ghost btn-sm rail-toggle"
            onClick={() => setCollapsed(value => !value)}
            aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
          >
            {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>
        </nav>
        <main id="main-content" className="scroll-y shell-main">
          {children}
        </main>
      </div>
    </div>
  );
}
