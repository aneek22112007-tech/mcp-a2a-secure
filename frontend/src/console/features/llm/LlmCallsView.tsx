import { useMemo, useState } from 'react';
import { Cpu, Clock, Repeat, Activity } from 'lucide-react';
import { BarList, Card, StatCard, StatusRow, type BarListItem } from '../../components/blocks';
import { useLlmCalls, useLlmHealth } from '../../api/hooks';
import type { LlmCallRecord } from '../../api/client';
import {
  LoadingPanel, ErrorPanel, EmptyState,
  Pager, Drawer, DetailRow, ConsoleErrorBoundary, CopyButton,
} from '../../components/ui';
import {
  fmtDatetime, fmtDuration, fmtNumber, fmtPercent, elapsedSince,
} from '../../utils/helpers';

interface LlmCallsViewProps {
  offline: boolean;
}

function llmStatusBadgeClass(status: string): string {
  switch (status.toLowerCase()) {
    case 'ok':
    case 'success':
    case 'succeeded':
      return 'badge-allow';
    case 'fallback':
      return 'badge-review';
    case 'error':
    case 'failed':
    case 'timeout':
    case 'denied':
      return 'badge-deny';
    default:
      return 'badge-muted';
  }
}

function countBy(calls: LlmCallRecord[], keyOf: (c: LlmCallRecord) => string): BarListItem[] {
  const counts: Record<string, number> = {};
  for (const c of calls) {
    const k = keyOf(c);
    counts[k] = (counts[k] ?? 0) + 1;
  }
  return Object.entries(counts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 6)
    .map(([k, v]) => ({ key: k, value: v, name: <span className="mono">{k}</span> }));
}

function LlmCallsViewInner({ offline: _offline }: LlmCallsViewProps) {
  const [offset, setOffset] = useState(0);
  const limit = 200;
  const [filterPurpose, setFilterPurpose] = useState('');
  const [selected, setSelected] = useState<LlmCallRecord | null>(null);

  const callsQuery = useLlmCalls({ limit, offset });
  const healthQuery = useLlmHealth();

  const allCalls: LlmCallRecord[] = useMemo(
    () => callsQuery.data?.items ?? [],
    [callsQuery.data],
  );

  const availablePurposes = useMemo(() => {
    const set = new Set<string>();
    for (const c of allCalls) {
      if (c.purpose) set.add(c.purpose);
    }
    if (filterPurpose) set.add(filterPurpose);
    return Array.from(set).sort();
  }, [allCalls, filterPurpose]);

  const filteredCalls = useMemo(() => {
    if (!filterPurpose) return allCalls;
    return allCalls.filter(c => c.purpose === filterPurpose);
  }, [allCalls, filterPurpose]);

  const health = healthQuery.data;
  const total = callsQuery.data?.total ?? 0;
  const nextOffset = offset + limit < total ? offset + limit : null;

  const byPurpose = countBy(filteredCalls, c => c.purpose || 'unknown');
  const byStatus = countBy(filteredCalls, c => c.status || 'unknown');
  const byModel = countBy(filteredCalls, c => `${c.provider || '—'} · ${c.model || '—'}`);
  const summary = callsQuery.data;

  return (
    <div className="console-page">
      <header className="home-head">
        <div>
          <h1 className="page-title">LLM Calls</h1>
          <p className="page-sub">Recorded model invocations, latency, status and provider health</p>
        </div>
      </header>

      <div className="grid-3-1">
        <div className="stat-grid stat-grid-3">
          <StatCard
            label="Total calls"
            icon={<Activity size={14} />}
            value={summary ? fmtNumber(summary.call_count) : '—'}
            narrative="Recorded in the database"
          />
          <StatCard
            label="Average duration"
            icon={<Clock size={14} />}
            value={summary && summary.call_count > 0 ? fmtDuration(summary.avg_latency_ms) : '—'}
            narrative="Across all recorded calls"
          />
          <StatCard
            label="Fallback rate"
            icon={<Repeat size={14} />}
            value={summary && summary.call_count > 0 ? fmtPercent(summary.fallback_rate) : '—'}
            narrative={`${fmtNumber(summary?.metrics?.fallback_count ?? 0)} fallback calls`}
          />
        </div>

        {/* Provider and model health from GET /api/llm/health */}
        <Card title="Providers" description="From /api/llm/health" label="LLM provider health" bodyClassName="status-list">
          {healthQuery.isLoading && !health ? (
            <span className="page-sub">Checking LLM provider health…</span>
          ) : healthQuery.isError && !health ? (
            <ErrorPanel message="Failed to load LLM provider health" onRetry={() => void healthQuery.refetch()} />
          ) : health ? (
            <>
              <StatusRow label="LLM" value={health.enabled ? 'Enabled' : 'Disabled'} tone={health.enabled ? 'ok' : 'neutral'} />
              <StatusRow label="Ollama" value={health.ollama_reachable ? 'Reachable' : 'Unreachable'} tone={health.ollama_reachable ? 'ok' : 'bad'} />
              <StatusRow label="Model" value={<span className="mono">{health.ollama_model || '—'}</span>} tone={health.ollama_model_present ? 'ok' : 'warn'} />
              <StatusRow label="Groq fallback" value={health.groq_configured ? 'Configured' : 'Not configured'} tone={health.groq_configured ? 'ok' : 'neutral'} />
            </>
          ) : null}
        </Card>
      </div>

      {filteredCalls.length > 0 && (
        <div className="grid-3">
          <Card title="By purpose" description={`Loaded calls${filterPurpose ? ', filtered' : ''}`}>
            <BarList items={byPurpose} color="var(--c-info-bar)" />
          </Card>
          <Card title="By status" description="Outcome of each call">
            <BarList items={byStatus} color="var(--c-allow-bar)" />
          </Card>
          <Card title="By provider and model" description="Where each call was served">
            <BarList items={byModel} color="var(--c-info-bar)" />
          </Card>
        </div>
      )}

      <div className="card table-card">
      <div className="table-toolbar">
        <div className="table-toolbar-left">
          <label htmlFor="llm-purpose-filter" className="toolbar-label">Purpose</label>
          <select
            id="llm-purpose-filter"
            className="input mono"
            value={filterPurpose}
            onChange={e => setFilterPurpose(e.target.value)}
            style={{ width: 220 }}
            aria-label="Filter LLM calls by purpose"
          >
            <option value="">All purposes</option>
            {availablePurposes.map(purpose => (
              <option key={purpose} value={purpose}>
                {purpose}
              </option>
            ))}
          </select>
          {filterPurpose && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setFilterPurpose('')}
            >
              Clear filter
            </button>
          )}
        </div>
        {callsQuery.data && (
          <span className="toolbar-count">
            Showing {fmtNumber(filteredCalls.length)} of {fmtNumber(allCalls.length)} loaded
            {total > allCalls.length ? ` (${fmtNumber(total)} total)` : ''}
          </span>
        )}
      </div>

      {/* Calls table */}
      <div className="table-card-body">
        {callsQuery.isLoading && !callsQuery.data ? (
          <LoadingPanel label="Loading LLM calls…" />
        ) : callsQuery.isError && !callsQuery.data ? (
          <ErrorPanel
            message="Failed to load LLM calls"
            onRetry={() => void callsQuery.refetch()}
          />
        ) : filteredCalls.length === 0 ? (
          <EmptyState
            label={
              filterPurpose
                ? `No LLM calls with purpose "${filterPurpose}"`
                : 'No LLM calls recorded yet'
            }
            icon={Cpu}
            hint={
              filterPurpose
                ? 'Select another purpose or clear the filter to view all recorded calls.'
                : 'Run the notes agent, the AI scanner, or an AI analyst explanation to record model calls here.'
            }
          />
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Purpose</th>
                    <th>Provider</th>
                    <th>Model</th>
                    <th>Status</th>
                    <th>Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCalls.map(call => {
                    const ts = call.created_at ?? call.timestamp;
                    const durationMs = call.latency_ms ?? call.latency;
                    const isFallback = call.fell_back || call.is_fallback;
                    return (
                      <tr
                        key={call.id}
                        onClick={() => setSelected(call)}
                        style={{ cursor: 'pointer' }}
                        tabIndex={0}
                        onKeyDown={e => {
                          if (e.target === e.currentTarget && e.key === 'Enter') {
                            e.preventDefault();
                            setSelected(call);
                          }
                        }}
                        aria-label={`LLM call ${call.purpose || 'unknown purpose'} via ${call.provider} ${call.model}, ${call.status}`}
                      >
                        <td
                          className="mono"
                          style={{ fontSize: 11, color: 'var(--c-text-muted)', whiteSpace: 'nowrap' }}
                          title={fmtDatetime(ts)}
                        >
                          <span>{fmtDatetime(ts)}</span>
                          <span className="rel-time">{elapsedSince(ts)}</span>
                        </td>
                        <td className="mono" style={{ fontSize: 12 }}>
                          {call.purpose || '—'}
                        </td>
                        <td className="mono" style={{ fontSize: 12 }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <span>{call.provider || '—'}</span>
                            {isFallback && (
                              <span className="badge badge-review">fallback</span>
                            )}
                          </span>
                        </td>
                        <td className="mono" style={{ fontSize: 12, color: 'var(--c-text-muted)' }}>
                          {call.model || '—'}
                        </td>
                        <td>
                          <span className={`badge ${llmStatusBadgeClass(call.status)}`}>
                            {call.status}
                          </span>
                        </td>
                        <td className="mono" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                          {fmtDuration(durationMs)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {(offset > 0 || nextOffset !== null) && (
              <Pager
                offset={offset}
                limit={limit}
                nextOffset={nextOffset}
                onPrev={() => setOffset(o => Math.max(0, o - limit))}
                onNext={() => nextOffset !== null && setOffset(nextOffset)}
              />
            )}
          </>
        )}
      </div>
      </div>

      {/* Call detail drawer */}
      <Drawer
        open={!!selected}
        title="LLM Call Detail"
        onClose={() => setSelected(null)}
      >
        {selected && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <DetailRow label="Call ID">
              <span className="mono" style={{ fontSize: 11 }}>{selected.id}</span>
            </DetailRow>
            <DetailRow label="Time">
              {fmtDatetime(selected.created_at ?? selected.timestamp)}
            </DetailRow>
            <DetailRow label="Purpose">
              <span className="mono">{selected.purpose || '—'}</span>
            </DetailRow>
            <DetailRow label="Provider">
              <span className="mono">{selected.provider || '—'}</span>
            </DetailRow>
            <DetailRow label="Model">
              <span className="mono">{selected.model || '—'}</span>
            </DetailRow>
            <DetailRow label="Status">
              <span className={`badge ${llmStatusBadgeClass(selected.status)}`}>
                {selected.status}
              </span>
            </DetailRow>
            <DetailRow label="Fallback">
              <span className="mono">
                {selected.fell_back || selected.is_fallback ? 'yes' : 'no'}
              </span>
            </DetailRow>
            <DetailRow label="Duration">
              <span className="mono">
                {fmtDuration(selected.latency_ms ?? selected.latency)}
              </span>
            </DetailRow>
            <DetailRow label="Input tokens">
              <span className="mono">
                {selected.input_tokens != null ? fmtNumber(selected.input_tokens) : '—'}
              </span>
            </DetailRow>
            <DetailRow label="Output tokens">
              <span className="mono">
                {selected.output_tokens != null ? fmtNumber(selected.output_tokens) : '—'}
              </span>
            </DetailRow>
            <DetailRow label="Key prefix">
              <span className="mono">{selected.key_prefix ?? '—'}</span>
            </DetailRow>
            <DetailRow label="Request ID">
              {selected.request_id ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span className="mono" style={{ fontSize: 11 }}>{selected.request_id}</span>
                  <CopyButton value={selected.request_id} label="Copy" />
                </span>
              ) : '—'}
            </DetailRow>
            {selected.error && (
              <DetailRow label="Error">
                <span className="mono" style={{ color: 'var(--c-deny)', fontSize: 11 }}>
                  {selected.error}
                </span>
              </DetailRow>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}

export function LlmCallsView(props: LlmCallsViewProps) {
  return (
    <ConsoleErrorBoundary>
      <LlmCallsViewInner {...props} />
    </ConsoleErrorBoundary>
  );
}
