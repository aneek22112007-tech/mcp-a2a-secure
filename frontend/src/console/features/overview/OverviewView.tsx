import NumberFlow from '@number-flow/react';
import { Activity, Shield, AlertTriangle, Clock, Server, Box, FileText } from 'lucide-react';
import { useMetrics, useHealth, useStatus, useAuditStream } from '../../api/hooks';
import { LoadingPanel, ErrorPanel, StreamDot, EmptyState } from '../../components/ui';
import {
  fmtTimestamp, fmtDuration, decisionBadgeClass,
  getPinBadge, PIN_BADGE_CLASS, PIN_BADGE_LABEL,
  sandboxStatusBadgeClass, auditRowClass,
} from '../../utils/helpers';
import type { MetricsResponse, AuditEvent } from '../../api/client';
import { DEMO_METRICS, DEMO_AUDIT_EVENTS, DEMO_PINS } from '../../demo/demoData';

interface OverviewProps {
  isDemo: boolean;
}

export function OverviewView({ isDemo }: OverviewProps) {
  const { data: liveMetrics, isLoading, isError, refetch } = useMetrics(!isDemo);
  const { data: health } = useHealth(!isDemo);
  const { data: status } = useStatus(!isDemo);
  const { events: liveEvents, state: streamState } = useAuditStream(20);

  const metrics: MetricsResponse | undefined = isDemo ? DEMO_METRICS : liveMetrics;
  const events: AuditEvent[] = isDemo ? DEMO_AUDIT_EVENTS : liveEvents;
  const demoPins = DEMO_PINS;

  if (!isDemo && isLoading && !metrics) return <LoadingPanel label="Loading metrics…" />;
  if (!isDemo && isError && !metrics) {
    return <ErrorPanel message="Failed to load metrics" onRetry={() => void refetch()} />;
  }

  const totals = metrics?.totals ?? { total: 0, successful: 0, denied: 0, error: 0, rate_limit_rejections: 0 };
  const sandbox = metrics?.sandbox;

  // Pin summary from demo or empty
  const pinSummary = isDemo
    ? { trusted: 1, review: 1, drift: 0, revoked: 1 }
    : { trusted: 0, review: 0, drift: 0, revoked: 0 };

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── Title row ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--c-text)', margin: 0 }}>
            Overview
          </h1>
          <p style={{ fontSize: 11, color: 'var(--c-text-muted)', margin: '2px 0 0' }}>
            {health ? `${health.app} — backend ok` : 'Backend status unknown'}
            {status?.uptime_seconds != null &&
              ` · uptime ${fmtDuration(status.uptime_seconds * 1000)}`}
          </p>
        </div>
        <StreamDot state={isDemo ? 'offline' : streamState} />
      </div>

      {/* ── Big counters ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: 1,
          background: 'var(--c-border)',
          border: '1px solid var(--c-border)',
          borderRadius: 'var(--radius)',
          overflow: 'hidden',
        }}
      >
        {[
          { label: 'Total Requests', value: totals.total, icon: Activity, color: 'var(--c-text)' },
          { label: 'Successful', value: totals.successful, icon: Shield, color: 'var(--c-allow)' },
          { label: 'Denied', value: totals.denied, icon: AlertTriangle, color: 'var(--c-deny)' },
          { label: 'Rate Limited', value: totals.rate_limit_rejections, icon: Clock, color: 'var(--c-review)' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div
            key={label}
            className="stat-card"
            style={{ background: 'var(--c-surface)' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <span className="stat-card-label">{label}</span>
              <Icon size={13} style={{ color: 'var(--c-text-dim)' }} />
            </div>
            <span className="stat-card-value" style={{ color }}>
              <NumberFlow
                value={value}
                format={{ notation: 'compact' }}
              />
            </span>
          </div>
        ))}
      </div>

      {/* ── Mid row: pins + health + sandbox ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>

        {/* Pin summary */}
        <div className="panel" style={{ padding: 16 }}>
          <div className="section-label" style={{ marginBottom: 12 }}>Tool Pins</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(['trusted', 'review', 'drift', 'revoked'] as const).map(k => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className={`badge ${PIN_BADGE_CLASS[k]}`}>{PIN_BADGE_LABEL[k]}</span>
                <span className="mono" style={{ fontSize: 15, fontWeight: 700, color: 'var(--c-text)' }}>
                  {pinSummary[k]}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Health card */}
        <div className="panel" style={{ padding: 16 }}>
          <div className="section-label" style={{ marginBottom: 12 }}>Backend Health</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, color: 'var(--c-text-muted)' }}>
                <Server size={11} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                MCP
              </span>
              <span className={`badge ${status?.mcp === 'online' ? 'badge-allow' : 'badge-deny'}`}>
                {status?.mcp ?? (isDemo ? 'offline' : '—')}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, color: 'var(--c-text-muted)' }}>Database</span>
              <span className={`badge ${metrics?.database?.available ? 'badge-allow' : 'badge-deny'}`}>
                {metrics?.database?.available ? 'ok' : 'error'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, color: 'var(--c-text-muted)' }}>Latency</span>
              <span className="mono" style={{ fontSize: 12 }}>
                {status?.latency_ms != null ? `${status.latency_ms} ms` : '—'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, color: 'var(--c-text-muted)' }}>Rate buckets</span>
              <span className="mono" style={{ fontSize: 12 }}>
                {metrics?.in_process_limiter?.active_buckets ?? 0}
              </span>
            </div>
          </div>
        </div>

        {/* Sandbox summary */}
        <div className="panel" style={{ padding: 16 }}>
          <div className="section-label" style={{ marginBottom: 12 }}>
            <Box size={10} style={{ verticalAlign: 'middle', marginRight: 4 }} />
            Sandbox Runs
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {sandbox && Object.entries(sandbox.by_status)
              .filter(([, v]) => v > 0)
              .sort(([, a], [, b]) => b - a)
              .map(([status, count]) => (
                <div key={status} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className={`badge ${sandboxStatusBadgeClass(status)}`}>{status}</span>
                  <span className="mono" style={{ fontSize: 13, fontWeight: 700 }}>{count}</span>
                </div>
              ))
            }
            {!sandbox && <span style={{ fontSize: 12, color: 'var(--c-text-dim)' }}>No data</span>}
          </div>
        </div>
      </div>

      {/* ── Live event ticker ── */}
      <div className="panel">
        <div
          style={{
            padding: '10px 14px',
            borderBottom: '1px solid var(--c-border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span className="section-label">
            <FileText size={10} style={{ verticalAlign: 'middle', marginRight: 4 }} />
            Live Events
          </span>
          <StreamDot state={isDemo ? 'offline' : streamState} />
        </div>

        <div style={{ maxHeight: 280, overflowY: 'auto' }}>
          {events.length === 0 ? (
            <EmptyState label="Waiting for events…" />
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Action</th>
                  <th>Decision</th>
                  <th>Tool</th>
                  <th>Key</th>
                  <th>Duration</th>
                </tr>
              </thead>
              <tbody>
                {events.slice(0, 15).map((evt, idx) => (
                  <tr key={evt.id} className={idx === 0 ? 'row-enter' : ''}>
                    <td className="mono" style={{ color: 'var(--c-text-muted)', whiteSpace: 'nowrap', fontSize: 11 }}>
                      {fmtTimestamp(evt.created_at)}
                    </td>
                    <td className={`mono ${auditRowClass(evt)}`} style={{ fontSize: 11 }}>
                      {evt.action}
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
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── Slowest tools ── */}
      {metrics?.slowest_tools && metrics.slowest_tools.length > 0 && (
        <div className="panel">
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--c-border)' }}>
            <span className="section-label">Slowest Tools</span>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Tool</th>
                <th>Requests</th>
                <th>Avg Duration</th>
                <th>Max Duration</th>
              </tr>
            </thead>
            <tbody>
              {metrics.slowest_tools.map(t => (
                <tr key={t.tool_name}>
                  <td className="mono" style={{ fontSize: 12 }}>{t.tool_name}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{t.request_count}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{fmtDuration(t.avg_duration_ms)}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{fmtDuration(t.max_duration_ms)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Demo data used for pin summary */}
      {!isDemo && (
        <div style={{ display: 'none' }} aria-hidden>
          {demoPins.map(p => <span key={p.tool_name}>{getPinBadge(p)}</span>)}
        </div>
      )}
    </div>
  );
}
