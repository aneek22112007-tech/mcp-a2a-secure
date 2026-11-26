import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useIsFetching } from '@tanstack/react-query';
import { useLastUpdated } from '../api/hooks';
import { Check, ChevronDown, ChevronRight, ChevronsUpDown, Copy, Keyboard, LogOut, RefreshCw, Rows3, Rows4 } from 'lucide-react';
import { copyToClipboard, fmtTimestamp, CONSOLE_TZ_LABEL, envFromBase } from '../utils/helpers';

// ── Popover menu ──────────────────────────────────────────────────────
export function Menu({
  trigger, label, children, align = 'right', width = 260, placement = 'down', className,
}: {
  trigger: ReactNode;
  label: string;
  children: (close: () => void) => ReactNode;
  align?: 'left' | 'right';
  width?: number;
  /** Open below the trigger (default) or above it, for menus at the bottom of the sidebar. */
  placement?: 'down' | 'up';
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); btnRef.current?.focus(); }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey, true); };
  }, [open]);
  return (
    <div className={`menu ${className ?? ''}`} ref={ref}>
      <button ref={btnRef} className="menu-trigger" aria-haspopup="menu" aria-expanded={open} aria-label={label} onClick={() => setOpen(v => !v)}>
        {trigger}
      </button>
      {open && (
        <div
          className={`menu-pop ${placement === 'up' ? 'menu-pop-up' : ''}`}
          role="menu"
          aria-label={label}
          style={{ width, [align]: 0 }}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export function MenuItem({ icon, children, onSelect, danger }: { icon?: ReactNode; children: ReactNode; onSelect: () => void; danger?: boolean }) {
  return (
    <button role="menuitem" className={`menu-item ${danger ? 'is-danger' : ''}`} onClick={onSelect}>
      <span className="menu-item-icon" aria-hidden>{icon}</span>
      <span>{children}</span>
    </button>
  );
}

// ── Environment ───────────────────────────────────────────────────────
export function EnvSelector({ base, version, brand }: { base: string; version?: string; brand?: ReactNode }) {
  const env = envFromBase(base);
  const [copied, setCopied] = useState(false);
  return (
    <Menu
      label="Environment"
      align="left"
      width={300}
      className={brand ? 'menu-workspace' : undefined}
      trigger={brand ? (
        <>
          {brand}
          <span className="ws-text">
            <span className="ws-name">MCP Guard</span>
            <span className="ws-env"><span className="env-dot" aria-hidden />{env.name}</span>
          </span>
          <ChevronsUpDown size={14} aria-hidden className="ws-chevron" />
        </>
      ) : (
        <>
          <span className="env-dot" aria-hidden />
          <span className="env-name">{env.name}</span>
          <ChevronDown size={12} aria-hidden />
        </>
      )}
    >
      {close => (
        <>
          <div className="menu-label">Environment</div>
          <div className="menu-env is-current">
            <Check size={13} aria-hidden />
            <div style={{ minWidth: 0 }}>
              <div className="menu-env-name">{env.name}</div>
              <div className="mono menu-env-host" title={base}>{base}</div>
            </div>
          </div>
          {version && <div className="menu-meta">Backend {version}</div>}
          <div className="menu-sep" />
          <MenuItem
            icon={copied ? <Check size={13} /> : <Copy size={13} />}
            onSelect={async () => { setCopied(await copyToClipboard(base)); setTimeout(() => { setCopied(false); close(); }, 600); }}
          >
            Copy API base URL
          </MenuItem>
          <div className="menu-meta">Other environments appear here when the console points at another gateway.</div>
        </>
      )}
    </Menu>
  );
}

// ── Health ────────────────────────────────────────────────────────────
export function HealthPill({ state, title }: { state: 'ok' | 'degraded' | 'down' | 'unknown'; title?: string }) {
  const label = { ok: 'Operational', degraded: 'Degraded', down: 'Unreachable', unknown: 'Checking' }[state];
  return (
    <span className={`health-pill health-${state}`} role="status" title={title}>
      <span className="health-dot" aria-hidden />
      {label}
    </span>
  );
}

export function SubHeader({
  crumbs, onRefresh, density, onDensity, offline, leading, notice,
}: {
  crumbs: string[];
  onRefresh: () => void;
  density: 'comfortable' | 'compact';
  onDensity: (d: 'comfortable' | 'compact') => void;
  offline: boolean;
  /** Rendered before the breadcrumbs, e.g. the sidebar toggle. */
  leading?: ReactNode;
  /** Rendered before the right-hand utilities, e.g. the offline notice. */
  notice?: ReactNode;
}) {
  const updated = useLastUpdated();
  const fetching = useIsFetching();
  return (
    <div className="subheader">
      {leading}
      <nav aria-label="Breadcrumb">
        <ol className="crumbs">
          {crumbs.map((c, i) => (
            <li key={c + i} aria-current={i === crumbs.length - 1 ? 'page' : undefined}>
              {i > 0 && <ChevronRight size={12} aria-hidden className="crumb-sep" />}
              <span>{c}</span>
            </li>
          ))}
        </ol>
      </nav>
      <div className="subheader-right">
        {notice}
        {!offline && (
          <span className="updated" aria-live="polite">
            {fetching > 0 ? 'Updating…' : updated ? `Updated ${fmtTimestamp(new Date(updated).toISOString())} ${CONSOLE_TZ_LABEL}` : 'Not loaded yet'}
          </span>
        )}
        <div className="seg" role="group" aria-label="Table density">
          <button aria-pressed={density === 'comfortable'} onClick={() => onDensity('comfortable')} title="Comfortable rows" aria-label="Comfortable rows">
            <Rows3 size={13} aria-hidden />
          </button>
          <button aria-pressed={density === 'compact'} onClick={() => onDensity('compact')} title="Compact rows" aria-label="Compact rows">
            <Rows4 size={13} aria-hidden />
          </button>
        </div>
        {!offline && (
          <button className="btn btn-ghost btn-sm" onClick={onRefresh} title="Refresh all data (R)">
            <RefreshCw size={12} aria-hidden className={fetching > 0 ? 'spin' : undefined} /> Refresh
          </button>
        )}
      </div>
    </div>
  );
}

// ── Key / user menu ───────────────────────────────────────────────────
export function KeyMenu({
  prefix, scopes, onShortcuts, onForget, card = false,
}: {
  prefix: string | null;
  scopes: string[];
  onShortcuts: () => void;
  onForget: () => void;
  /** Sidebar footer card: key prefix and scope count, menu opens upward. */
  card?: boolean;
}) {
  const initials = (prefix ?? 'key').slice(0, 2).toUpperCase();
  return (
    <Menu
      label="Account and API key"
      width={card ? 248 : 280}
      align="left"
      placement={card ? 'up' : 'down'}
      className={card ? 'menu-keycard' : undefined}
      trigger={card ? (
        <>
          <span className="avatar" aria-hidden>{initials}</span>
          <span className="kc-text">
            <span className="kc-title mono">{prefix ? `${prefix}…` : 'API key'}</span>
            <span className="kc-sub">{scopes.includes('admin') ? 'Admin key' : `${scopes.length} ${scopes.length === 1 ? 'scope' : 'scopes'}`}</span>
          </span>
          <ChevronsUpDown size={14} aria-hidden className="ws-chevron" />
        </>
      ) : (
        <>
          <span className="avatar" aria-hidden>{initials}</span>
          <ChevronDown size={12} aria-hidden />
        </>
      )}
    >
      {close => (
        <>
          <div className="menu-label">Signed in with API key</div>
          <div className="menu-keyline">
            <span className="mono">{prefix ? `${prefix}…` : 'unknown'}</span>
            {prefix && <CopyInline value={prefix} />}
          </div>
          <div className="menu-scopes">
            {scopes.length ? scopes.map(s => <span key={s} className="scope-chip mono">{s}</span>) : <span className="menu-meta">No scopes reported</span>}
          </div>
          <div className="menu-sep" />
          <MenuItem icon={<Keyboard size={13} />} onSelect={() => { close(); onShortcuts(); }}>Keyboard shortcuts</MenuItem>
          <MenuItem icon={<LogOut size={13} />} onSelect={onForget} danger>Forget key and sign out</MenuItem>
        </>
      )}
    </Menu>
  );
}

function CopyInline({ value }: { value: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      className="icon-ghost"
      aria-label="Copy key prefix"
      onClick={async () => { setOk(await copyToClipboard(value)); setTimeout(() => setOk(false), 1200); }}
    >
      {ok ? <Check size={12} /> : <Copy size={12} />}
    </button>
  );
}
