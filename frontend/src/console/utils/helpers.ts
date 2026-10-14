/** Utility helpers for the console. */
import { type AuditEvent, type ToolPin } from '../api/client';

// ── Formatting ────────────────────────────────────────────────────────

export function fmtTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-GB', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
}

export function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

export function fmtDatetime(iso: string): string {
  return `${fmtDate(iso)}  ${fmtTimestamp(iso)}`;
}

export function fmtDuration(ms: number | null | undefined): string {
  if (ms == null) return '—';
  if (ms < 1) return '<1 ms';
  if (ms < 1000) return `${ms.toFixed(1)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

export function fmtBytes(b: number | null | undefined): string {
  if (b == null) return '—';
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1048576).toFixed(2)} MB`;
}

export function shortenHash(h: string | null | undefined, len = 16): string {
  if (!h) return '—';
  return h.length > len ? h.slice(0, len) + '…' : h;
}

export function elapsedSince(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ── Pin badge logic ───────────────────────────────────────────────────

export type PinBadge = 'trusted' | 'review' | 'drift' | 'revoked' | 'unknown';

export function getPinBadge(pin: ToolPin): PinBadge {
  if (pin.status === 'revoked') return 'revoked';
  if (pin.status === 'approved' && pin.matches) return 'trusted';
  if (pin.status === 'approved' && !pin.matches) return 'drift';
  if (pin.status === 'pending' || pin.status === null) return 'review';
  return 'unknown';
}

export const PIN_BADGE_CLASS: Record<PinBadge, string> = {
  trusted: 'badge-allow',
  review:  'badge-review',
  drift:   'badge-deny',
  revoked: 'badge-deny',
  unknown: 'badge-muted',
};

export const PIN_BADGE_LABEL: Record<PinBadge, string> = {
  trusted: 'Trusted',
  review:  'Review',
  drift:   'Drift',
  revoked: 'Revoked',
  unknown: 'Unknown',
};

// ── Audit coloring ────────────────────────────────────────────────────

export function auditRowClass(evt: AuditEvent): string {
  if (evt.decision === 'denied' || evt.status === 'denied') return 'text-[var(--c-deny)]';
  if (evt.status === 'error') return 'text-[var(--c-review)]';
  return '';
}

export function decisionBadgeClass(decision: string): string {
  if (decision === 'allowed') return 'badge-allow';
  if (decision === 'denied')  return 'badge-deny';
  return 'badge-muted';
}

// ── Severity ──────────────────────────────────────────────────────────

export function severityClass(sev: string): string {
  switch (sev.toLowerCase()) {
    case 'critical': return 'sev-critical';
    case 'high':     return 'sev-high';
    case 'medium':   return 'sev-medium';
    case 'low':      return 'sev-low';
    default:         return '';
  }
}

export function severityBadgeClass(sev: string): string {
  switch (sev.toLowerCase()) {
    case 'critical': return 'badge-deny';
    case 'high':     return 'badge-deny';
    case 'medium':   return 'badge-review';
    case 'low':      return 'badge-info';
    default:         return 'badge-muted';
  }
}

// ── Sandbox status ────────────────────────────────────────────────────

export function sandboxStatusBadgeClass(status: string): string {
  switch (status) {
    case 'succeeded': return 'badge-allow';
    case 'failed':
    case 'timeout':
    case 'rejected': return 'badge-deny';
    case 'running':  return 'badge-review';
    default:         return 'badge-muted';
  }
}

// ── Clipboard ─────────────────────────────────────────────────────────

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

// ── Valid scopes ──────────────────────────────────────────────────────
export const ALL_SCOPES = [
  'notes:read',
  'notes:write',
  'audit:read',
  'metrics:read',
  'sandbox:read',
  'tools:read',
  'scanner:read',
  'agent:run',
  'admin',
] as const;

export type Scope = typeof ALL_SCOPES[number];
