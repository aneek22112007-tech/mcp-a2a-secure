import { useState, useCallback } from 'react';
import {
  FileText, Filter, ChevronDown, ChevronUp, X,
} from 'lucide-react';
import { useAudit, useAuditStream } from '../../api/hooks';
import {
  LoadingPanel, ErrorPanel, EmptyState, StreamDot,
  Pager, Drawer, DetailRow, ConsoleErrorBoundary,
} from '../../components/ui';
import {
  fmtTimestamp, fmtDatetime, fmtDuration,
  decisionBadgeClass, auditRowClass,
} from '../../utils/helpers';
import { DEMO_AUDIT_EVENTS } from '../../demo/demoData';
import type { AuditEvent } from '../../api/client';

interface AuditViewProps { isDemo: boolean }

const ACTION_OPTIONS = [
  '', 'auth.allow', 'auth.deny', 'tool.call', 'tool.result',
  'mcp.tools_call', 'tool.pin.approve', 'tool.pin.revoke',
  'tool.pin.deny', 'tool.pin.drift', 'tool.pin.unapproved',
  'tool.scan.completed', 'tool.scan.finding', 'tool.scan.manual',
  'tool.scan.finding.resolved',
];

function AuditRow({
  evt,
  onClick,
  isNew,
}: {
  evt: AuditEvent;
  onClick: () => void;
  isNew: boolean;
}) {
  const denied = evt.decision === 'denied' || evt.status === 'denied';
  return (
    <tr
      className={isNew ? (denied ? 'row-enter snap-deny' : 'row-enter') : ''}
      onClick={onClick}
      style={{ cursor: 'pointer' }}
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onClick()}
      aria-label={`Audit event: ${evt.action} ${evt.decision}`}
    >
      <td className="mono" style={{ color: 'var(--c-text-dim)', whiteSpace: 'nowrap', fontSize: 11 }}>
        {fmtTimestamp(evt.created_at)}
      </td>
      <td>
        <span
          className={`mono ${auditRowClass(evt)}`}
          style={{ fontSize: 11 }}
        >
          {evt.action}
        </span>
      </td>
      <td>
        <span className={`badge ${decisionBadgeClass(evt.decision)}`}>
          {evt.decision}
        </span>
      </td>
      <td className="mono" style={{ fontSize: 11, color: 'var(--c-text-muted)' }}>
        {evt.tool_name ?? '—'}
      </td>
      <td className="mono" style={{ fontSize: 11, color: 'var(--c-text-dim)' }}>
        {evt.key_prefix ?? '—'}
      </td>
      <td className="mono" style={{ fontSize: 11, color: 'var(--c-text-muted)' }}>
        {fmtDuration(evt.duration_ms)}
      </td>
      <td className="mono" style={{ fontSize: 11, color: 'var(--c-text-dim)' }}>
        {evt.reason ? evt.reason.slice(0, 28) + (evt.reason.length > 28 ? '…' : '') : '—'}
      </td>
    </tr>
  );
}

function AuditViewInner({ isDemo }: AuditViewProps) {
  const [offset, setOffset] = useState(0);
  const limit = 50;

  // Filters
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filterAction, setFilterAction] = useState('');
  const [filterDecision, setFilterDecision] = useState<'' | 'allowed' | 'denied'>('');
  const [filterTool, setFilterTool] = useState('');
  const [filterPrefix, setFilterPrefix] = useState('');

  const [selected, setSelected] = useState<AuditEvent | null>(null);

  // SSE live stream
  const { events: streamEvents, state: streamState } = useAuditStream(50);

  // REST page
  const queryParams = {
    action: filterAction || undefined,
    decision: (filterDecision || undefined) as 'allowed' | 'denied' | undefined,
    tool_name: filterTool || undefined,
    key_prefix: filterPrefix || undefined,
    limit,
    offset,
  };
  const { data, isLoading, isError, refetch } = useAudit(queryParams, !isDemo);

  const clearFilters = useCallback(() => {
    setFilterAction('');
    setFilterDecision('');
    setFilterTool('');
    setFilterPrefix('');
    setOffset(0);
  }, []);

  const hasFilters = !!(filterAction || filterDecision || filterTool || filterPrefix);

  // Merge: SSE events prepend at top (only when no filters active + page 0)
  const pageItems: AuditEvent[] = isDemo
    ? DEMO_AUDIT_EVENTS
    : (data?.items ?? []);

  const showLiveStrip = !isDemo && !hasFilters && offset === 0;
  const displayItems = showLiveStrip
    ? [...streamEvents.slice(0, 5), ...pageItems].slice(0, limit)
    : pageItems;

  const seenIds = new Set(streamEvents.slice(0, 5).map(e => e.id));

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--c-text)', margin: 0 }}>
            Live Audit
          </h1>
          <p style={{ fontSize: 11, color: 'var(--c-text-muted)', margin: '2px 0 0' }}>
            {data
              ? `${data.items.length} events on this page`
              : isDemo ? `${DEMO_AUDIT_EVENTS.length} demo events` : 'Loading…'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <StreamDot state={isDemo ? 'offline' : streamState} />
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setFiltersOpen(f => !f)}
            aria-expanded={filtersOpen}
            aria-label="Toggle filters"
          >
            <Filter size={12} />
            Filters
            {hasFilters && (
              <span
                style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: 'var(--c-amber)', marginLeft: 2,
                }}
              />
            )}
            {filtersOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
        </div>
      </div>

      {/* Filter bar */}
      {filtersOpen && (
        <div
          className="panel"
          style={{
            padding: 14,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 10,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label className="section-label" htmlFor="f-action">Action</label>
            <select
              id="f-action"
              className="input"
              value={filterAction}
              onChange={e => { setFilterAction(e.target.value); setOffset(0); }}
              style={{ fontSize: 11 }}
            >
              {ACTION_OPTIONS.map(a => (
                <option key={a} value={a}>{a || '— any —'}</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label className="section-label" htmlFor="f-decision">Decision</label>
            <select
              id="f-decision"
              className="input"
              value={filterDecision}
              onChange={e => { setFilterDecision(e.target.value as '' | 'allowed' | 'denied'); setOffset(0); }}
              style={{ fontSize: 11 }}
            >
              <option value="">— any —</option>
              <option value="allowed">allowed</option>
              <option value="denied">denied</option>
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label className="section-label" htmlFor="f-tool">Tool</label>
            <input
              id="f-tool"
              className="input mono"
              placeholder="e.g. list_notes"
              value={filterTool}
              onChange={e => { setFilterTool(e.target.value); setOffset(0); }}
              style={{ fontSize: 11 }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label className="section-label" htmlFor="f-prefix">Key prefix</label>
            <input
              id="f-prefix"
              className="input mono"
              placeholder="e.g. f10598f5"
              value={filterPrefix}
              onChange={e => { setFilterPrefix(e.target.value); setOffset(0); }}
              style={{ fontSize: 11 }}
            />
          </div>
          {hasFilters && (
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button className="btn btn-ghost btn-sm" onClick={clearFilters}>
                <X size={11} /> Clear
              </button>
            </div>
          )}
        </div>
      )}

      {/* Table */}
      <div className="panel">
        {!isDemo && isLoading && !data ? (
          <LoadingPanel label="Loading audit events…" />
        ) : !isDemo && isError ? (
          <ErrorPanel message="Failed to load audit events" onRetry={() => void refetch()} />
        ) : displayItems.length === 0 ? (
          <EmptyState label="No audit events match the current filters." icon={FileText} />
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Action</th>
                    <th>Decision</th>
                    <th>Tool</th>
                    <th>Key</th>
                    <th>Duration</th>
                    <th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {displayItems.map((evt, i) => (
                    <AuditRow
                      key={evt.id + i}
                      evt={evt}
                      onClick={() => setSelected(evt)}
                      isNew={showLiveStrip && seenIds.has(evt.id) && i < 5}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            {!isDemo && data && (
              <Pager
                offset={offset}
                limit={limit}
                nextOffset={data.next_offset}
                onPrev={() => setOffset(o => Math.max(0, o - limit))}
                onNext={() => data.next_offset !== null && setOffset(data.next_offset)}
              />
            )}
          </>
        )}
      </div>

      {/* Detail drawer */}
      <Drawer
        open={!!selected}
        title="Audit Event Detail"
        onClose={() => setSelected(null)}
      >
        {selected && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <DetailRow label="ID"><span className="mono" style={{ fontSize: 11 }}>{selected.id}</span></DetailRow>
            <DetailRow label="Timestamp">{fmtDatetime(selected.created_at)}</DetailRow>
            <DetailRow label="Action">
              <span className={`mono ${auditRowClass(selected)}`}>{selected.action}</span>
            </DetailRow>
            <DetailRow label="Decision">
              <span className={`badge ${decisionBadgeClass(selected.decision)}`}>{selected.decision}</span>
            </DetailRow>
            <DetailRow label="Status">{selected.status}</DetailRow>
            <DetailRow label="Status code">
              <span className="mono">{selected.status_code ?? '—'}</span>
            </DetailRow>
            <DetailRow label="Error code">
              <span className="mono" style={{ color: selected.error_code ? 'var(--c-deny)' : 'var(--c-text-dim)' }}>
                {selected.error_code ?? '—'}
              </span>
            </DetailRow>
            <DetailRow label="Reason">
              <span className="mono" style={{ fontSize: 11 }}>{selected.reason ?? '—'}</span>
            </DetailRow>
            <DetailRow label="Tool"><span className="mono">{selected.tool_name ?? '—'}</span></DetailRow>
            <DetailRow label="Args hash">
              <span className="mono" style={{ fontSize: 11 }}>{selected.args_hash ?? '—'}</span>
            </DetailRow>
            <DetailRow label="Duration">{fmtDuration(selected.duration_ms)}</DetailRow>
            <DetailRow label="Key prefix"><span className="mono">{selected.key_prefix ?? '—'}</span></DetailRow>
            <DetailRow label="Client ID">
              <span className="mono" style={{ fontSize: 11 }}>{selected.client_id ?? '—'}</span>
            </DetailRow>
            <DetailRow label="API key ID">
              <span className="mono" style={{ fontSize: 11 }}>{selected.api_key_id ?? '—'}</span>
            </DetailRow>
            <DetailRow label="Client IP"><span className="mono">{selected.client_ip ?? '—'}</span></DetailRow>
            <DetailRow label="Request ID">
              <span className="mono" style={{ fontSize: 11 }}>{selected.request_id ?? '—'}</span>
            </DetailRow>
          </div>
        )}
      </Drawer>
    </div>
  );
}

export function AuditView(props: AuditViewProps) {
  return (
    <ConsoleErrorBoundary>
      <AuditViewInner {...props} />
    </ConsoleErrorBoundary>
  );
}
