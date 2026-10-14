import { useState } from 'react';
import { Box, Link } from 'lucide-react';
import { useSandboxRuns, useSandboxHealth } from '../../api/hooks';
import {
  LoadingPanel, ErrorPanel, EmptyState,
  Pager, Drawer, DetailRow, ConsoleErrorBoundary,
} from '../../components/ui';
import {
  fmtDatetime, fmtDuration, fmtBytes,
  sandboxStatusBadgeClass,
} from '../../utils/helpers';
import { DEMO_SANDBOX_RUNS } from '../../demo/demoData';
import type { SandboxRun } from '../../api/client';

interface SandboxViewProps { isDemo: boolean }

function SandboxViewInner({ isDemo }: SandboxViewProps) {
  const [offset, setOffset] = useState(0);
  const limit = 50;
  const [filterTool, setFilterTool] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [selected, setSelected] = useState<SandboxRun | null>(null);

  const params = {
    limit,
    offset,
    tool_name: filterTool || undefined,
    status: filterStatus || undefined,
  };

  const { data, isLoading, isError, refetch } = useSandboxRuns(params, !isDemo);
  const { data: liveHealth } = useSandboxHealth(!isDemo);
  const health = isDemo ? undefined : liveHealth;

  const runs: SandboxRun[] = isDemo ? DEMO_SANDBOX_RUNS : (data?.items ?? []);

  const STATUSES = [
    '', 'succeeded', 'failed', 'running', 'timeout',
    'cancelled', 'rejected', 'abandoned', 'unavailable',
  ];

  return (
    <div className="console-page">

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--c-text)', margin: 0 }}>
            Sandbox
          </h1>
          <p style={{ fontSize: 11, color: 'var(--c-text-muted)', margin: '2px 0 0' }}>
            Tool execution runs and isolation health.
          </p>
        </div>
      </div>

      {/* Health card */}
      {(health || isDemo) && (
        <div
          className="panel"
          style={{
            padding: '12px 16px',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: 12,
          }}
        >
          {[
            {
              label: 'Mode',
              value: health?.mode ?? 'inprocess',
              mono: true,
            },
            {
              label: 'Status',
              value: health?.available ?? true ? 'available' : 'unavailable',
              badge: health?.available ?? true ? 'badge-allow' : 'badge-deny',
            },
            {
              label: 'Active runs',
              value: String(health?.active_runs ?? 0),
              mono: true,
            },
            {
              label: 'Max concurrent',
              value: String(health?.max_concurrent ?? 4),
              mono: true,
            },
            {
              label: 'Image',
              value: health?.image ?? 'inprocess',
              mono: true,
            },
            {
              label: 'Image present',
              value: health?.mode === 'inprocess' ? 'N/A (inprocess)' : (health?.image_present ? 'yes' : 'no'),
              badge: health?.mode === 'inprocess'
                ? 'badge-muted'
                : health?.image_present ? 'badge-allow' : 'badge-deny',
            },
          ].map(({ label, value, mono, badge }) => (
            <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span className="section-label">{label}</span>
              {badge
                ? <span className={`badge ${badge}`}>{value}</span>
                : <span className={mono ? 'mono' : ''} style={{ fontSize: 12 }}>{value}</span>}
            </div>
          ))}
        </div>
      )}

      {/* Limits detail */}
      {health?.limits && (
        <div className="panel" style={{ padding: '10px 14px' }}>
          <div className="section-label" style={{ marginBottom: 8 }}>Limits</div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 11 }}>
            {Object.entries(health.limits).map(([k, v]) => (
              <span key={k} style={{ color: 'var(--c-text-muted)' }}>
                <span className="mono" style={{ color: 'var(--c-text-dim)' }}>{k}</span>
                {' = '}
                <span className="mono">{String(v)}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <input
          className="input mono"
          placeholder="Tool name…"
          value={filterTool}
          onChange={e => { setFilterTool(e.target.value); setOffset(0); }}
          style={{ width: 180, fontSize: 12 }}
          aria-label="Filter by tool name"
        />
        <select
          className="input"
          value={filterStatus}
          onChange={e => { setFilterStatus(e.target.value); setOffset(0); }}
          style={{ width: 160, fontSize: 12 }}
          aria-label="Filter by status"
        >
          {STATUSES.map(s => (
            <option key={s} value={s}>{s || '— all status —'}</option>
          ))}
        </select>
      </div>

      {/* Runs table */}
      <div className="panel">
        {!isDemo && isLoading && !data ? (
          <LoadingPanel label="Loading runs…" />
        ) : !isDemo && isError ? (
          <ErrorPanel message="Failed to load sandbox runs" onRetry={() => void refetch()} />
        ) : runs.length === 0 ? (
          <EmptyState label="No sandbox runs yet. Invoke tools through /mcp/ to generate runs." icon={Box} />
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>Tool</th>
                    <th>Mode</th>
                    <th>Duration</th>
                    <th>Exit</th>
                    <th>Output</th>
                    <th>Key</th>
                    <th>Created</th>
                    <th>Audit</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map(run => (
                    <tr
                      key={run.id}
                      onClick={() => setSelected(run)}
                      style={{ cursor: 'pointer' }}
                      tabIndex={0}
                      onKeyDown={e => e.key === 'Enter' && setSelected(run)}
                      aria-label={`Sandbox run ${run.id.slice(0, 8)}, tool: ${run.tool_name ?? 'unknown'}`}
                    >
                      <td>
                        <span className={`badge ${sandboxStatusBadgeClass(run.status)}`}>
                          {run.status}
                        </span>
                      </td>
                      <td className="mono" style={{ fontSize: 12 }}>{run.tool_name ?? '—'}</td>
                      <td className="mono" style={{ fontSize: 11, color: 'var(--c-text-muted)' }}>
                        {run.mode ?? '—'}
                      </td>
                      <td className="mono" style={{ fontSize: 12 }}>{fmtDuration(run.duration_ms)}</td>
                      <td
                        className="mono"
                        style={{
                          fontSize: 12,
                          color: run.exit_code === 0 ? 'var(--c-allow)' : run.exit_code != null ? 'var(--c-deny)' : 'var(--c-text-dim)',
                        }}
                      >
                        {run.exit_code ?? '—'}
                      </td>
                      <td className="mono" style={{ fontSize: 11, color: 'var(--c-text-muted)' }}>
                        {fmtBytes(run.output_bytes)}
                      </td>
                      <td className="mono" style={{ fontSize: 11, color: 'var(--c-text-dim)' }}>
                        {run.key_prefix ?? '—'}
                      </td>
                      <td className="mono" style={{ fontSize: 11, color: 'var(--c-text-muted)', whiteSpace: 'nowrap' }}>
                        {fmtDatetime(run.created_at)}
                      </td>
                      <td>
                        {run.audit_event_id && (
                          <span
                            className="mono"
                            style={{ fontSize: 10, color: 'var(--c-info)', display: 'flex', gap: 4, alignItems: 'center' }}
                            title={`Audit event: ${run.audit_event_id}`}
                          >
                            <Link size={10} />
                            {run.audit_event_id.slice(0, 8)}…
                          </span>
                        )}
                      </td>
                    </tr>
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
        title="Sandbox Run Detail"
        onClose={() => setSelected(null)}
      >
        {selected && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <DetailRow label="ID"><span className="mono" style={{ fontSize: 11 }}>{selected.id}</span></DetailRow>
            <DetailRow label="Status">
              <span className={`badge ${sandboxStatusBadgeClass(selected.status)}`}>{selected.status}</span>
            </DetailRow>
            <DetailRow label="Tool"><span className="mono">{selected.tool_name ?? '—'}</span></DetailRow>
            <DetailRow label="Mode"><span className="mono">{selected.mode ?? '—'}</span></DetailRow>
            <DetailRow label="Transport"><span className="mono">{selected.transport ?? '—'}</span></DetailRow>
            <DetailRow label="Image">{selected.image ?? '—'}</DetailRow>
            <DetailRow label="Duration">{fmtDuration(selected.duration_ms)}</DetailRow>
            <DetailRow label="Exit code">
              <span className="mono" style={{ color: selected.exit_code === 0 ? 'var(--c-allow)' : 'var(--c-deny)' }}>
                {selected.exit_code ?? '—'}
              </span>
            </DetailRow>
            <DetailRow label="Error type">
              <span className="mono" style={{ color: selected.error_type ? 'var(--c-deny)' : 'var(--c-text-dim)' }}>
                {selected.error_type ?? '—'}
              </span>
            </DetailRow>
            <DetailRow label="Output bytes">{fmtBytes(selected.output_bytes)}</DetailRow>
            <DetailRow label="Args hash"><span className="mono" style={{ fontSize: 11 }}>{selected.args_hash ?? '—'}</span></DetailRow>
            <DetailRow label="Client ID"><span className="mono" style={{ fontSize: 11 }}>{selected.client_id ?? '—'}</span></DetailRow>
            <DetailRow label="Key prefix"><span className="mono">{selected.key_prefix ?? '—'}</span></DetailRow>
            <DetailRow label="Request ID"><span className="mono" style={{ fontSize: 11 }}>{selected.request_id ?? '—'}</span></DetailRow>
            <DetailRow label="Audit event"><span className="mono" style={{ fontSize: 11 }}>{selected.audit_event_id ?? '—'}</span></DetailRow>
            <DetailRow label="Created">{fmtDatetime(selected.created_at)}</DetailRow>
            <DetailRow label="Started">{selected.started_at ? fmtDatetime(selected.started_at) : '—'}</DetailRow>
            <DetailRow label="Finished">{selected.finished_at ? fmtDatetime(selected.finished_at) : '—'}</DetailRow>
          </div>
        )}
      </Drawer>
    </div>
  );
}

export function SandboxView(props: SandboxViewProps) {
  return (
    <ConsoleErrorBoundary>
      <SandboxViewInner {...props} />
    </ConsoleErrorBoundary>
  );
}
