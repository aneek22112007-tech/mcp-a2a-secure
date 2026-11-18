import { useMemo, useState } from 'react';
import { Cpu, Clock, Repeat, Activity } from 'lucide-react';
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

  return (
    <div className="console-page">
      <header className="page-header">
        <div>
          <h1 className="page-title">LLM Calls</h1>
          <p className="page-sub">
            Recorded model invocations, latency, status, and provider health.
          </p>
        </div>
      </header>

      {/* Provider & model health card from GET /api/llm/health */}
      <section aria-label="LLM provider health">
        {healthQuery.isLoading && !health ? (
          <div className="panel" style={{ padding: '12px 16px', fontSize: 12, color: 'var(--c-text-muted)' }}>
            Checking LLM provider health…
          </div>
        ) : healthQuery.isError && !health ? (
          <ErrorPanel
            message="Failed to load LLM provider health"
            onRetry={() => void healthQuery.refetch()}
          />
        ) : health ? (
          <div
            className="panel"
            style={{
              padding: '12px 16px',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
              gap: 12,
            }}
          >
            {[
              {
                label: 'LLM',
                value: health.enabled ? 'Enabled' : 'Disabled',
                badge: health.enabled ? 'badge-allow' : 'badge-muted',
              },
              {
                label: 'Ollama',
                value: health.ollama_reachable ? 'Reachable' : 'Unreachable',
                badge: health.ollama_reachable ? 'badge-allow' : 'badge-deny',
              },
              {
                label: 'Ollama model',
                value: health.ollama_model || '—',
                mono: true,
              },
              {
                label: 'Model present',
                value: health.ollama_model_present ? 'Yes' : 'No',
                badge: health.ollama_model_present ? 'badge-allow' : 'badge-review',
              },
              {
                label: 'Groq fallback',
                value: health.groq_configured ? 'Configured' : 'Not configured',
                badge: health.groq_configured ? 'badge-info' : 'badge-muted',
              },
            ].map(({ label, value, mono, badge }) => (
              <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span className="section-label">{label}</span>
                {badge ? (
                  <span className={`badge ${badge}`} style={{ alignSelf: 'flex-start' }}>
                    {value}
                  </span>
                ) : (
                  <span className={mono ? 'mono' : ''} style={{ fontSize: 12 }}>
                    {value}
                  </span>
                )}
              </div>
            ))}
          </div>
        ) : null}
      </section>

      {/* Real summary metrics from GET /api/llm-calls */}
      {callsQuery.data && (
        <div
          className="kpi-row"
          style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}
        >
          <div className="kpi-card" style={{ ['--kpi-tone' as string]: 'var(--c-amber)', gap: 8 }}>
            <div className="kpi-head">
              <span className="kpi-icon" aria-hidden><Activity size={13} /></span>
              <span className="stat-card-label">Total calls</span>
            </div>
            <div className="kpi-value" style={{ fontSize: 24 }}>
              {fmtNumber(callsQuery.data.call_count)}
            </div>
            <div className="kpi-foot-note">Recorded in database</div>
          </div>

          <div className="kpi-card" style={{ ['--kpi-tone' as string]: 'var(--c-info)', gap: 8 }}>
            <div className="kpi-head">
              <span className="kpi-icon" aria-hidden><Clock size={13} /></span>
              <span className="stat-card-label">Average duration</span>
            </div>
            <div className="kpi-value" style={{ fontSize: 24 }}>
              {callsQuery.data.call_count > 0
                ? fmtDuration(callsQuery.data.avg_latency_ms)
                : '—'}
            </div>
            <div className="kpi-foot-note">Across all recorded calls</div>
          </div>

          <div className="kpi-card" style={{ ['--kpi-tone' as string]: 'var(--c-review)', gap: 8 }}>
            <div className="kpi-head">
              <span className="kpi-icon" aria-hidden><Repeat size={13} /></span>
              <span className="stat-card-label">Fallback rate</span>
            </div>
            <div className="kpi-value" style={{ fontSize: 24 }}>
              {callsQuery.data.call_count > 0
                ? fmtPercent(callsQuery.data.fallback_rate)
                : '—'}
            </div>
            <div className="kpi-foot-note">
              {fmtNumber(callsQuery.data.metrics?.fallback_count ?? 0)} fallback calls
            </div>
          </div>
        </div>
      )}

      {/* Purpose filter */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <label
          htmlFor="llm-purpose-filter"
          className="section-label"
          style={{ margin: 0 }}
        >
          Purpose
        </label>
        <select
          id="llm-purpose-filter"
          className="input mono"
          value={filterPurpose}
          onChange={e => setFilterPurpose(e.target.value)}
          style={{ width: 220, fontSize: 12 }}
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
        {callsQuery.data && (
          <span style={{ fontSize: 11, color: 'var(--c-text-muted)', marginLeft: 'auto' }}>
            Showing {fmtNumber(filteredCalls.length)} of {fmtNumber(allCalls.length)} loaded
            {total > allCalls.length ? ` (${fmtNumber(total)} total)` : ''}
          </span>
        )}
      </div>

      {/* Calls table */}
      <div className="panel">
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
