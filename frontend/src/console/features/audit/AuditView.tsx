import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  FileText, Filter, ChevronDown, ChevronUp, ChevronRight, X, Search,
} from 'lucide-react';
import { QK, useAuditStream } from '../../api/hooks';
import { consoleApi, getApiBase, type AuditEvent, type AuditPage } from '../../api/client';
import { trafficCommands } from '../../utils/helpers';
import {
  LoadingPanel, ErrorPanel, EmptyState, StreamDot,
  Pager, Drawer, DetailRow, ConsoleErrorBoundary, CopyButton,
} from '../../components/ui';
import {
  fmtTimestamp, fmtDatetime, fmtDuration, elapsedSince,
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
  'tool.scan.finding.resolved', 'tool.output.injection', 'rate_limit.deny',
];

const JSON_TOKEN = /("(?:\\.|[^"\\])*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false|null)\b/g;

function JsonView({ value }: { value: unknown }) {
  const text = JSON.stringify(value, null, 2);
  // Light syntax colouring without a dependency. Input is our own JSON.stringify output.
  const out: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(JSON_TOKEN)) {
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    if (m[1]) {
      out.push(<span key={at} className={m[2] ? 'j-key' : 'j-str'}>{m[1]}</span>);
      if (m[2]) out.push(m[2]);
    } else if (m[3]) {
      out.push(<span key={at} className="j-num">{m[3]}</span>);
    } else {
      out.push(<span key={at} className="j-lit">{m[4]}</span>);
    }
    last = at + m[0].length;
  }
  out.push(text.slice(last));
  return <pre className="json-block">{out}</pre>;
}

function AuditJson({ evt }: { evt: AuditEvent }) {
  return (
    <div>
      <div className="json-head">
        <span className="section-label">Raw event</span>
        <CopyButton value={JSON.stringify(evt, null, 2)} label="Copy JSON" />
      </div>
      <JsonView value={evt} />
    </div>
  );
}

function AuditRow({
  evt,
  onOpen,
  isNew,
  expanded,
  onToggle,
}: {
  evt: AuditEvent;
  onOpen: () => void;
  isNew: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  const denied = evt.decision === 'denied' || evt.status === 'denied';
  const detailId = `audit-detail-${evt.id}`;
  return (
    <>
      <tr
        className={`${isNew ? (denied ? 'row-enter snap-deny' : 'row-enter') : ''} ${expanded ? 'is-expanded' : ''}`}
        onClick={onOpen}
        style={{ cursor: 'pointer' }}
        tabIndex={0}
        onKeyDown={e => {
          if (e.target !== e.currentTarget) return;
          if (e.key === 'Enter') { e.preventDefault(); onOpen(); }
          if (e.key === ' ' || e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
            e.preventDefault();
            if (e.key === ' ' || (e.key === 'ArrowRight') !== expanded) onToggle();
          }
        }}
        aria-label={`Audit event ${evt.action}, ${evt.decision}, ${fmtDatetime(evt.created_at)}. Enter opens details, Space expands.`}
      >
        <td style={{ width: 34, paddingRight: 0 }}>
          <button
            className="expand-btn"
            aria-expanded={expanded}
            aria-controls={detailId}
            aria-label={expanded ? 'Collapse event' : 'Expand event'}
            tabIndex={-1}
            onClick={e => { e.stopPropagation(); onToggle(); }}
          >
            <ChevronRight size={13} />
          </button>
        </td>
        <td className="mono" style={{ whiteSpace: 'nowrap', fontSize: 11 }} title={fmtDatetime(evt.created_at)}>
          <span style={{ color: 'var(--c-text-muted)' }}>{fmtTimestamp(evt.created_at)}</span>
          <span className="rel-time">{elapsedSince(evt.created_at)}</span>
        </td>
        <td>
          <span className={`mono ${auditRowClass(evt)}`} style={{ fontSize: 11 }}>
            {evt.action}
          </span>
        </td>
        <td>
          <span className={`badge ${decisionBadgeClass(evt.decision)}`}>
            {evt.decision}
          </span>
          {evt.status_code != null && evt.status_code >= 400 && (
            <span className="mono" style={{ marginLeft: 6, fontSize: 11, color: 'var(--c-text-dim)' }}>{evt.status_code}</span>
          )}
        </td>
        <td className="mono" style={{ fontSize: 11, color: 'var(--c-text-muted)' }}>
          {evt.tool_name ?? '—'}
        </td>
        <td className="mono" style={{ fontSize: 11, color: 'var(--c-text-dim)' }}>
          {evt.key_prefix ?? '—'}
        </td>
        <td className="mono" style={{ fontSize: 11, color: 'var(--c-text-muted)', textAlign: 'right' }}>
          {fmtDuration(evt.duration_ms)}
        </td>
        <td
          className="mono"
          style={{ fontSize: 11, color: 'var(--c-text-dim)', maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          title={evt.reason ?? undefined}
        >
          {evt.reason ?? '—'}
        </td>
      </tr>
      {expanded && (
        <tr className="row-detail" id={detailId}>
          <td colSpan={8}>
            <div className="row-detail-inner">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <DetailRow label="Request ID"><span className="mono" style={{ fontSize: 11, wordBreak: 'break-all' }}>{evt.request_id ?? '—'}</span></DetailRow>
                <DetailRow label="Status">{evt.status}{evt.status_code != null ? ` · ${evt.status_code}` : ''}</DetailRow>
                <DetailRow label="Error code"><span className="mono">{evt.error_code ?? '—'}</span></DetailRow>
                <DetailRow label="Client IP"><span className="mono">{evt.client_ip ?? '—'}</span></DetailRow>
                <DetailRow label="Args hash"><span className="mono" style={{ fontSize: 11, wordBreak: 'break-all' }}>{evt.args_hash ?? '—'}</span></DetailRow>
                <div style={{ marginTop: 8 }}>
                  <button className="btn btn-ghost btn-sm" onClick={onOpen}>Open full detail</button>
                </div>
              </div>
              <AuditJson evt={evt} />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function matchesSearch(evt: AuditEvent, q: string): boolean {
  if (!q) return true;
  const hay = [evt.action, evt.decision, evt.status, evt.tool_name, evt.key_prefix, evt.reason,
    evt.request_id, evt.client_ip, evt.error_code, evt.status_code, evt.id].join(' ').toLowerCase();
  return q.split(/\s+/).every(term => hay.includes(term));
}

function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
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
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [search, setSearch] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const debouncedTool = useDebounced(filterTool);
  const debouncedPrefix = useDebounced(filterPrefix);
  const [, setTick] = useState(0);

  // Re-render every 15s so relative times stay honest.
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 15_000);
    return () => clearInterval(id);
  }, []);

  // "f" inside the audit view focuses the search box ("/" and Ctrl/Cmd-K open the palette).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key === 'f' && !e.metaKey && !e.ctrlKey && !e.altKey && t && !['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)
        && !document.querySelector('[aria-modal="true"]')) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const toggleExpanded = (id: string) => setExpanded(cur => {
    const next = new Set(cur);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

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
    tool_name: debouncedTool.trim() || undefined,
    key_prefix: debouncedPrefix.trim() || undefined,
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
  const query = search.trim().toLowerCase();
  const displayItems = (showLiveStrip
    ? dedupeEvents([...liveEvents.slice(0, 5), ...visiblePage]).slice(0, limit)
    : dedupeEvents(visiblePage)).filter(evt => matchesSearch(evt, query));
  const deniedOnPage = displayItems.filter(e => e.decision === 'denied').length;

  const seenIds = new Set(liveEvents.slice(0, 5).map(e => e.id));

  return (
    <div className="console-page">

      {/* Header */}
      <header className="page-header">
        <div>
          <h1 className="page-title">Live Audit</h1>
          <p className="page-sub">
            {isDemo
              ? `${displayItems.length} demo events`
              : data
                ? `${displayItems.length} events on this page · ${deniedOnPage} denied · times in IST`
                : 'Loading…'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
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
            Show console polls
          </label>
        </div>
      </header>

      <div className="row-between" style={{ flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="search-field" style={{ width: 340 }}>
            <Search size={13} aria-hidden />
            <input
              ref={searchRef}
              className="input"
              type="search"
              placeholder="Search action, tool, key, reason, request ID…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => { if (e.key === 'Escape' && search) { e.stopPropagation(); setSearch(''); } }}
              aria-label="Search events on this page"
              style={{ paddingRight: 30 }}
            />
            {!search && <kbd className="kbd" aria-hidden>F</kbd>}
          </div>
          <div role="group" aria-label="Decision" style={{ display: 'inline-flex', gap: 6 }}>
            {(['', 'allowed', 'denied'] as const).map(d => (
              <button
                key={d || 'all'}
                className="chip"
                aria-pressed={filterDecision === d}
                onClick={() => { setFilterDecision(d); resetPage(); }}
              >
                {d === '' ? 'All' : d === 'allowed' ? 'Allowed' : 'Denied'}
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {expanded.size > 0 && (
            <button className="btn btn-ghost btn-sm" onClick={() => setExpanded(new Set())}>Collapse all</button>
          )}
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setFiltersOpen(f => !f)}
            aria-expanded={filtersOpen}
            aria-controls="audit-filters"
          >
            <Filter size={12} aria-hidden />
            More filters
            {hasFilters && (
              <span aria-label="filters active" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--c-amber)', marginLeft: 2 }} />
            )}
            {filtersOpen ? <ChevronUp size={12} aria-hidden /> : <ChevronDown size={12} aria-hidden />}
          </button>
        </div>
      </div>

      {/* Filter bar */}
      {filtersOpen && (
        <div
          id="audit-filters"
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
          <EmptyState
            label={query ? `No events on this page match “${search.trim()}”.` : hasFilters ? 'No audit events match the current filters.' : 'No audit events yet'}
            hint={query || hasFilters ? undefined : 'Every gateway call is written here and streamed live. Send one with any key to see it:'}
            command={query || hasFilters ? undefined : trafficCommands(getApiBase()).restCall}
            icon={FileText}
          />
        ) : (
          <>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th aria-label="Expand" />
                    <th>Time (IST)</th>
                    <th>Action</th>
                    <th>Decision</th>
                    <th>Tool</th>
                    <th>Key</th>
                    <th style={{ textAlign: 'right' }}>Duration</th>
                    <th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {displayItems.map((evt, i) => (
                    <AuditRow
                      key={evt.id}
                      evt={evt}
                      onOpen={() => setSelected(evt)}
                      expanded={expanded.has(evt.id)}
                      onToggle={() => toggleExpanded(evt.id)}
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
            <div style={{ marginTop: 14 }}>
              <AuditJson evt={selected} />
            </div>
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
