import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  FileText, Filter, ChevronDown, ChevronUp, X,
} from 'lucide-react';
import { QK, useAuditStream } from '../../api/hooks';
import { consoleApi, type AuditEvent, type AuditPage } from '../../api/client';
import {
  LoadingPanel, ErrorPanel, EmptyState, StreamDot,
  Pager, Drawer, DetailRow, ConsoleErrorBoundary,
} from '../../components/ui';
import {
  fmtTimestamp, fmtDatetime, fmtDuration,
  decisionBadgeClass, auditRowClass, isConsolePoll,
} from '../../utils/helpers';
import { DEMO_AUDIT_EVENTS } from '../../demo/demoData';

interface AuditViewProps { isDemo: boolean }

const AUDIT_SCAN_PAGES = 20;
const AUDIT_RAW_LIMIT = 100;

type AuditQuery = Parameters<typeof consoleApi.listAudit>[0];

/** Walk GET /api/audit until `limit` rows are not the console's own GET /api polls. */
async function listAuditUntilReal(params: AuditQuery): Promise<AuditPage> {
  const wanted = params.limit ?? 50;
  const start = params.offset ?? 0;
  const items: AuditEvent[] = [];
  const seen = new Set<string>();
  let rawOffset = start;
  let nextOffset: number | null = null;
  for (let page = 0; page < AUDIT_SCAN_PAGES && items.length < wanted; page += 1) {
    const audit = await consoleApi.listAudit({
      ...params,
      limit: AUDIT_RAW_LIMIT,
      offset: rawOffset,
    });
    if (audit.items.length === 0) {
      nextOffset = null;
      break;
    }
    let filled = false;
    for (let index = 0; index < audit.items.length; index += 1) {
      const item = audit.items[index];
      if (isConsolePoll(item) || seen.has(item.id)) continue;
      seen.add(item.id);
      items.push(item);
      if (items.length >= wanted) {
        const consumed = index + 1;
        nextOffset = consumed < audit.items.length ? rawOffset + consumed : audit.next_offset;
        filled = true;
        break;
      }
    }
    if (filled) break;
    nextOffset = audit.next_offset;
    if (nextOffset == null) break;
    rawOffset = nextOffset;
  }
  return {
    items: items.slice(0, wanted),
    limit: wanted,
    offset: start,
    next_offset: nextOffset,
  };
}

function dedupeEvents(events: AuditEvent[]): AuditEvent[] {
  const seen = new Set<string>();
  const unique: AuditEvent[] = [];
  for (const evt of events) {
    if (seen.has(evt.id)) continue;
    seen.add(evt.id);
    unique.push(evt);
  }
  return unique;
}

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
  const [cursors, setCursors] = useState<number[]>([0]);
  const [pageIndex, setPageIndex] = useState(0);
  const limit = 50;
  const offset = cursors[pageIndex] ?? 0;

  // Filters
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filterAction, setFilterAction] = useState('');
  const [filterDecision, setFilterDecision] = useState<'' | 'allowed' | 'denied'>('');
  const [filterTool, setFilterTool] = useState('');
  const [filterPrefix, setFilterPrefix] = useState('');
  const [showConsolePolls, setShowConsolePolls] = useState(false);

  const [selected, setSelected] = useState<AuditEvent | null>(null);

  // SSE live stream
  const { events: streamEvents, state: streamState } = useAuditStream(50, !isDemo);

  const resetPage = useCallback(() => {
    setCursors([0]);
    setPageIndex(0);
  }, []);

  // REST page. With polls hidden, keep requesting until 50 other rows are in hand.
  const queryParams: AuditQuery = {
    action: filterAction || undefined,
    decision: (filterDecision || undefined) as 'allowed' | 'denied' | undefined,
    tool_name: filterTool || undefined,
    key_prefix: filterPrefix || undefined,
    limit,
    offset,
  };
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: [...QK.audit(queryParams), showConsolePolls ? 'raw' : 'real'],
    queryFn: () => showConsolePolls ? consoleApi.listAudit(queryParams) : listAuditUntilReal(queryParams),
    refetchInterval: 10_000,
    retry: 0,
    enabled: !isDemo,
  });

  const clearFilters = useCallback(() => {
    setFilterAction('');
    setFilterDecision('');
    setFilterTool('');
    setFilterPrefix('');
    resetPage();
  }, [resetPage]);

  const hasFilters = !!(filterAction || filterDecision || filterTool || filterPrefix);

  const pageItems: AuditEvent[] = isDemo
    ? DEMO_AUDIT_EVENTS
    : (data?.items ?? []);
  const liveEvents = showConsolePolls
    ? streamEvents
    : streamEvents.filter(evt => !isConsolePoll(evt));
  const visiblePage = showConsolePolls
    ? pageItems
    : pageItems.filter(evt => !isConsolePoll(evt));

  const showLiveStrip = !isDemo && !hasFilters && pageIndex === 0;
  const displayItems = showLiveStrip
    ? dedupeEvents([...liveEvents.slice(0, 5), ...visiblePage]).slice(0, limit)
    : visiblePage;

  const seenIds = new Set(liveEvents.slice(0, 5).map(e => e.id));

  return (
    <div className="console-page">

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--c-text)', margin: 0 }}>
            Live Audit
          </h1>
          <p style={{ fontSize: 11, color: 'var(--c-text-muted)', margin: '2px 0 0' }}>
            {isDemo
              ? `${displayItems.length} demo events`
              : data
                ? `${displayItems.length} events`
                : 'Loading…'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {!isDemo && <StreamDot state={streamState} />}
          <label className="toggle">
            <input
              type="checkbox"
              checked={showConsolePolls}
              onChange={event => {
                setShowConsolePolls(event.target.checked);
                resetPage();
              }}
            />
            Show console GET /api polls
          </label>
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
              onChange={e => { setFilterAction(e.target.value); resetPage(); }}
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
              onChange={e => { setFilterDecision(e.target.value as '' | 'allowed' | 'denied'); resetPage(); }}
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
              onChange={e => { setFilterTool(e.target.value); resetPage(); }}
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
              onChange={e => { setFilterPrefix(e.target.value); resetPage(); }}
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
                offset={pageIndex * limit}
                limit={limit}
                nextOffset={data.next_offset}
                onPrev={() => setPageIndex(index => Math.max(0, index - 1))}
                onNext={() => {
                  if (data.next_offset == null) return;
                  const next = data.next_offset;
                  setCursors(current => {
                    const copy = current.slice(0, pageIndex + 1);
                    copy.push(next);
                    return copy;
                  });
                  setPageIndex(index => index + 1);
                }}
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
