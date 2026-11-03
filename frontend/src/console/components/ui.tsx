/** Shared console UI components */
import React, { useState, useCallback, type ReactNode } from 'react';
import { useDialogA11y } from './a11y';
import { Copy, Check, AlertTriangle, Info, Loader2 } from 'lucide-react';
import { copyToClipboard } from '../utils/helpers';
import type { StreamState } from '../api/client';

// ── Error Boundary ────────────────────────────────────────────────────
interface EBState { error: Error | null }

export class ConsoleErrorBoundary extends React.Component<
  { children: ReactNode; fallback?: ReactNode },
  EBState
> {
  state: EBState = { error: null };

  static getDerivedStateFromError(e: Error): EBState {
    return { error: e };
  }

  render() {
    if (this.state.error) {
      return this.props.fallback ?? (
        <div className="panel p-6" style={{ color: 'var(--c-deny)' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <AlertTriangle size={16} />
            <span className="section-label">Component error</span>
          </div>
          <p className="mono" style={{ marginTop: 8, fontSize: 11 }}>
            {this.state.error.message}
          </p>
          <button
            className="btn btn-ghost btn-sm"
            style={{ marginTop: 12 }}
            onClick={() => this.setState({ error: null })}
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Loading spinner ───────────────────────────────────────────────────
export function Spinner({ size = 16 }: { size?: number }) {
  return (
    <Loader2
      size={size}
      style={{
        animation: 'spin 1s linear infinite',
        color: 'var(--c-text-muted)',
      }}
    />
  );
}

// ── Copy button ───────────────────────────────────────────────────────
export function CopyButton({
  value,
  label = 'Copy',
}: {
  value: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    const ok = await copyToClipboard(value);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [value]);

  return (
    <button
      className="btn btn-ghost btn-sm"
      onClick={handleCopy}
      aria-label={copied ? 'Copied' : label}
      title={copied ? 'Copied!' : label}
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
      {copied ? 'Copied' : label}
    </button>
  );
}

// ── Mono value with copy ──────────────────────────────────────────────
export function MonoValue({
  value,
  copyable = false,
  maxLen,
}: {
  value: string | null | undefined;
  copyable?: boolean;
  maxLen?: number;
}) {
  if (!value) return <span style={{ color: 'var(--c-text-dim)' }}>—</span>;
  const display = maxLen && value.length > maxLen
    ? value.slice(0, maxLen) + '…'
    : value;

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <span className="mono">{display}</span>
      {copyable && value && (
        <CopyButton value={value} label="Copy" />
      )}
    </span>
  );
}

// ── SSE connection dot ────────────────────────────────────────────────
const STATE_COLORS: Record<StreamState, string> = {
  connecting:   'var(--c-review)',
  live:         'var(--c-allow)',
  reconnecting: 'var(--c-review)',
  offline:      'var(--c-deny)',
};

const STATE_LABELS: Record<StreamState, string> = {
  connecting:   'Connecting',
  live:         'Live',
  reconnecting: 'Reconnecting',
  offline:      'Offline',
};

export function StreamDot({ state }: { state: StreamState }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        fontSize: 11,
        color: STATE_COLORS[state],
      }}
      aria-label={`Stream: ${STATE_LABELS[state]}`}
    >
      <span
        className={state === 'live' ? 'pulse-dot' : undefined}
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: STATE_COLORS[state],
          display: 'inline-block',
        }}
      />
      {STATE_LABELS[state]}
    </span>
  );
}

// ── Empty state ───────────────────────────────────────────────────────
type LucideIcon = React.FC<{ size?: number; style?: React.CSSProperties }>;

export function EmptyState({ label, icon: Icon = Info, hint, command }: {
  label: string;
  icon?: LucideIcon;
  hint?: string;
  /** A real shell command that produces data for this panel. */
  command?: string;
}) {
  return (
    <div className="empty-state-premium" role="status">
      <span className="empty-icon" aria-hidden><Icon size={16} /></span>
      <span style={{ fontSize: 13, color: 'var(--c-text)', fontWeight: 500 }}>{label}</span>
      {hint && <span style={{ fontSize: 12, color: 'var(--c-text-muted)', maxWidth: 460 }}>{hint}</span>}
      {command && (
        <div className="cmd-block">
          <code className="mono">{command}</code>
          <CopyButton value={command} label="Copy" />
        </div>
      )}
    </div>
  );
}

// ── Loading panel ─────────────────────────────────────────────────────
export function LoadingPanel({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="loading-skeleton" role="status" aria-live="polite" aria-busy="true">
      <div className="loading-skeleton-label"><Spinner /> {label}</div>
      {[72, 88, 64, 80].map((w, i) => (
        <div key={i} className="loading-skeleton-row">
          <span className="skeleton" style={{ width: 84 }} />
          <span className="skeleton" style={{ width: `${w}%` }} />
          <span className="skeleton" style={{ width: 64 }} />
        </div>
      ))}
    </div>
  );
}

// ── Error panel ───────────────────────────────────────────────────────
export function ErrorPanel({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div
      className="panel"
      style={{
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div style={{ display: 'flex', gap: 6, color: 'var(--c-deny)', alignItems: 'center' }}>
        <AlertTriangle size={14} />
        <span style={{ fontSize: 12 }}>{message}</span>
      </div>
      {onRetry && (
        <button className="btn btn-ghost btn-sm" onClick={onRetry} style={{ alignSelf: 'flex-start' }}>
          Retry
        </button>
      )}
    </div>
  );
}

// ── Confirm modal ─────────────────────────────────────────────────────
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = 'Confirm',
  danger = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const panelRef = useDialogA11y(open, onCancel);
  if (!open) return null;
  return (
    <div
      className="modal-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className="panel modal-panel"
        style={{ width: 380, padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', color: danger ? 'var(--c-deny)' : 'var(--c-text)' }}>
          <AlertTriangle size={16} />
          <span id="confirm-title" style={{ fontWeight: 600 }}>{title}</span>
        </div>
        <p style={{ fontSize: 13, color: 'var(--c-text-muted)', lineHeight: 1.5 }}>{body}</p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={onCancel} data-autofocus>Cancel</button>
          <button
            className={danger ? 'btn btn-danger' : 'btn btn-primary'}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Pager ─────────────────────────────────────────────────────────────
export function Pager({
  offset,
  limit,
  nextOffset,
  onPrev,
  onNext,
}: {
  offset: number;
  limit: number;
  nextOffset: number | null;
  onPrev: () => void;
  onNext: () => void;
}) {
  const page = Math.floor(offset / limit) + 1;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '8px 12px',
        fontSize: 12,
        color: 'var(--c-text-muted)',
        borderTop: '1px solid var(--c-border)',
      }}
    >
      <button
        className="btn btn-ghost btn-sm"
        onClick={onPrev}
        disabled={offset === 0}
        aria-label="Previous page"
      >
        Previous
      </button>
      <span>Page {page}</span>
      <button
        className="btn btn-ghost btn-sm"
        onClick={onNext}
        disabled={nextOffset === null}
        aria-label="Next page"
      >
        Next
      </button>
    </div>
  );
}

// ── Drawer ────────────────────────────────────────────────────────────
export function Drawer({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const panelRef = useDialogA11y(open, onClose);
  if (!open) return null;
  return (
    <div
      className="modal-overlay modal-overlay-side"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 500,
        display: 'flex',
      }}
    >
      <div
        style={{ flex: 1, background: 'rgba(0,0,0,0.4)' }}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        aria-modal="true"
        className="panel scroll-y drawer-panel"
        style={{
          width: 'min(560px, 92vw)',
          height: '100%',
          borderLeft: '1px solid var(--c-border)',
          borderRadius: 0,
          display: 'flex',
          flexDirection: 'column',
        }}
        role="dialog"
        aria-label={title}
      >
        <div
          style={{
            padding: '14px 16px',
            borderBottom: '1px solid var(--c-border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexShrink: 0,
          }}
        >
          <span style={{ fontWeight: 600, fontSize: 13 }}>{title}</span>
          <button
            className="btn btn-ghost btn-sm"
            onClick={onClose}
            aria-label="Close"
          >
            Close
          </button>
        </div>
        <div style={{ padding: 16, flex: 1, overflowY: 'auto' }}>
          {children}
        </div>
      </div>
    </div>
  );
}

// ── Key-value detail row ──────────────────────────────────────────────
export function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 8, marginBottom: 10 }}>
      <span className="section-label" style={{ paddingTop: 2 }}>{label}</span>
      <span style={{ fontSize: 12, wordBreak: 'break-all' }}>{children}</span>
    </div>
  );
}
