import { useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  ResponsiveContainer, Cell, AreaChart, Area,
} from 'recharts';
import { Activity, Database, Gauge, ShieldAlert, Cpu, BarChart2 } from 'lucide-react';
import { useMetrics, useActivitySeries } from '../../api/hooks';
import { ErrorPanel, EmptyState, ConsoleErrorBoundary } from '../../components/ui';
import { SkeletonPage } from '../../components/premium';
import { fmtDuration, fmtNumber, fmtPercent, fmtTimestamp, trafficCommands } from '../../utils/helpers';
import { getApiBase, type MetricsResponse } from '../../api/client';

interface MetricsViewProps { offline: boolean }

// Recharts themed to design tokens
const CHART_COLORS = {
  allow:  '#3DD6B0',
  deny:   '#F0524A',
  review: '#F2A33A',
  high:   '#E87B3B',
  info:   '#7F9BB3',
  muted:  '#31343A',
};

const AXIS_TICK = { fill: '#8B8D90', fontSize: 10, fontFamily: 'var(--font-mono)' };

interface TipPayload { name?: string; value?: number | string; color?: string; dataKey?: string | number; payload?: Record<string, unknown> }

function ChartTooltip({
  active, payload, label, unit, labelFmt,
}: {
  active?: boolean;
  payload?: TipPayload[];
  label?: string | number;
  unit?: 'ms' | 'count';
  labelFmt?: (l: string | number | undefined) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-title">{labelFmt ? labelFmt(label) : label}</div>
      {payload.map(p => (
        <div key={String(p.dataKey ?? p.name)} className="chart-tooltip-row">
          <span className="legend-swatch" style={{ background: p.color ?? (p.payload?.color as string) }} />
          <span>{p.name}</span>
          <b>{unit === 'ms' ? fmtDuration(Number(p.value)) : fmtNumber(Number(p.value))}</b>
        </div>
      ))}
    </div>
  );
}

function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="legend" aria-label="Legend">
      {items.map(i => (
        <span key={i.label} className="legend-item">
          <span className="legend-swatch" style={{ background: i.color }} aria-hidden />
          {i.label}
        </span>
      ))}
    </div>
  );
}

function PanelTitle({ label, right }: { label: string; right?: React.ReactNode }) {
  return (
    <div className="row-between" style={{ marginBottom: 14, paddingBottom: 10, borderBottom: '1px solid var(--c-border)' }}>
      <h2 className="section-label" style={{ margin: 0 }}>{label}</h2>
      {right}
    </div>
  );
}

function Stat({ label, value, tone, icon, sub }: { label: string; value: React.ReactNode; tone: string; icon: React.ReactNode; sub?: string }) {
  return (
    <div className="kpi-card" style={{ ['--kpi-tone' as string]: tone, gap: 8 }}>
      <div className="kpi-head">
        <span className="kpi-icon" aria-hidden>{icon}</span>
        <span className="stat-card-label">{label}</span>
      </div>
      <div className="kpi-value" style={{ fontSize: 24 }}>{value}</div>
      {sub && <div className="kpi-foot-note">{sub}</div>}
    </div>
  );
}

const RANGES = [
  { id: 10, label: '10m' },
  { id: 30, label: '30m' },
] as const;

function MetricsViewInner({ offline: _offline }: MetricsViewProps) {
  const { data: live, isLoading, isError, refetch } = useMetrics();
  const { data: series } = useActivitySeries();
  const [range, setRange] = useState<10 | 30>(30);
  const metrics: MetricsResponse | undefined = live;

  if (isLoading && !metrics) return <SkeletonPage label="Loading metrics…" cards={6} />;
  if (isError && !metrics) {
    return <ErrorPanel message="Failed to load metrics" onRetry={() => void refetch()} />;
  }

  const totals = metrics?.totals;
  const sandbox = metrics?.sandbox;
  const guard = metrics?.injection_guard;
  const llm = metrics?.llm;

  const statusData = totals
    ? [
        { name: 'Successful',   value: totals.successful, color: CHART_COLORS.allow },
        { name: 'Denied',       value: totals.denied,     color: CHART_COLORS.deny },
        { name: 'Error',        value: totals.error,      color: CHART_COLORS.high },
        { name: 'Rate limited', value: totals.rate_limit_rejections, color: CHART_COLORS.review },
      ]
    : [];

  const slowData = (metrics?.slowest_tools ?? []).map(t => ({
    name: t.tool_name,
    avg: Number(t.avg_duration_ms.toFixed(1)),
    max: Number(t.max_duration_ms.toFixed(1)),
    count: t.request_count,
  }));

  const busyData = (metrics?.busiest_keys ?? []).map(k => ({
    name: k.key_prefix + '…',
    value: k.request_count,
  }));

  const sandboxStatusData = sandbox
    ? Object.entries(sandbox.by_status)
        .filter(([, v]) => v > 0)
        .map(([k, v]) => ({ name: k, value: v }))
    : [];

  const timeline = (series?.buckets ?? []).slice(-range).map(b => ({
    t: b.t,
    Allowed: b.allowed,
    Denied: b.denied,
  }));
  const timelineHasData = timeline.some(p => p.Allowed + p.Denied > 0);
  const successRate = totals && totals.total ? totals.successful / totals.total : null;

  return (
    <div className="console-page">
      <header className="page-header">
        <div>
          <h1 className="page-title">Metrics</h1>
          <p className="page-sub">Aggregated from the audit log, sandbox runs and the injection guard.</p>
        </div>
      </header>

      <div className="kpi-row" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
        <Stat label="Total" value={fmtNumber(totals?.total)} tone="var(--c-amber)" icon={<Activity size={13} />} sub={successRate != null ? `${fmtPercent(successRate)} successful` : undefined} />
        <Stat label="Denied" value={fmtNumber(totals?.denied)} tone="var(--c-deny)" icon={<ShieldAlert size={13} />} sub="auth, scope and policy" />
        <Stat label="Errors" value={fmtNumber(totals?.error)} tone="var(--c-high)" icon={<BarChart2 size={13} />} sub="tool or upstream failures" />
        <Stat label="Rate limited" value={fmtNumber(totals?.rate_limit_rejections)} tone="var(--c-review)" icon={<Gauge size={13} />} sub={`${fmtNumber(metrics?.in_process_limiter?.active_buckets ?? 0)} active buckets`} />
        <Stat label="Guard hits" value={fmtNumber(guard?.hits ?? 0)} tone="var(--c-high)" icon={<ShieldAlert size={13} />} sub={guard ? `${guard.blocked} blocked · ${guard.sanitized} sanitized` : 'not reported'} />
        <Stat
          label="Database"
          value={<span style={{ color: metrics?.database?.available ? 'var(--c-allow)' : 'var(--c-deny)' }}>{metrics?.database?.available ? 'Online' : 'Offline'}</span>}
          tone={metrics?.database?.available ? 'var(--c-allow)' : 'var(--c-deny)'}
          icon={<Database size={13} />}
          sub={metrics?.database?.error ?? 'audit store reachable'}
        />
      </div>

        <div className="panel" style={{ padding: 20 }}>
          <PanelTitle
            label="Gateway activity per minute"
            right={(
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <Legend items={[{ label: 'Allowed', color: CHART_COLORS.allow }, { label: 'Denied', color: CHART_COLORS.deny }]} />
                <div className="seg" role="group" aria-label="Time range">
                  {RANGES.map(r => (
                    <button key={r.id} aria-pressed={range === r.id} onClick={() => setRange(r.id)}>{r.label}</button>
                  ))}
                </div>
              </div>
            )}
          />
          {timelineHasData ? (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={timeline} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="gAllow" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor={CHART_COLORS.allow} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={CHART_COLORS.allow} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gDeny" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor={CHART_COLORS.deny} stopOpacity={0.4} />
                    <stop offset="100%" stopColor={CHART_COLORS.deny} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#1E2023" vertical={false} />
                <XAxis
                  dataKey="t"
                  tickFormatter={(t: number) => fmtTimestamp(new Date(t).toISOString()).slice(0, 5)}
                  tick={AXIS_TICK} axisLine={{ stroke: '#26282B' }} tickLine={false} minTickGap={40}
                />
                <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip
                  content={<ChartTooltip unit="count" labelFmt={l => `${fmtTimestamp(new Date(Number(l)).toISOString())} IST`} />}
                  cursor={{ stroke: '#3A3D42' }}
                />
                <Area type="monotone" dataKey="Allowed" stroke={CHART_COLORS.allow} fill="url(#gAllow)" strokeWidth={1.5} isAnimationActive={false} />
                <Area type="monotone" dataKey="Denied" stroke={CHART_COLORS.deny} fill="url(#gDeny)" strokeWidth={1.5} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState label={`No gateway calls in the last ${range} minutes.`} hint="Console polls are left out. Calls from agents and keys show up within 15 seconds:" command={trafficCommands(getApiBase()).restCall} icon={Activity} />
          )}
        </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div className="panel" style={{ padding: 20 }}>
          <PanelTitle label="Request status breakdown" right={<Legend items={statusData.map(s => ({ label: s.name, color: s.color }))} />} />
          {statusData.some(s => s.value > 0) ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={statusData} margin={{ top: 4, right: 4, left: -16, bottom: 4 }} barCategoryGap="30%">
                <CartesianGrid stroke="#1E2023" vertical={false} />
                <XAxis dataKey="name" tick={AXIS_TICK} axisLine={{ stroke: '#26282B' }} tickLine={false} />
                <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip content={<ChartTooltip unit="count" />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                <Bar dataKey="value" name="Requests" radius={[3, 3, 0, 0]} maxBarSize={48}>
                  {statusData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState label="No requests recorded yet." icon={BarChart2} />
          )}
        </div>

        <div className="panel" style={{ padding: 20 }}>
          <PanelTitle label="Injection guard and LLM" />
          <dl className="kv-grid">
            <div><dt>Guard hits</dt><dd>{fmtNumber(guard?.hits ?? 0)}</dd></div>
            <div><dt>Blocked</dt><dd className="tone-deny">{fmtNumber(guard?.blocked ?? 0)}</dd></div>
            <div><dt>Sanitized</dt><dd className="tone-review">{fmtNumber(guard?.sanitized ?? 0)}</dd></div>
            <div><dt>LLM</dt><dd className={llm?.available ? 'tone-allow' : 'dim'}>{llm ? (llm.available ? 'Available' : 'Unavailable') : '—'}</dd></div>
            <div><dt>LLM calls</dt><dd>{fmtNumber(llm?.call_count ?? 0)}</dd></div>
            <div><dt>Avg latency</dt><dd>{llm && llm.call_count ? fmtDuration(llm.avg_latency_ms) : '—'}</dd></div>
            <div><dt>Fallbacks</dt><dd>{llm ? `${fmtNumber(llm.fallback_count)} (${fmtPercent(llm.fallback_rate)})` : '—'}</dd></div>
            <div><dt>Sandbox runs</dt><dd>{fmtNumber(sandbox?.runs_total ?? 0)}</dd></div>
          </dl>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div className="panel" style={{ padding: 20 }}>
          <PanelTitle
            label="Slowest tools"
            right={<Legend items={[{ label: 'Average', color: CHART_COLORS.allow }, { label: 'Max', color: CHART_COLORS.review }]} />}
          />
          {slowData.length > 0 ? (
            <ResponsiveContainer width="100%" height={Math.max(160, slowData.length * 44)}>
              <BarChart data={slowData} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }} barGap={2}>
                <CartesianGrid stroke="#1E2023" horizontal={false} />
                <XAxis type="number" tick={AXIS_TICK} axisLine={{ stroke: '#26282B' }} tickLine={false} unit=" ms" />
                <YAxis dataKey="name" type="category" width={120} tick={AXIS_TICK} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip unit="ms" />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                <Bar dataKey="avg" name="Average" fill={CHART_COLORS.allow} radius={[0, 3, 3, 0]} maxBarSize={14} />
                <Bar dataKey="max" name="Max" fill={CHART_COLORS.review} radius={[0, 3, 3, 0]} maxBarSize={14} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState label="No tool calls yet" hint="Run the notes agent or call a tool over MCP:" command={trafficCommands(getApiBase()).agent} icon={Cpu} />
          )}
        </div>

        <div className="panel" style={{ padding: 20 }}>
          <PanelTitle label="Busiest keys" right={<Legend items={[{ label: 'Requests', color: CHART_COLORS.info }]} />} />
          {busyData.length > 0 ? (
            <ResponsiveContainer width="100%" height={Math.max(160, busyData.length * 36)}>
              <BarChart data={busyData} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="#1E2023" horizontal={false} />
                <XAxis type="number" tick={AXIS_TICK} axisLine={{ stroke: '#26282B' }} tickLine={false} allowDecimals={false} />
                <YAxis dataKey="name" type="category" width={90} tick={AXIS_TICK} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip unit="count" />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                <Bar dataKey="value" fill={CHART_COLORS.info} radius={[0, 3, 3, 0]} maxBarSize={16} name="Requests" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState label="No key activity yet." icon={Activity} />
          )}
        </div>
      </div>

        <div className="panel" style={{ padding: 20 }}>
          <PanelTitle label="Tool latency, last 30 minutes" right={<span className="muted-sm">from audit duration_ms</span>} />
          {series && series.latency.samples > 0 ? (
            <table className="data-table">
              <thead>
                <tr><th>Tool</th><th className="num">Calls</th><th className="num">p50</th><th className="num">p95</th></tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>All tools</strong></td>
                  <td className="num">{fmtNumber(series.latency.samples)}</td>
                  <td className="num">{fmtDuration(series.latency.p50)}</td>
                  <td className="num">{fmtDuration(series.latency.p95)}</td>
                </tr>
                {Object.entries(series.latency.byTool).sort((a, b) => (b[1].p95 ?? 0) - (a[1].p95 ?? 0)).map(([tool, l]) => (
                  <tr key={tool}>
                    <td className="mono">{tool}</td>
                    <td className="num">{fmtNumber(l.samples)}</td>
                    <td className="num">{fmtDuration(l.p50)}</td>
                    <td className="num">{fmtDuration(l.p95)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyState label="No tool calls in the last 30 minutes" hint="Percentiles need at least one tool call:" command={trafficCommands(getApiBase()).agent} icon={Gauge} />
          )}
        </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div className="panel" style={{ padding: 20 }}>
          <PanelTitle label="Sandbox runs by status" />
          {sandboxStatusData.length > 0 ? (
            <ResponsiveContainer width="100%" height={170}>
              <BarChart data={sandboxStatusData} margin={{ top: 4, right: 4, left: -16, bottom: 4 }} barCategoryGap="30%">
                <CartesianGrid stroke="#1E2023" vertical={false} />
                <XAxis dataKey="name" tick={AXIS_TICK} axisLine={{ stroke: '#26282B' }} tickLine={false} />
                <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip content={<ChartTooltip unit="count" />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                <Bar dataKey="value" radius={[3, 3, 0, 0]} maxBarSize={36} name="Runs">
                  {sandboxStatusData.map((d, i) => (
                    <Cell key={i} fill={d.name === 'success' || d.name === 'ok' ? CHART_COLORS.allow : d.name === 'timeout' ? CHART_COLORS.review : CHART_COLORS.deny} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState label="No sandbox runs yet." icon={Cpu} />
          )}
        </div>

        <div className="panel" style={{ padding: 20 }}>
          <PanelTitle label="Sandbox errors by type" />
          {sandbox && Object.keys(sandbox.by_error_type).length > 0 ? (
            <table className="data-table">
              <thead><tr><th>Error type</th><th style={{ textAlign: 'right' }}>Count</th></tr></thead>
              <tbody>
                {Object.entries(sandbox.by_error_type).map(([k, v]) => (
                  <tr key={k}>
                    <td className="mono" style={{ fontSize: 11 }}>{k}</td>
                    <td className="mono" style={{ fontSize: 12, color: 'var(--c-deny)', textAlign: 'right' }}>{fmtNumber(v)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyState label="No sandbox errors recorded." icon={ShieldAlert} />
          )}
        </div>
      </div>
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
