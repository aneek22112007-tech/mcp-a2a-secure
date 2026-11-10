/** Utility helpers for the console. */
import { type AuditEvent, type ToolPin } from '../api/client';

// ── Formatting ────────────────────────────────────────────────────────

/** All console times are shown in India Standard Time. */
export const CONSOLE_TZ = 'Asia/Kolkata';
export const CONSOLE_TZ_LABEL = 'IST';

const timeFmt = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: CONSOLE_TZ,
});
const dateFmt = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit', month: 'short', year: 'numeric', timeZone: CONSOLE_TZ,
});

function parseIso(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function fmtTimestamp(iso: string | null | undefined): string {
  const d = parseIso(iso);
  return d ? timeFmt.format(d) : '—';
}

export function fmtDate(iso: string | null | undefined): string {
  const d = parseIso(iso);
  return d ? dateFmt.format(d) : '—';
}

export function fmtDatetime(iso: string | null | undefined): string {
  const d = parseIso(iso);
  return d ? `${dateFmt.format(d)}, ${timeFmt.format(d)} ${CONSOLE_TZ_LABEL}` : '—';
}

const numberFmt = new Intl.NumberFormat('en-US');
export function fmtNumber(n: number | null | undefined): string {
  return n == null || !Number.isFinite(n) ? '—' : numberFmt.format(n);
}

export function fmtPercent(n: number | null | undefined, digits = 1): string {
  return n == null || !Number.isFinite(n) ? '—' : `${(n * 100).toFixed(digits).replace(/\.0$/, '')}%`;
}

export function fmtDuration(ms: number | null | undefined): string {
  if (ms == null) return '—';
  if (ms < 1) return '<1 ms';
  if (ms < 1000) return `${ms.toFixed(1)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

function fmtScaled(value: number, unit: string): string {
  const text = value >= 10 ? value.toFixed(0) : value.toFixed(1);
  return `${text.replace(/\.0$/, '')} ${unit}`;
}

export function fmtBytes(b: number | null | undefined): string {
  if (b == null) return '—';
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return fmtScaled(b / 1024, 'KB');
  if (b < 1073741824) return fmtScaled(b / 1048576, 'MB');
  return fmtScaled(b / 1073741824, 'GB');
}

/** Uptime from whole seconds, for example "6m 22s". */
export function fmtUptime(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return '—';
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/** Console polling rows: auth.allow for GET /api/*. Hidden in Live Audit by default. */
export function isConsolePoll(evt: AuditEvent): boolean {
  if (evt.action !== 'auth.allow') return false;
  return /^route=GET \/api\//.test(evt.reason ?? '');
}

export function shortenHash(h: string | null | undefined, len = 16): string {
  if (!h) return '—';
  return h.length > len ? h.slice(0, len) + '…' : h;
}

export function elapsedSince(iso: string | null | undefined): string {
  const d = parseIso(iso);
  if (!d) return '—';
  const diff = Date.now() - d.getTime();
  const s = Math.max(0, Math.floor(diff / 1000));
  if (s < 5) return 'just now';
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
  if (evt.decision === 'denied' || evt.status === 'denied') return 'tone-deny';
  if (evt.status === 'error') return 'tone-review';
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
  'files:read',
  'files:write',
  'audit:read',
  'metrics:read',
  'sandbox:read',
  'tools:read',
  'scanner:read',
  'agent:run',
  'admin',
] as const;

export type Scope = typeof ALL_SCOPES[number];

const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
export const MOD_KEY = IS_MAC ? '⌘' : 'Ctrl';

export function envFromBase(base: string): { name: string; host: string } {
  let host = base;
  try { host = new URL(base).host; } catch { /* keep raw */ }
  const h = host.split(':')[0];
  const local = h === 'localhost' || h === '127.0.0.1' || h === '0.0.0.0' || h.endsWith('.local');
  return { name: local ? 'local' : h.split('.')[0], host };
}


export function plural(n: number, one: string, many = `${one}s`): string {
  return `${fmtNumber(n)} ${n === 1 ? one : many}`;
}

/** Nearest-rank percentile. Returns null for an empty list. */
export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[rank];
}

/** Real commands shown in empty states. The key stays a shell variable; it is never filled in. */
export function trafficCommands(base: string) {
  const b = base.replace(/\/$/, '');
  return {
    restCall: `curl -s -H "Authorization: Bearer $MCPG_API_KEY" ${b}/api/notes`,
    mcpCall: `curl -s -X POST ${b}/mcp/ -H "Authorization: Bearer $MCPG_API_KEY" -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`,
    agent: 'cd api && uv run python scripts/run_notes_agent.py "list my notes"',
    scan: `curl -s -X POST -H "Authorization: Bearer $MCPG_API_KEY" ${b}/api/scanner/run`,
    sandbox: `curl -s -H "Authorization: Bearer $MCPG_API_KEY" ${b}/api/notes`,
  };
}
