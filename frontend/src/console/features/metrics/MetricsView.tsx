import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts';
import { BarChart2 } from 'lucide-react';
import { useMetrics } from '../../api/hooks';
import {
  LoadingPanel, ErrorPanel, ConsoleErrorBoundary,
} from '../../components/ui';
import { fmtDuration } from '../../utils/helpers';
import { DEMO_METRICS } from '../../demo/demoData';
import type { MetricsResponse } from '../../api/client';

interface MetricsViewProps { isDemo: boolean }

// Recharts themed to design tokens — no default look
const CHART_COLORS = {
  allow:  '#3DD6B0',
  deny:   '#F0524A',
  review: '#F2A33A',
  info:   '#7F9BB3',
  muted:  '#31343A',
};

const TOOLTIP_STYLE = {
  background: '#131416',
  border: '1px solid #26282B',
  borderRadius: 4,
  color: '#E9E6DF',
  fontSize: 11,
  fontFamily: 'var(--font-mono, monospace)',
};

function SectionTitle({ label }: { label: string }) {
  return (
    <div
      className="section-label"
      style={{ marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid var(--c-border)' }}
    >
      {label}
    </div>
  );
}

function MetricsViewInner({ isDemo }: MetricsViewProps) {
  const { data: live, isLoading, isError, refetch } = useMetrics(!isDemo);
  const metrics: MetricsResponse | undefined = isDemo ? DEMO_METRICS : live;

  if (!isDemo && isLoading && !metrics) return <LoadingPanel label="Loading metrics…" />;
  if (!isDemo && isError && !metrics) {
    return <ErrorPanel message="Failed to load metrics" onRetry={() => void refetch()} />;
  }

  const totals = metrics?.totals;
  const sandbox = metrics?.sandbox;

  // ── allowed vs denied bar data ──
  const statusData = totals
    ? [
        { name: 'Successful', value: totals.successful, color: CHART_COLORS.allow },
        { name: 'Denied',     value: totals.denied,     color: CHART_COLORS.deny },
        { name: 'Error',      value: totals.error,       color: CHART_COLORS.review },
        { name: 'Rate Ltd',   value: totals.rate_limit_rejections, color: CHART_COLORS.info },
      ]
    : [];

  // ── slowest tools ──
  const slowData = (metrics?.slowest_tools ?? []).map(t => ({
    name: t.tool_name.replace(/_/g, ' '),
    avg: parseFloat(t.avg_duration_ms.toFixed(1)),
    max: parseFloat(t.max_duration_ms.toFixed(1)),
  }));

  // ── busiest keys ──
  const busyData = (metrics?.busiest_keys ?? []).map(k => ({
    name: k.key_prefix + '…',
    value: k.request_count,
  }));

  // ── sandbox by status ──
  const sandboxStatusData = sandbox
    ? Object.entries(sandbox.by_status)
        .filter(([, v]) => v > 0)
        .map(([k, v]) => ({ name: k, value: v }))
    : [];

  return (
    <div className="console-page">

      <div>
        <h1 style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--c-text)', margin: 0 }}>
          Metrics
        </h1>
        <p style={{ fontSize: 11, color: 'var(--c-text-muted)', margin: '2px 0 0' }}>
          Aggregated from audit log and sandbox runs.
        </p>
      </div>

      {/* ── Totals grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 1, background: 'var(--c-border)', border: '1px solid var(--c-border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
        {[
          { label: 'Total',        value: totals?.total ?? 0,                 color: 'var(--c-text)' },
          { label: 'Successful',   value: totals?.successful ?? 0,             color: CHART_COLORS.allow },
          { label: 'Denied',       value: totals?.denied ?? 0,                 color: CHART_COLORS.deny },
          { label: 'Rate Limited', value: totals?.rate_limit_rejections ?? 0,  color: CHART_COLORS.review },
          { label: 'DB Available', value: metrics?.database?.available ? 1 : 0, color: CHART_COLORS.allow, label2: metrics?.database?.available ? 'yes' : 'no' },
          { label: 'Rate Buckets', value: metrics?.in_process_limiter?.active_buckets ?? 0, color: CHART_COLORS.info },
        ].map(({ label, value, color, label2 }) => (
          <div key={label} className="stat-card" style={{ background: 'var(--c-surface)' }}>
            <span className="stat-card-label">{label}</span>
            <span className="stat-card-value" style={{ color, fontSize: 24 }}>
              {label2 ?? value}
            </span>
          </div>
        ))}
      </div>

      {/* ── Request status breakdown ── */}
      <div className="panel" style={{ padding: 20 }}>
        <SectionTitle label="Request Status Breakdown" />
        {statusData.length > 0 ? (
          <ResponsiveContainer width="100%" height={160}>
            <BarChart
              data={statusData}
              margin={{ top: 4, right: 4, left: -20, bottom: 4 }}
              barCategoryGap="30%"
            >
              <XAxis
                dataKey="name"
                tick={{ fill: '#8B8D90', fontSize: 11, fontFamily: 'var(--font-mono)' }}
                axisLine={{ stroke: '#26282B' }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: '#8B8D90', fontSize: 10, fontFamily: 'var(--font-mono)' }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                cursor={{ fill: 'rgba(255,255,255,0.03)' }}
              />
              <Bar dataKey="value" radius={[2, 2, 0, 0]} maxBarSize={48}>
                {statusData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ height: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--c-text-dim)', fontSize: 12 }}>
            No data yet
          </div>
        )}
      </div>

      {/* ── Slowest tools + busiest keys side by side ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>

        {/* Slowest tools */}
        <div className="panel" style={{ padding: 20 }}>
          <SectionTitle label="Slowest Tools (avg ms)" />
          {slowData.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart
                data={slowData}
                layout="vertical"
                margin={{ top: 0, right: 16, left: 0, bottom: 0 }}
              >
                <XAxis
                  type="number"
                  tick={{ fill: '#8B8D90', fontSize: 10, fontFamily: 'var(--font-mono)' }}
                  axisLine={{ stroke: '#26282B' }}
                  tickLine={false}
                />
                <YAxis
                  dataKey="name"
                  type="category"
                  width={70}
                  tick={{ fill: '#8B8D90', fontSize: 10, fontFamily: 'var(--font-mono)' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={(v: any) => [fmtDuration(v as number), '']}
                  cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                />
                <Bar dataKey="avg" fill={CHART_COLORS.allow} radius={[0, 2, 2, 0]} maxBarSize={20} name="Avg" />
                <Bar dataKey="max" fill={CHART_COLORS.review} radius={[0, 2, 2, 0]} maxBarSize={20} name="Max" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--c-text-dim)', fontSize: 12 }}>
              No tool call data
            </div>
          )}
        </div>

        {/* Busiest keys */}
        <div className="panel" style={{ padding: 20 }}>
          <SectionTitle label="Busiest Keys (requests)" />
          {busyData.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart
                data={busyData}
                layout="vertical"
                margin={{ top: 0, right: 16, left: 0, bottom: 0 }}
              >
                <XAxis
                  type="number"
                  tick={{ fill: '#8B8D90', fontSize: 10, fontFamily: 'var(--font-mono)' }}
                  axisLine={{ stroke: '#26282B' }}
                  tickLine={false}
                />
                <YAxis
                  dataKey="name"
                  type="category"
                  width={80}
                  tick={{ fill: '#8B8D90', fontSize: 10, fontFamily: 'var(--font-mono)' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                />
                <Bar dataKey="value" fill={CHART_COLORS.info} radius={[0, 2, 2, 0]} maxBarSize={20} name="Requests" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--c-text-dim)', fontSize: 12 }}>
              No key activity
            </div>
          )}
        </div>
      </div>

      {/* ── Sandbox metrics ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>

        {/* By status */}
        <div className="panel" style={{ padding: 20 }}>
          <SectionTitle label="Sandbox Runs by Status" />
          {sandboxStatusData.length > 0 ? (
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={sandboxStatusData} margin={{ top: 4, right: 4, left: -20, bottom: 4 }} barCategoryGap="30%">
                <XAxis
                  dataKey="name"
                  tick={{ fill: '#8B8D90', fontSize: 10, fontFamily: 'var(--font-mono)' }}
                  axisLine={{ stroke: '#26282B' }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: '#8B8D90', fontSize: 10, fontFamily: 'var(--font-mono)' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                <Bar dataKey="value" fill={CHART_COLORS.allow} radius={[2, 2, 0, 0]} maxBarSize={32} name="Runs" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--c-text-dim)', fontSize: 12 }}>
              No sandbox runs
            </div>
          )}
        </div>

        {/* By error type */}
        <div className="panel" style={{ padding: 20 }}>
          <SectionTitle label="Sandbox Errors by Type" />
          {sandbox && Object.keys(sandbox.by_error_type).length > 0 ? (
            <table className="data-table">
              <thead><tr><th>Error type</th><th>Count</th></tr></thead>
              <tbody>
                {Object.entries(sandbox.by_error_type).map(([k, v]) => (
                  <tr key={k}>
                    <td className="mono" style={{ fontSize: 11 }}>{k}</td>
                    <td className="mono" style={{ fontSize: 12, color: 'var(--c-deny)' }}>{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div style={{ height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--c-text-dim)', fontSize: 12 }}>
              No errors recorded
            </div>
          )}
        </div>
      </div>

      {/* Recharts icon suppress */}
      <div style={{ display: 'none' }} aria-hidden><BarChart2 size={1} /></div>
    </div>
  );
}

export function MetricsView(props: MetricsViewProps) {
  return (
    <ConsoleErrorBoundary>
      <MetricsViewInner {...props} />
    </ConsoleErrorBoundary>
  );
}
