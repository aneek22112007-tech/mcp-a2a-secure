import { useEffect, useState } from 'react';
import NumberFlow from '@number-flow/react';
import {
  Activity, Gauge, Shield, ShieldAlert, ShieldX, AlertTriangle, Server, Box, FileText, Play,
  BarChart2, Plug, Database, Timer, Layers, ArrowRight, KeyRound, Pin, Wrench,
} from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useMetrics, useHealth, useStatus, useAuditStream, useAudit, usePins, useActivitySeries } from '../../api/hooks';
import { SkeletonPage } from '../../components/premium';
import { BarList, Card, PipelineStepper, StatCard, StatusRow, type BarListItem } from '../../components/blocks';
import { ErrorPanel, StreamDot, EmptyState } from '../../components/ui';
import { lightsMatched, pipelineLights, type StageLight } from '../../components/pipelineLogic';
import { ATTACK_SEQUENCE, waitForCaption, type AttackResult } from '../attack/runners';
import {
  fmtTimestamp, fmtDuration, fmtUptime, elapsedSince,
  getPinBadge, PIN_BADGE_LABEL, isConsolePoll, CONSOLE_TZ,
  fmtPercent, plural, trafficCommands,
} from '../../utils/helpers';
import { getApiBase, type MetricsResponse, type AuditEvent, type ToolPin } from '../../api/client';
import { useReducedMotion } from '../../../hooks/useReducedMotion';

interface OverviewProps {
  offline: boolean;
}

function useGaveUp(active: boolean): boolean {
  const [gaveUp, setGaveUp] = useState(false);
  useEffect(() => {
    if (!active) return;
    const timer = window.setTimeout(() => setGaveUp(true), 5000);
    return () => {
      window.clearTimeout(timer);
      setGaveUp(false);
    };
  }, [active]);
  return active && gaveUp;
}

function Count({ value, color }: { value: number; color: string }) {
  const reduced = useReducedMotion();
  if (reduced) {
    return <span className="stat-card-value" style={{ color }}>{value}</span>;
  }
  return (
    <span className="stat-card-value" style={{ color }}>
      <NumberFlow value={value} format={{ useGrouping: true }} />
    </span>
  );
}

function mergeEvents(stream: AuditEvent[], page: AuditEvent[]): AuditEvent[] {
  const seen = new Set<string>();
  const merged: AuditEvent[] = [];
  for (const evt of [...stream, ...page]) {
    if (seen.has(evt.id) || isConsolePoll(evt)) continue;
    seen.add(evt.id);
    merged.push(evt);
    if (merged.length >= 18) break;
  }
  return merged;
}

function pinCounts(pins: ToolPin[]) {
  const counts = { trusted: 0, review: 0, drift: 0, revoked: 0 };
  for (const pin of pins) {
    const badge = getPinBadge(pin);
    if (badge === 'trusted' || badge === 'review' || badge === 'drift' || badge === 'revoked') {
      counts[badge] += 1;
    }
  }
  return counts;
}

export function OverviewView({ offline }: OverviewProps) {
  const { data: liveMetrics, isLoading, isError, refetch } = useMetrics();
  const { data: health } = useHealth();
  const { data: status } = useStatus();
  const { data: livePins } = usePins();
  const { data: auditPage } = useAudit({ limit: 50 });
  const { events: liveEvents, state: streamState } = useAuditStream(20);
  const { data: series } = useActivitySeries();
  const [demoResults, setDemoResults] = useState<Record<string, AttackResult>>({});
  const [demoRunning, setDemoRunning] = useState<string | null>(null);
  const [demoError, setDemoError] = useState('');
  const [lights, setLights] = useState<StageLight[]>(() => pipelineLights('', 0));
  const gaveUp = useGaveUp(isLoading && !liveMetrics);

  const metrics: MetricsResponse | undefined = liveMetrics;
  const probe = status;
  const events: AuditEvent[] = mergeEvents(liveEvents, auditPage?.items ?? []);
  const pins = livePins?.items ?? [];
  const summary = pinCounts(pins);

  if (isLoading && !metrics && !gaveUp) return <SkeletonPage label="Loading metrics…" cards={5} />;
  if ((isError || gaveUp) && !metrics) {
    return (
      <ErrorPanel
        message={gaveUp && !isError ? 'Metrics timed out after 5 seconds.' : 'Failed to load metrics'}
        onRetry={() => void refetch()}
      />
    );
  }

  const totals = metrics?.totals ?? { total: 0, successful: 0, denied: 0, error: 0, rate_limit_rejections: 0 };
  const sandbox = metrics?.sandbox;
  const mcpUnconfigured = status?.mcp === 'offline' && status.error === 'mcp_unavailable';

  const rememberLights = (result: AttackResult) => {
    const next = pipelineLights(result.stage, result.status);
    if (lightsMatched(next)) setLights(next);
  };

  const runSequence = async () => {
    if (offline || demoRunning) return;
    setDemoError('');
    setDemoResults({});
    for (let index = 0; index < ATTACK_SEQUENCE.length; index += 1) {
      const step = ATTACK_SEQUENCE[index];
      setDemoRunning(step.id);
      try {
        const result = await step.run();
        setDemoResults(current => ({ ...current, [step.id]: result }));
        rememberLights(result);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Request failed';
        const failed: AttackResult = {
          status: 0,
          headers: {},
          body: { error: { message } },
          ok: false,
          stage: 'HTTP error',
          stageColor: 'var(--c-deny)',
          summary: message,
        };
        setDemoResults(current => ({ ...current, [step.id]: failed }));
        rememberLights(failed);
        setDemoError(message);
        break;
      }
      if (index < ATTACK_SEQUENCE.length - 1) await waitForCaption();
    }
    setDemoRunning(null);
  };

  const recentEvents = events.slice(0, 7);
  const ranked = rankFromEvents(events.length ? [...liveEvents, ...(auditPage?.items ?? [])] : []);
  const auditWindow = auditPage?.items.length ?? 0;
  const allowRate = totals.total ? totals.successful / totals.total : null;
  const cur = series?.current;
  const prev = series?.previous;
  const pinTotal = summary.trusted + summary.review + summary.drift + summary.revoked;
  const sandboxEntries = sandbox ? Object.entries(sandbox.by_status).filter(([, c]) => c > 0).sort(([, a], [, b]) => b - a) : [];
  const traffic = (series?.buckets ?? []).map(b => ({ t: b.t, allowed: b.allowed, denied: b.denied }));
  const trafficTotals = traffic.reduce((acc, b) => ({ allowed: acc.allowed + b.allowed, denied: acc.denied + b.denied }), { allowed: 0, denied: 0 });
  const healthTone = (ok: boolean | undefined) => (ok == null ? 'neutral' : ok ? 'ok' : 'bad');

  return (
    <div className="console-page page-home">
      <header className="home-head">
        <div>
          <h1 className="page-title">Overview</h1>
          <p className="page-sub">
            Gateway traffic, policy decisions and tool health
            {health ? ` for ${health.app}` : ''}
            {probe?.uptime_seconds != null && ` · up ${fmtUptime(probe.uptime_seconds)}`}
          </p>
        </div>
        <div className="home-actions">
          <a className="btn btn-ghost" href="#/metrics"><BarChart2 size={14} aria-hidden /> Metrics</a>
          <a className="btn btn-primary" href="#/audit"><FileText size={14} aria-hidden /> Open Live Audit</a>
        </div>
      </header>

      <div className="stat-grid">
        <StatCard
          label="Requests"
          icon={<Activity size={14} />}
          value={<Count value={totals.total} color="var(--c-text)" />}
          narrative={cur ? `${plural(cur.total, 'request')} in the last 15 min` : 'All time, from /api/metrics'}
          series={series?.buckets.map(b => b.total)}
          current={cur?.total} previous={prev?.total}
          color="var(--c-chart-info)"
        />
        <StatCard
          label="Allow rate"
          icon={<Shield size={14} />}
          value={<span>{allowRate == null ? '—' : fmtPercent(allowRate)}</span>}
          narrative={`${totals.successful.toLocaleString()} allowed of ${totals.total.toLocaleString()} all time`}
          series={series?.buckets.map(b => b.allowed)}
          current={cur?.allowed} previous={prev?.allowed}
          color="var(--c-chart-allow)"
        />
        <StatCard
          label="Denied"
          icon={<ShieldX size={14} />}
          value={<Count value={totals.denied} color="var(--c-text)" />}
          narrative={`Auth, scope and policy · ${plural(totals.rate_limit_rejections, 'rate-limit rejection')}`}
          series={series?.buckets.map(b => b.denied)}
          current={cur?.denied} previous={prev?.denied}
          goodWhenUp={false}
          color="var(--c-chart-deny)"
        />
        <StatCard
          label="Tool latency p95"
          icon={<Gauge size={14} />}
          value={<span>{series?.latency.p95 != null ? fmtDuration(series.latency.p95) : '—'}</span>}
          narrative={series?.latency.samples
            ? `p50 ${fmtDuration(series.latency.p50)} over ${plural(series.latency.samples, 'tool call')}, 30 min`
            : 'No tool calls in the last 30 min'}
        />
      </div>

      <div className="grid-2-1">
        <Card
          title="Gateway traffic"
          description="Allowed and denied decisions per minute, last 30 minutes (IST)"
          label="Gateway traffic"
          action={(
            <div className="legend">
              <span className="legend-item"><span className="legend-swatch" style={{ background: 'var(--c-chart-allow)' }} />Allowed <b>{trafficTotals.allowed}</b></span>
              <span className="legend-item"><span className="legend-swatch" style={{ background: 'var(--c-chart-deny)' }} />Denied <b>{trafficTotals.denied}</b></span>
            </div>
          )}
        >
          <TrafficChart data={traffic} />
        </Card>

        <Card
          title="Gateway health"
          description="Live probes from /api/status and /api/metrics"
          label="Gateway health"
          action={<StreamDot state={streamState} />}
          bodyClassName="status-list"
        >
          <StatusRow label="API" icon={<Server size={14} />} value={health?.status === 'ok' ? 'Operational' : health ? health.status : 'Checking'} tone={health ? healthTone(health.status === 'ok') : 'neutral'} />
          <StatusRow
            label="MCP endpoint"
            icon={<Plug size={14} />}
            value={mcpUnconfigured ? 'Not configured' : probe?.mcp ?? '—'}
            tone={mcpUnconfigured ? 'warn' : probe ? healthTone(probe.mcp === 'online') : 'neutral'}
          />
          <StatusRow label="Database" icon={<Database size={14} />} value={metrics?.database?.available ? 'Connected' : 'Error'} tone={healthTone(metrics?.database?.available)} />
          <StatusRow label="Probe latency" icon={<Timer size={14} />} value={<span className="mono">{probe?.latency_ms != null ? `${probe.latency_ms} ms` : '—'}</span>} />
          <StatusRow label="Rate-limit buckets" icon={<Layers size={14} />} value={<span className="mono">{metrics?.in_process_limiter?.active_buckets ?? 0}</span>} />
          <div className="status-split">
            <div>
              <span className="status-split-label">Rate limited</span>
              <span className="status-split-value">{totals.rate_limit_rejections.toLocaleString()}</span>
            </div>
            <div>
              <span className="status-split-label">Guard blocks</span>
              <span className="status-split-value">{(metrics?.injection_guard?.blocked ?? 0).toLocaleString()}</span>
            </div>
            <div>
              <span className="status-split-label">Guard hits</span>
              <span className="status-split-value">{(metrics?.injection_guard?.hits ?? 0).toLocaleString()}</span>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid-3">
        <Card
          title="Recent activity"
          description="Newest gateway decisions"
          label="Recent activity"
          action={<a className="card-link" href="#/audit">View all <ArrowRight size={12} aria-hidden /></a>}
          bodyClassName="feed-body"
        >
          {recentEvents.length === 0 ? (
            <EmptyState
              label="No gateway events yet"
              hint="Events appear as soon as a client calls the gateway. Try a call with any key:"
              command={trafficCommands(getApiBase()).restCall}
            />
          ) : (
            <ul className="feed">
              {recentEvents.map(evt => {
                const kind = eventKind(evt);
                const Icon = kind.icon;
                return (
                  <li key={evt.id} className="feed-item">
                    <span className={`feed-icon tone-${kind.tone}`} aria-hidden><Icon size={14} /></span>
                    <div className="feed-text">
                      <span className="feed-title">{kind.title}</span>
                      <span className="feed-meta">
                        <span className="mono">{evt.tool_name ?? evt.action}</span>
                        {evt.key_prefix && <> · <span className="mono">{evt.key_prefix}</span></>}
                        {evt.status_code != null && <> · {evt.status_code}</>}
                      </span>
                    </div>
                    <time className="feed-time" dateTime={evt.created_at} title={`${fmtTimestamp(evt.created_at)} IST`}>{elapsedSince(evt.created_at)}</time>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card
          title="Top denial reasons"
          description={auditWindow ? `Across the latest ${plural(auditWindow, 'audit event')}` : 'From the latest audit events'}
          label="Top denial reasons"
          action={<a className="card-link" href="#/audit">Investigate <ArrowRight size={12} aria-hidden /></a>}
        >
          <BarList
            items={ranked.reasons}
            color="var(--c-deny-bar)"
            empty="No denied requests in the latest events"
          />
        </Card>

        <Card
          title="Tools"
          description={auditWindow ? `Calls by tool in the latest ${plural(auditWindow, 'event')}, pins, sandbox` : 'Calls by tool, pin status and sandbox runs'}
          label="Tools"
          action={<a className="card-link" href="#/pins">Pins <ArrowRight size={12} aria-hidden /></a>}
        >
          <BarList items={ranked.tools} color="var(--c-allow-bar)" empty="No tool calls in the latest events" />
          <div className="mini-stats">
            {(['trusted', 'review', 'drift', 'revoked'] as const).map(key => (
              <div key={key} className="mini-stat">
                <span className={`mini-dot pin-${key}`} aria-hidden />
                <span className="mini-label">{PIN_BADGE_LABEL[key]}</span>
                <span className="mini-value">{summary[key]}</span>
              </div>
            ))}
          </div>
          <div className="mini-foot">
            <span><Pin size={12} aria-hidden /> {plural(pinTotal, 'pinned tool')}</span>
            <span>
              <Box size={12} aria-hidden />{' '}
              {sandboxEntries.length
                ? sandboxEntries.map(([name, c]) => `${c} ${name}`).join(' · ')
                : 'No sandbox runs yet'}
            </span>
          </div>
        </Card>
      </div>

      <Card
        title="Request pipeline"
        description="Every call passes these checks in order. Run the demo to light up where each request stops."
        label="Request pipeline"
        className="pipeline-card"
        action={(
          <button className="btn btn-primary btn-sm" onClick={() => void runSequence()} disabled={offline || !!demoRunning}>
            <Play size={12} aria-hidden />
            {demoRunning ? 'Running…' : 'Run demo sequence'}
          </button>
        )}
      >
        <PipelineStepper lights={lights} />
        <ol className="demo-list">
          {ATTACK_SEQUENCE.map((step, i) => {
            const result = demoResults[step.id];
            const active = demoRunning === step.id;
            const state = active ? 'running' : result ? (result.ok ? 'ok' : 'stopped') : 'idle';
            return (
              <li key={step.id} className={`demo-item demo-${state}`} aria-current={active ? 'step' : undefined}>
                <span className="demo-num" aria-hidden>{i + 1}</span>
                <div className="demo-text">
                  <p className="demo-caption">{step.caption}</p>
                  {result && (
                    <p className="demo-result">
                      <span className="badge result-stage" style={{ color: result.stageColor, borderColor: result.stageColor }}>{result.stage}</span>
                      <span className="mono">HTTP {result.status}</span>
                      {result.pinReason && <span className="mono">{result.pinReason}</span>}
                      <span className="demo-summary">{result.summary}</span>
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
        {offline && <p className="page-sub">The sequence sends real requests only while the backend is up.</p>}
        {demoError && <p className="tone-deny">{demoError}</p>}
      </Card>

      {metrics?.slowest_tools && metrics.slowest_tools.length > 0 && (
        <Card title="Slowest tools" description="Average and worst duration per tool, from /api/metrics" label="Slowest tools" bodyClassName="card-body-flush">
          <table className="data-table">
            <thead>
              <tr>
                <th>Tool</th>
                <th className="num">Requests</th>
                <th className="num">Avg duration</th>
                <th className="num">Max duration</th>
              </tr>
            </thead>
            <tbody>
              {metrics.slowest_tools.map(tool => (
                <tr key={tool.tool_name}>
                  <td className="mono">{tool.tool_name}</td>
                  <td className="mono num">{tool.request_count}</td>
                  <td className="mono num">{fmtDuration(tool.avg_duration_ms)}</td>
                  <td className="mono num">{fmtDuration(tool.max_duration_ms)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

const timeFmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: CONSOLE_TZ });

function TrafficChart({ data }: { data: { t: number; allowed: number; denied: number }[] }) {
  if (!data.some(d => d.allowed || d.denied)) {
    return <div className="chart-empty">No gateway traffic in the last 30 minutes</div>;
  }
  return (
    <div className="chart-hero">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="trafficAllow" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2DD4BF" stopOpacity={0.32} />
              <stop offset="100%" stopColor="#2DD4BF" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="trafficDeny" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#F43F5E" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#F43F5E" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="#1E1E23" />
          <XAxis dataKey="t" tickFormatter={(t: number) => timeFmt.format(new Date(t))} tick={{ fill: '#71717A', fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={40} />
          <YAxis allowDecimals={false} tick={{ fill: '#71717A', fontSize: 11 }} axisLine={false} tickLine={false} width={36} />
          <Tooltip
            cursor={{ stroke: '#3F3F46' }}
            contentStyle={{ background: '#18181B', border: '1px solid #27272A', borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: '#A1A1AA' }}
            labelFormatter={(t) => `${timeFmt.format(new Date(Number(t)))} IST`}
          />
          <Area type="monotone" dataKey="allowed" name="Allowed" stackId="1" stroke="#2DD4BF" strokeWidth={1.75} fill="url(#trafficAllow)" isAnimationActive={false} />
          <Area type="monotone" dataKey="denied" name="Denied" stackId="1" stroke="#F43F5E" strokeWidth={1.75} fill="url(#trafficDeny)" isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

type Tone = 'allow' | 'deny' | 'warn' | 'info' | 'muted';

function eventKind(evt: AuditEvent): { icon: typeof Activity; tone: Tone; title: string } {
  const a = evt.action;
  if (evt.status_code === 429 || a.startsWith('rate_limit')) return { icon: Timer, tone: 'warn', title: 'Rate limit hit' };
  if (a.startsWith('tool.output.injection') || a.startsWith('guard')) return { icon: ShieldAlert, tone: 'warn', title: 'Injection guard triggered' };
  if (a.startsWith('auth')) return { icon: KeyRound, tone: evt.decision === 'denied' ? 'deny' : 'info', title: evt.decision === 'denied' ? 'Authentication rejected' : 'Key authenticated' };
  if (a.startsWith('tool.pin') || a.includes('pin')) return { icon: Pin, tone: evt.decision === 'denied' ? 'deny' : 'info', title: evt.decision === 'denied' ? 'Blocked by pin gate' : 'Pin updated' };
  const failed = evt.decision === 'error' || (evt.status_code != null && evt.status_code >= 500);
  if (a.startsWith('tool.call') || a === 'mcp.tools_call') {
    if (evt.decision === 'denied') return { icon: ShieldX, tone: 'deny', title: 'Tool call denied' };
    if (failed) return { icon: AlertTriangle, tone: 'warn', title: 'Tool call failed' };
    return { icon: Wrench, tone: 'allow', title: a === 'mcp.tools_call' ? 'MCP tool call' : 'Tool call allowed' };
  }
  if (evt.decision === 'denied') return { icon: ShieldX, tone: 'deny', title: 'Request denied' };
  if (failed) return { icon: AlertTriangle, tone: 'warn', title: 'Request failed' };
  const words = a.replace(/[._]+/g, ' ').trim();
  return { icon: Activity, tone: 'muted', title: words.charAt(0).toUpperCase() + words.slice(1) };
}

function rankFromEvents(list: AuditEvent[]): { reasons: BarListItem[]; tools: BarListItem[] } {
  const seen = new Set<string>();
  const reasons: Record<string, number> = {};
  const mcpTools: Record<string, number> = {};
  const restTools: Record<string, number> = {};
  for (const evt of list) {
    if (seen.has(evt.id) || isConsolePoll(evt)) continue;
    seen.add(evt.id);
    if (evt.decision === 'denied') {
      const key = evt.error_code || evt.reason || evt.action;
      reasons[key] = (reasons[key] ?? 0) + 1;
    }
    // MCP tools/call rows are the client-facing calls; fall back to tool.call rows when there are none.
    if (evt.tool_name && evt.action === 'mcp.tools_call') mcpTools[evt.tool_name] = (mcpTools[evt.tool_name] ?? 0) + 1;
    if (evt.tool_name && evt.action.startsWith('tool.call')) restTools[evt.tool_name] = (restTools[evt.tool_name] ?? 0) + 1;
  }
  const top = (rec: Record<string, number>) => Object.entries(rec)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([name, value]) => ({ key: name, value, name: <span className="mono">{name}</span>, hint: name }));
  return { reasons: top(reasons), tools: top(Object.keys(mcpTools).length ? mcpTools : restTools) };
}
