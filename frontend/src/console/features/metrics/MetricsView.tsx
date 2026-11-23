import { useState } from 'react';
import {
  XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, AreaChart, Area,
} from 'recharts';
import { Activity, Gauge, ShieldAlert, Cpu, BarChart2 } from 'lucide-react';
import { BarList, Card, StatusRow } from '../../components/blocks';
import { useMetrics, useActivitySeries } from '../../api/hooks';
import { ErrorPanel, EmptyState, ConsoleErrorBoundary } from '../../components/ui';
import { SkeletonPage } from '../../components/premium';
import { fmtDuration, fmtNumber, fmtPercent, fmtTimestamp, trafficCommands } from '../../utils/helpers';
import { getApiBase, type MetricsResponse } from '../../api/client';

interface MetricsViewProps { offline: boolean }

// Recharts themed to design tokens
const CHART_COLORS = {
  allow:  '#14B8A6',
  deny:   '#F43F5E',
  review: '#FBBF24',
  high:   '#FB923C',
  info:   '#60A5FA',
  muted:  '#D4D1C8',
};

const AXIS_TICK = { fill: '#8A8A93', fontSize: 11 };

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

function Stat({ label, value, sub, dot }: { label: string; value: React.ReactNode; sub?: string; dot?: string }) {
  return (
    <div className="summary-cell">
      <span className="summary-label">{dot && <span className="summary-dot" style={{ background: dot }} aria-hidden />}{label}</span>
      <span className="summary-value">{value}</span>
      {sub && <span className="summary-sub">{sub}</span>}
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

  // Minutes older than the loaded audit rows are unknown, so they are drawn as a gap.
  const coveredFrom = series?.coveredFrom ?? null;
  const timeline = (series?.buckets ?? []).slice(-range).map(b => {
    const known = coveredFrom == null || b.t + 60_000 > coveredFrom;
    return { t: b.t, Allowed: known ? b.allowed : null, Denied: known ? b.denied : null };
  });
  const timelineHasData = timeline.some(p => (p.Allowed ?? 0) + (p.Denied ?? 0) > 0);
  const successRate = totals && totals.total ? totals.successful / totals.total : null;

  const statusTotal = statusData.reduce((n, d) => n + d.value, 0);
  const llmLabel = llm ? (llm.enabled ? `${llm.primary_provider || 'ollama'} · ${llm.primary_model}` : 'Disabled') : '—';

  return (
    <div className="console-page">
      <header className="home-head">
        <div>
          <h1 className="page-title">Metrics</h1>
          <p className="page-sub">Aggregated from the audit log, sandbox runs and the injection guard</p>
        </div>
      </header>

      <div className="summary-strip summary-strip-6">
        <Stat label="Total requests" value={fmtNumber(totals?.total)} sub={successRate != null ? `${fmtPercent(successRate)} successful` : undefined} />
        <Stat label="Denied" dot={CHART_COLORS.deny} value={fmtNumber(totals?.denied)} sub="Auth, scope and policy" />
        <Stat label="Errors" dot={CHART_COLORS.high} value={fmtNumber(totals?.error)} sub="Tool or upstream failures" />
        <Stat label="Rate limited" dot={CHART_COLORS.review} value={fmtNumber(totals?.rate_limit_rejections)} sub="Since API start" />
        <Stat label="Guard hits" value={fmtNumber(guard?.hits ?? 0)} sub={guard ? `${guard.blocked} blocked · ${guard.sanitized} sanitized` : 'Not reported'} />
        <Stat
          label="Database"
          dot={metrics?.database?.available ? CHART_COLORS.allow : CHART_COLORS.deny}
          value={metrics?.database?.available ? 'Online' : 'Offline'}
          sub={metrics?.database?.error ?? 'Audit store reachable'}
        />
      </div>

      <div className="grid-2-1">
        <Card
          title="Gateway activity"
          description={coveredFrom != null
            ? `Per minute (IST), newest ${series?.sampled ?? 0} audit events from ${fmtTimestamp(new Date(coveredFrom).toISOString()).slice(0, 5)}`
            : 'Allowed and denied decisions per minute (IST)'}
          action={(
            <div className="seg seg-text" role="group" aria-label="Time range">
              {RANGES.map(r => (
                <button key={r.id} aria-pressed={range === r.id} onClick={() => setRange(r.id)}>{r.label}</button>
              ))}
            </div>
          )}
        >
          <Legend items={[{ label: 'Allowed', color: CHART_COLORS.allow }, { label: 'Denied', color: CHART_COLORS.deny }]} />
          {timelineHasData ? (
            <div style={{ height: 240, marginTop: 12 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={timeline} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gAllow" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor={CHART_COLORS.allow} stopOpacity={0.3} />
                      <stop offset="100%" stopColor={CHART_COLORS.allow} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gDeny" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor={CHART_COLORS.deny} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={CHART_COLORS.deny} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#EEECE6" vertical={false} />
                  <XAxis
                    dataKey="t"
                    tickFormatter={(t: number) => fmtTimestamp(new Date(t).toISOString()).slice(0, 5)}
                    tick={AXIS_TICK} axisLine={false} tickLine={false} minTickGap={40}
                  />
                  <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip
                    content={<ChartTooltip unit="count" labelFmt={l => `${fmtTimestamp(new Date(Number(l)).toISOString())} IST`} />}
                    cursor={{ stroke: '#DCD9D1' }}
                  />
                  <Area type="monotone" dataKey="Allowed" stroke={CHART_COLORS.allow} fill="url(#gAllow)" strokeWidth={1.75} isAnimationActive={false} />
                  <Area type="monotone" dataKey="Denied" stroke={CHART_COLORS.deny} fill="url(#gDeny)" strokeWidth={1.75} isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState label={`No gateway calls in the last ${range} minutes.`} hint="Console polls are left out. Calls from agents and keys show up within 15 seconds:" command={trafficCommands(getApiBase()).restCall} icon={Activity} />
          )}
        </Card>

        <Card title="Request outcomes" description="Every request since the API started">
          {statusTotal > 0 ? (
            <>
              <div className="stackbar" role="img" aria-label="Share of request outcomes">
                {statusData.filter(d => d.value > 0).map(d => (
                  <span key={d.name} style={{ flexGrow: d.value, background: d.color }} title={`${d.name}: ${fmtNumber(d.value)}`} />
                ))}
              </div>
              <ul className="outcome-list">
                {statusData.map(d => (
                  <li key={d.name}>
                    <span className="outcome-name"><span className="legend-swatch" style={{ background: d.color }} aria-hidden />{d.name}</span>
                    <span className="outcome-pct">{fmtPercent(d.value / statusTotal)}</span>
                    <span className="outcome-value">{fmtNumber(d.value)}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <EmptyState label="No requests recorded yet." icon={BarChart2} />
          )}
        </Card>
      </div>

      <div className="grid-3">
        <Card title="Busiest keys" description="Requests per API key prefix">
          <BarList
            items={busyData.map(k => ({ key: k.name, value: k.value, name: <span className="mono">{k.name}</span> }))}
            color="var(--c-info-bar)"
            format={n => fmtNumber(n)}
            empty="No key activity yet"
          />
        </Card>

        <Card title="Slowest tools" description="Average duration, worst case on hover">
          {slowData.length > 0 ? (
            <BarList
              items={slowData.map(t => ({ key: t.name, value: t.avg, name: <span className="mono">{t.name}</span>, hint: `${t.count} calls · max ${fmtDuration(t.max)}` }))}
              color="var(--c-allow-bar)"
              format={n => fmtDuration(n)}
            />
          ) : (
            <EmptyState label="No tool calls yet" hint="Run the notes agent or call a tool over MCP:" command={trafficCommands(getApiBase()).agent} icon={Cpu} />
          )}
        </Card>

        <Card title="Injection guard and LLM" description="Counters from /api/metrics" bodyClassName="status-list">
          <StatusRow label="Guard hits" value={fmtNumber(guard?.hits ?? 0)} />
          <StatusRow label="Blocked" value={fmtNumber(guard?.blocked ?? 0)} tone={(guard?.blocked ?? 0) > 0 ? 'bad' : 'neutral'} />
          <StatusRow label="Sanitized" value={fmtNumber(guard?.sanitized ?? 0)} tone={(guard?.sanitized ?? 0) > 0 ? 'warn' : 'neutral'} />
          <StatusRow label="LLM" value={llmLabel} tone={llm ? (llm.enabled ? 'ok' : 'neutral') : 'neutral'} />
          <StatusRow label="Groq fallback" value={llm ? (llm.fallback_configured ? 'Configured' : 'Not configured') : '—'} tone={llm?.fallback_configured ? 'ok' : 'neutral'} />
          <StatusRow label="LLM calls" value={`${fmtNumber(llm?.call_count ?? 0)} · avg ${llm && llm.call_count ? fmtDuration(llm.avg_latency_ms) : '—'}`} />
          <StatusRow label="Fallbacks" value={llm ? `${fmtNumber(llm.fallback_count)} (${fmtPercent(llm.fallback_rate)})` : '—'} />
          <StatusRow label="Sandbox runs" value={fmtNumber(sandbox?.runs_total ?? 0)} />
        </Card>
      </div>

      <Card title="Tool latency" description="Last 30 minutes, from audit duration_ms" bodyClassName="card-body-flush">
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
      </Card>

      <div className="grid-1-1">
        <Card title="Sandbox runs by status" description="All recorded sandbox executions">
          {sandboxStatusData.length > 0 ? (
            <BarList
              items={sandboxStatusData.sort((a, b) => b.value - a.value).map(d => ({ key: d.name, value: d.value, name: d.name }))}
              color={'var(--c-info-bar)'}
              format={n => fmtNumber(n)}
            />
          ) : (
            <EmptyState label="No sandbox runs yet." icon={Cpu} />
          )}
        </Card>

        <Card title="Sandbox errors by type" description="Failure classes reported by the sandbox" bodyClassName={sandbox && Object.keys(sandbox.by_error_type).length > 0 ? 'card-body-flush' : ''}>
          {sandbox && Object.keys(sandbox.by_error_type).length > 0 ? (
            <table className="data-table">
              <thead><tr><th>Error type</th><th className="num">Count</th></tr></thead>
              <tbody>
                {Object.entries(sandbox.by_error_type).map(([k, v]) => (
                  <tr key={k}>
                    <td className="mono">{k}</td>
                    <td className="mono num">{fmtNumber(v)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyState label="No sandbox errors recorded." icon={ShieldAlert} />
          )}
        </Card>
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
