import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useDialogA11y } from './a11y';
import {
  Shield, LayoutDashboard, Key, FileText, BarChart2,
  Pin, Search, Box, Zap, HelpCircle, ChevronLeft, ChevronRight,
  Database, RefreshCw, PanelLeft, Keyboard, LogOut, Command as CommandIcon,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { StreamDot } from './ui';
import { EnvSelector, HealthPill, KeyMenu, SubHeader } from './Chrome';
import { useHealth } from '../api/hooks';
import { CommandPalette, type Command } from './CommandPalette';
import { Kbd } from './premium';
import type { ViewId } from './views';
import { forgetApiKey, getApiBase, getKeyPrefix } from '../api/client';
import type { StreamState } from '../api/client';
import { CONSOLE_TZ, CONSOLE_TZ_LABEL, MOD_KEY, envFromBase } from '../utils/helpers';

export type { ViewId } from './views';

type LucideIcon = React.FC<{ size?: number; style?: React.CSSProperties; 'aria-label'?: string }>;

interface NavItem {
  id: ViewId;
  label: string;
  icon: LucideIcon;
  scope?: string;
  group: 'Monitor' | 'Protect' | 'Manage' | 'Roadmap';
  /** Second key of the "g <key>" jump shortcut. */
  key: string;
  desc: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard, group: 'Monitor', key: 'o', desc: 'Health, KPIs and the request pipeline' },
  { id: 'audit', label: 'Live Audit', icon: FileText, scope: 'audit:read', group: 'Monitor', key: 'a', desc: 'Every gateway decision, streamed live' },
  { id: 'metrics', label: 'Metrics', icon: BarChart2, scope: 'metrics:read', group: 'Monitor', key: 'm', desc: 'Latency, busiest keys and guard counters' },
  { id: 'pins', label: 'Tool Pinning', icon: Pin, scope: 'tools:read', group: 'Protect', key: 'p', desc: 'Approved tool fingerprints and drift' },
  { id: 'scanner', label: 'Scanner', icon: Search, scope: 'scanner:read', group: 'Protect', key: 's', desc: 'Static findings across registered tools' },
  { id: 'sandbox', label: 'Sandbox', icon: Box, scope: 'sandbox:read', group: 'Protect', key: 'x', desc: 'Isolated tool runs and their limits' },
  { id: 'attack', label: 'Attack Simulator', icon: Zap, group: 'Protect', key: 't', desc: 'Fire real attacks at the gateway' },
  { id: 'keys', label: 'API Keys', icon: Key, scope: 'admin', group: 'Manage', key: 'k', desc: 'Create, rotate and revoke keys' },
  { id: 'planned', label: 'Roadmap', icon: HelpCircle, group: 'Manage', key: 'r', desc: 'Live features and what is planned' },
];

const COLLAPSE_KEY = 'mcpg.console.rail-collapsed';
const DENSITY_KEY = 'mcpg.console.density';

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

const clockFmt = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit', minute: '2-digit', hour12: false, timeZone: CONSOLE_TZ,
});

function IstClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(id);
  }, []);
  return (
    <span className="strip-clock mono" title="All console times are India Standard Time">
      {clockFmt.format(now)} {CONSOLE_TZ_LABEL}
    </span>
  );
}

function ShortcutsDialog({ onClose, items }: { onClose: () => void; items: NavItem[] }) {
  const ref = useDialogA11y(true, onClose);
  const rows: [string, string][] = [
    [`${MOD_KEY} K`, 'Open the command palette'],
    ['/', 'Open the command palette'],
    ['?', 'Show this help'],
    ['R', 'Refresh all data'],
    ['[', 'Collapse or expand the sidebar'],
    ['Esc', 'Close any dialog or drawer'],
    ...items.map(i => [`G ${i.key.toUpperCase()}`, `Go to ${i.label}`] as [string, string]),
  ];
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        ref={ref}
        className="panel modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-title"
        style={{ width: 440, padding: 20 }}
        onClick={e => e.stopPropagation()}
      >
        <div className="row-between" style={{ marginBottom: 12 }}>
          <h2 id="shortcuts-title" className="modal-title">Keyboard shortcuts</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose} data-autofocus>Close</button>
        </div>
        <dl className="shortcut-list">
          {rows.map(([keys, label]) => (
            <div key={keys + label} className="shortcut-row">
              <dt>{keys.split(' ').map((k, i) => <Kbd key={i}>{k}</Kbd>)}</dt>
              <dd>{label}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

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
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(COLLAPSE_KEY) === '1'; } catch { return false; }
  });
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [density, setDensity] = useState<'comfortable' | 'compact'>(() => {
    try { return localStorage.getItem(DENSITY_KEY) === 'compact' ? 'compact' : 'comfortable'; } catch { return 'comfortable'; }
  });
  const { data: health, isError: healthError } = useHealth(!isDemo);
  const healthState: 'ok' | 'degraded' | 'down' | 'unknown' = !backendUp || healthError
    ? 'down'
    : health?.status === 'ok'
      ? (streamState === 'offline' ? 'degraded' : 'ok')
      : health ? 'degraded' : 'unknown';
  const [helpOpen, setHelpOpen] = useState(false);
  const qc = useQueryClient();
  const keyPrefix = getKeyPrefix();
  const base = getApiBase();
  const pendingG = useRef<number>(0);
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    try { localStorage.setItem(DENSITY_KEY, density); } catch { /* storage blocked */ }
  }, [density]);

  useEffect(() => {
    try { localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0'); } catch { /* storage blocked */ }
  }, [collapsed]);

  const hasScope = (scope?: string) => {
    if (!scope) return true;
    return scopes.includes('admin') || scopes.includes(scope);
  };

  const visible = NAV_ITEMS.filter(item => isDemo || hasScope(item.scope));
  const activeItem = NAV_ITEMS.find(i => i.id === activeView) ?? NAV_ITEMS[0];

  const handleForget = () => {
    forgetApiKey();
    window.location.reload();
  };

  const go = (id: ViewId) => {
    onViewChange(id);
    mainRef.current?.scrollTo({ top: 0 });
  };

  const refreshAll = () => {
    if (isDemo) return;
    void qc.invalidateQueries();
    toast.success('Refreshing all console data');
  };

  const commands: Command[] = useMemo(() => [
    ...visible.map(item => {
      const Icon = item.icon;
      return {
        id: `go-${item.id}`,
        label: item.label,
        group: 'Go to',
        icon: <Icon size={14} />,
        hint: `G ${item.key.toUpperCase()}`,
        keywords: `${item.desc} ${item.group}`,
        run: () => go(item.id),
      };
    }),
    ...(isDemo ? [] : [{ id: 'refresh', label: 'Refresh all data', group: 'Actions', icon: <RefreshCw size={14} />, hint: 'R', keywords: 'reload invalidate', run: refreshAll }]),
    { id: 'rail', label: collapsed ? 'Expand sidebar' : 'Collapse sidebar', group: 'Actions', icon: <PanelLeft size={14} />, hint: '[', keywords: 'navigation rail', run: () => setCollapsed(v => !v) },
    { id: 'help', label: 'Keyboard shortcuts', group: 'Actions', icon: <Keyboard size={14} />, hint: '?', keywords: 'help keys', run: () => setHelpOpen(true) },
    { id: 'forget', label: 'Forget key and disconnect', group: 'Session', icon: <LogOut size={14} />, keywords: 'logout sign out', run: handleForget },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [visible.map(v => v.id).join(','), collapsed, isDemo]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(v => !v);
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      const k = e.key.toLowerCase();
      if (pendingG.current && Date.now() - pendingG.current < 1200) {
        pendingG.current = 0;
        const target = visible.find(i => i.key === k);
        if (target) { e.preventDefault(); go(target.id); }
        return;
      }
      if (k === 'g') { pendingG.current = Date.now(); return; }
      if (e.key === '/') { e.preventDefault(); setPaletteOpen(true); return; }
      if (e.key === '?') { e.preventDefault(); setHelpOpen(true); return; }
      if (e.key === '[') { e.preventDefault(); setCollapsed(v => !v); return; }
      if (k === 'r' && !e.shiftKey) { e.preventDefault(); refreshAll(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const groups = ['Monitor', 'Protect', 'Manage'] as const;

  return (
    <div className={`mcpg-console ${collapsed ? 'is-collapsed' : ''} density-${density}`}>
      <a href="#main-content" className="skip-link">Skip to content</a>
      <header className="status-strip">
        <div className="brand">
          <span className="brand-mark" aria-hidden><Shield size={12} /></span>
          <span>MCP Guard</span>
        </div>
        <span className="strip-slash" aria-hidden>/</span>
        <EnvSelector base={base} />

        <span className="strip-spacer" />

        <button
          className="palette-trigger"
          onClick={() => setPaletteOpen(true)}
          aria-label="Open command palette"
          aria-keyshortcuts="Control+K Meta+K"
        >
          <Search size={13} aria-hidden />
          <span>Search or jump to…</span>
          <span className="palette-trigger-keys"><Kbd>{MOD_KEY}</Kbd><Kbd>K</Kbd></span>
        </button>

        <span className="strip-spacer" />

        {isDemo && (
          <span className="badge badge-review" role="status" aria-label="Demo data, backend offline">
            <Database size={11} aria-hidden />
            DEMO DATA (backend offline)
          </span>
        )}

        {!isDemo && (
          <HealthPill
            state={healthState}
            title={healthState === 'ok' ? `GET /health ok · live stream ${streamState}` : healthState === 'degraded' ? `Backend up, live stream ${streamState}` : 'GET /health failed'}
          />
        )}
        {!isDemo && <StreamDot state={streamState} />}
        <IstClock />
        <KeyMenu
          prefix={isDemo ? null : keyPrefix}
          scopes={scopes}
          onShortcuts={() => setHelpOpen(true)}
          onForget={handleForget}
        />
      </header>

      <div className="shell-body">
        <nav className="rail" aria-label="Main navigation">
          <div className="rail-items">
            {groups.map(group => {
              const items = visible.filter(i => i.group === group);
              if (items.length === 0) return null;
              return (
                <div key={group} className="rail-group" role="group" aria-label={group}>
                  {!collapsed && <div className="rail-group-label">{group}</div>}
                  {items.map(item => {
                    const active = activeView === item.id;
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.id}
                        className={`rail-btn ${active ? 'is-active' : ''}`}
                        onClick={() => go(item.id)}
                        aria-label={item.label}
                        aria-current={active ? 'page' : undefined}
                        aria-keyshortcuts={`G ${item.key.toUpperCase()}`}
                        title={collapsed ? `${item.label}  (g ${item.key})` : item.desc}
                      >
                        <Icon size={15} aria-hidden />
                        {!collapsed && <span className="rail-label">{item.label}</span>}
                        {!collapsed && <span className="rail-kbd" aria-hidden>g {item.key}</span>}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
          {!collapsed && (
            <div className="rail-foot">
              <CommandIcon size={12} aria-hidden />
              <span>Press <Kbd>?</Kbd> for shortcuts</span>
            </div>
          )}
          <button
            className="btn btn-ghost btn-sm rail-toggle"
            onClick={() => setCollapsed(value => !value)}
            aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
            title={collapsed ? 'Expand ([)' : 'Collapse ([)'}
          >
            {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>
        </nav>
        <main id="main-content" ref={mainRef} className="scroll-y shell-main" tabIndex={-1} aria-label={activeItem.label}>
          <SubHeader
            crumbs={[envFromBase(base).name, activeItem.group, activeItem.label]}
            onRefresh={refreshAll}
            density={density}
            onDensity={setDensity}
            isDemo={isDemo}
          />
          {children}
        </main>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={commands} />
      {helpOpen && <ShortcutsDialog onClose={() => setHelpOpen(false)} items={visible} />}
    </div>
  );
}
