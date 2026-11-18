import { useState, useCallback } from 'react';
import { ShieldAlert, ShieldCheck, ShieldOff, Copy, Check, Activity } from 'lucide-react';
import { toast } from 'sonner';
import { useAudit, useMetrics } from '../../api/hooks';
import type { AuditEvent } from '../../api/client';
import {
  LoadingPanel, ErrorPanel, EmptyState,
  Pager, Drawer, DetailRow, ConsoleErrorBoundary, CopyButton,
} from '../../components/ui';
import {
  fmtDatetime, fmtNumber, elapsedSince,
  severityBadgeClass, shortenHash, copyToClipboard,
} from '../../utils/helpers';

interface GuardViewProps {
  offline: boolean;
  scopes: string[];
}

interface ParsedGuardReason {
  mode: string | null;
  action: string | null;
  severity: string | null;
  rules: string[];
}

const GUARD_ACTION = 'tool.output.injection';

/** Parse `mode=enforce action=blocked severity=high rules=G1,G3` from audit reason. */
function parseGuardReason(reason: string | null): ParsedGuardReason {
  const parsed: ParsedGuardReason = {
    mode: null,
    action: null,
    severity: null,
    rules: [],
  };
  if (!reason) return parsed;
  for (const part of reason.trim().split(/\s+/)) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    const key = part.slice(0, eq);
    const val = part.slice(eq + 1);
    if (!val) continue;
    if (key === 'mode') parsed.mode = val;
    else if (key === 'action') parsed.action = val;
    else if (key === 'severity') parsed.severity = val;
    else if (key === 'rules') {
      parsed.rules = val.split(',').map(r => r.trim()).filter(Boolean);
    }
  }
  return parsed;
}

function guardActionBadgeClass(action: string | null): string {
  switch (action?.toLowerCase()) {
    case 'blocked':
    case 'denied':
      return 'badge-deny';
    case 'cleaned':
    case 'sanitized':
      return 'badge-review';
    case 'logged':
      return 'badge-info';
    case 'allow':
    case 'allowed':
      return 'badge-allow';
    default:
      return 'badge-muted';
  }
}

function guardModeBadgeClass(mode: string | null): string {
  switch (mode?.toLowerCase()) {
    case 'enforce':
      return 'badge-allow';
    case 'warn':
      return 'badge-review';
    case 'off':
      return 'badge-muted';
    default:
      return 'badge-muted';
  }
}

function RequestIdCopyButton({ requestId }: { requestId: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    const ok = await copyToClipboard(requestId);
    if (ok) {
      setCopied(true);
      toast.success('Request ID copied');
      setTimeout(() => setCopied(false), 2000);
    } else {
      toast.error('Failed to copy Request ID');
    }
  }, [requestId]);

  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm"
      onClick={e => void handleCopy(e)}
      aria-label={copied ? 'Copied request ID' : `Copy request ID ${requestId}`}
      title={copied ? 'Copied!' : `Copy ${requestId}`}
      style={{ padding: '2px 6px', fontSize: 11 }}
    >
      {copied ? <Check size={11} aria-hidden /> : <Copy size={11} aria-hidden />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

function StatCard({
  label,
  value,
  tone,
  icon,
  sub,
}: {
  label: string;
  value: React.ReactNode;
  tone: string;
  icon: React.ReactNode;
  sub: string;
}) {
  return (
    <div className="kpi-card" style={{ ['--kpi-tone' as string]: tone, gap: 8 }}>
      <div className="kpi-head">
        <span className="kpi-icon" aria-hidden>{icon}</span>
        <span className="stat-card-label">{label}</span>
      </div>
      <div className="kpi-value" style={{ fontSize: 24 }}>{value}</div>
      <div className="kpi-foot-note">{sub}</div>
    </div>
  );
}

function GuardViewInner({ offline: _offline, scopes }: GuardViewProps) {
  const [offset, setOffset] = useState(0);
  const limit = 50;
  const [selected, setSelected] = useState<AuditEvent | null>(null);

  const canReadMetrics = scopes.includes('admin') || scopes.includes('metrics:read');

  const eventsQuery = useAudit({
    action: GUARD_ACTION,
    limit,
    offset,
  });

  // Always fetch the newest matching event separately so "Mode on latest event"
  // stays accurate even when paging through older rows.
  const latestQuery = useAudit(
    { action: GUARD_ACTION, limit: 1, offset: 0 },
    offset > 0,
  );

  const metricsQuery = useMetrics(canReadMetrics);

  // Strictly exclude guard.check or any non-tool.output.injection rows.
  const events: AuditEvent[] = (eventsQuery.data?.items ?? []).filter(
    evt => evt.action === GUARD_ACTION,
  );

  const latestEvent: AuditEvent | undefined =
    offset === 0
      ? events[0]
      : (latestQuery.data?.items ?? []).find(evt => evt.action === GUARD_ACTION);

  const latestParsed = latestEvent ? parseGuardReason(latestEvent.reason) : null;
  const latestMode = latestParsed?.mode ?? null;

  const guardMetrics = metricsQuery.data?.injection_guard;
  const selectedParsed = selected ? parseGuardReason(selected.reason) : null;

  return (
    <div className="console-page">
      <header className="page-header">
        <div>
          <h1 className="page-title">Guard Events</h1>
          <p className="page-sub">
            Prompt-injection payloads detected in tool output (<span className="mono">tool.output.injection</span>).
          </p>
        </div>
      </header>

      {/* Counters (Last 24 hours) + Mode on latest event */}
      <section aria-label="Injection guard summary">
        <div className="row-between" style={{ marginBottom: 8 }}>
          <span className="section-label">Guard counters · Last 24 hours</span>
          {metricsQuery.isError && canReadMetrics && (
            <span style={{ fontSize: 11, color: 'var(--c-deny)' }}>
              Could not load metrics counters
            </span>
          )}
        </div>
        <div
          className="kpi-row"
          style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}
        >
          <StatCard
            label="Hits"
            value={
              canReadMetrics
                ? (guardMetrics ? fmtNumber(guardMetrics.hits) : (metricsQuery.isLoading ? '…' : '—'))
                : '—'
            }
            tone="var(--c-high)"
            icon={<ShieldAlert size={13} />}
            sub="Last 24 hours"
          />
          <StatCard
            label="Blocked"
            value={
              canReadMetrics
                ? (guardMetrics ? fmtNumber(guardMetrics.blocked) : (metricsQuery.isLoading ? '…' : '—'))
                : '—'
            }
            tone="var(--c-deny)"
            icon={<ShieldOff size={13} />}
            sub="Last 24 hours"
          />
          <StatCard
            label="Sanitized"
            value={
              canReadMetrics
                ? (guardMetrics ? fmtNumber(guardMetrics.sanitized) : (metricsQuery.isLoading ? '…' : '—'))
                : '—'
            }
            tone="var(--c-review)"
            icon={<ShieldCheck size={13} />}
            sub="Last 24 hours"
          />
          <StatCard
            label="Mode on latest event"
            value={
              latestMode ? (
                <span className={`badge ${guardModeBadgeClass(latestMode)}`} style={{ fontSize: 13 }}>
                  {latestMode}
                </span>
              ) : (
                <span style={{ color: 'var(--c-text-dim)' }}>—</span>
              )
            }
            tone="var(--c-info)"
            icon={<Activity size={13} />}
            sub={
              latestEvent
                ? `${elapsedSince(latestEvent.created_at)} · ${latestEvent.tool_name ?? 'unknown tool'}`
                : 'No matching events yet'
            }
          />
        </div>
      </section>

      {/* Events table */}
      <div className="panel">
        {eventsQuery.isLoading && !eventsQuery.data ? (
          <LoadingPanel label="Loading guard events…" />
        ) : eventsQuery.isError && !eventsQuery.data ? (
          <ErrorPanel
            message="Failed to load guard events"
            onRetry={() => void eventsQuery.refetch()}
          />
        ) : events.length === 0 ? (
          <EmptyState
            label="No guard events recorded yet"
            icon={ShieldAlert}
            hint="When tool output triggers the prompt-injection guard, real tool.output.injection events appear here."
          />
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Tool</th>
                    <th>Mode</th>
                    <th>Action</th>
                    <th>Severity</th>
                    <th>Rules</th>
                    <th>Request ID</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map(evt => {
                    const meta = parseGuardReason(evt.reason);
                    const actionLabel = meta.action ?? evt.status ?? '—';
                    return (
                      <tr
                        key={evt.id}
                        onClick={() => setSelected(evt)}
                        style={{ cursor: 'pointer' }}
                        tabIndex={0}
                        onKeyDown={e => {
                          if (e.target === e.currentTarget && e.key === 'Enter') {
                            e.preventDefault();
                            setSelected(evt);
                          }
                        }}
                        aria-label={`Guard event on ${evt.tool_name ?? 'unknown tool'}, ${actionLabel}, ${fmtDatetime(evt.created_at)}`}
                      >
                        <td
                          className="mono"
                          style={{ fontSize: 11, color: 'var(--c-text-muted)', whiteSpace: 'nowrap' }}
                          title={fmtDatetime(evt.created_at)}
                        >
                          <span>{fmtDatetime(evt.created_at)}</span>
                          <span className="rel-time">{elapsedSince(evt.created_at)}</span>
                        </td>
                        <td className="mono" style={{ fontSize: 12 }}>
                          {evt.tool_name ?? '—'}
                        </td>
                        <td>
                          {meta.mode ? (
                            <span className={`badge ${guardModeBadgeClass(meta.mode)}`}>
                              {meta.mode}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--c-text-dim)' }}>—</span>
                          )}
                        </td>
                        <td>
                          <span className={`badge ${guardActionBadgeClass(actionLabel)}`}>
                            {actionLabel}
                          </span>
                        </td>
                        <td>
                          {meta.severity ? (
                            <span className={`badge ${severityBadgeClass(meta.severity)}`}>
                              {meta.severity}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--c-text-dim)' }}>—</span>
                          )}
                        </td>
                        <td>
                          {meta.rules.length > 0 ? (
                            <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>
                              {meta.rules.map(rule => (
                                <span key={rule} className="badge badge-muted mono">
                                  {rule}
                                </span>
                              ))}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--c-text-dim)' }}>—</span>
                          )}
                        </td>
                        <td onClick={e => e.stopPropagation()}>
                          {evt.request_id ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                              <span
                                className="mono"
                                style={{ fontSize: 11, color: 'var(--c-text-muted)' }}
                                title={evt.request_id}
                              >
                                {shortenHash(evt.request_id, 14)}
                              </span>
                              <RequestIdCopyButton requestId={evt.request_id} />
                            </span>
                          ) : (
                            <span style={{ color: 'var(--c-text-dim)' }}>—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {eventsQuery.data && (
              <Pager
                offset={offset}
                limit={limit}
                nextOffset={eventsQuery.data.next_offset}
                onPrev={() => setOffset(o => Math.max(0, o - limit))}
                onNext={() =>
                  eventsQuery.data?.next_offset != null &&
                  setOffset(eventsQuery.data.next_offset)
                }
              />
            )}
          </>
        )}
      </div>

      {/* Event detail drawer */}
      <Drawer
        open={!!selected}
        title="Guard Event Detail"
        onClose={() => setSelected(null)}
      >
        {selected && selectedParsed && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <DetailRow label="Event ID">
              <span className="mono" style={{ fontSize: 11 }}>{selected.id}</span>
            </DetailRow>
            <DetailRow label="Time">{fmtDatetime(selected.created_at)}</DetailRow>
            <DetailRow label="Audit action">
              <span className="mono">{selected.action}</span>
            </DetailRow>
            <DetailRow label="Tool">
              <span className="mono">{selected.tool_name ?? '—'}</span>
            </DetailRow>
            <DetailRow label="Mode">
              {selectedParsed.mode ? (
                <span className={`badge ${guardModeBadgeClass(selectedParsed.mode)}`}>
                  {selectedParsed.mode}
                </span>
              ) : '—'}
            </DetailRow>
            <DetailRow label="Action">
              <span className={`badge ${guardActionBadgeClass(selectedParsed.action ?? selected.status)}`}>
                {selectedParsed.action ?? selected.status ?? '—'}
              </span>
            </DetailRow>
            <DetailRow label="Severity">
              {selectedParsed.severity ? (
                <span className={`badge ${severityBadgeClass(selectedParsed.severity)}`}>
                  {selectedParsed.severity}
                </span>
              ) : '—'}
            </DetailRow>
            <DetailRow label="Rules">
              {selectedParsed.rules.length > 0 ? (
                <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>
                  {selectedParsed.rules.map(rule => (
                    <span key={rule} className="badge badge-muted mono">{rule}</span>
                  ))}
                </span>
              ) : '—'}
            </DetailRow>
            <DetailRow label="Decision">
              <span className="mono">{selected.decision}</span>
            </DetailRow>
            <DetailRow label="Key prefix">
              <span className="mono">{selected.key_prefix ?? '—'}</span>
            </DetailRow>
            <DetailRow label="Client IP">
              <span className="mono">{selected.client_ip ?? '—'}</span>
            </DetailRow>
            <DetailRow label="Request ID">
              {selected.request_id ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span className="mono" style={{ fontSize: 11 }}>{selected.request_id}</span>
                  <CopyButton value={selected.request_id} label="Copy" />
                </span>
              ) : '—'}
            </DetailRow>
            <DetailRow label="Reason">
              <span className="mono" style={{ fontSize: 11 }}>{selected.reason ?? '—'}</span>
            </DetailRow>
          </div>
        )}
      </Drawer>
    </div>
  );
}

export function GuardView(props: GuardViewProps) {
  return (
    <ConsoleErrorBoundary>
      <GuardViewInner {...props} />
    </ConsoleErrorBoundary>
  );
}
