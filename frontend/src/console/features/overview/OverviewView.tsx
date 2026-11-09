import { useEffect, useState } from 'react';
import NumberFlow from '@number-flow/react';
import { Activity, Gauge, Shield, ShieldAlert, AlertTriangle, Clock, Server, Box, FileText, Play } from 'lucide-react';
import { useMetrics, useHealth, useStatus, useAuditStream, useAudit, usePins, useActivitySeries } from '../../api/hooks';
import { KpiCard, SkeletonPage } from '../../components/premium';
import { ErrorPanel, StreamDot, EmptyState } from '../../components/ui';
import { PipelineStrip } from '../../components/Pipeline';
import { lightsMatched, pipelineLights, type StageLight } from '../../components/pipelineLogic';
import { DEMO_SEQUENCE, waitForCaption, type AttackResult } from '../attack/runners';
import {
  fmtTimestamp, fmtDuration, fmtUptime, decisionBadgeClass,
  getPinBadge, PIN_BADGE_CLASS, PIN_BADGE_LABEL,
  sandboxStatusBadgeClass, auditRowClass, isConsolePoll,
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
    for (let index = 0; index < DEMO_SEQUENCE.length; index += 1) {
      const step = DEMO_SEQUENCE[index];
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
      if (index < DEMO_SEQUENCE.length - 1) await waitForCaption();
    }
    setDemoRunning(null);
  };

  return (
    <div className="console-page">
      <header className="page-header">
        <div>
          <h1 className="page-title">Overview</h1>
          <p className="page-sub">
            Gateway traffic, policy decisions and tool health.
            {health && ` ${health.app}`}
            {probe?.uptime_seconds != null && ` · up ${fmtUptime(probe.uptime_seconds)}`}
          </p>
        </div>
        <a className="btn btn-primary" href="#/audit">Open Live Audit</a>
      </header>

      <div className="kpi-row">
        {[
          { label: 'Requests', value: totals.total, icon: Activity, tone: 'var(--c-info)', key: 'total' as const, up: true, foot: 'all time' },
          { label: 'Allowed', value: totals.successful, icon: Shield, tone: 'var(--c-allow)', key: 'allowed' as const, up: true, foot: totals.total ? `${fmtPercent(totals.successful / totals.total)} of requests` : undefined },
          { label: 'Denied', value: totals.denied, icon: AlertTriangle, tone: 'var(--c-deny)', key: 'denied' as const, up: false, foot: 'auth, scope, policy' },
          { label: 'Rate limited', value: totals.rate_limit_rejections, icon: Clock, tone: 'var(--c-review)', key: 'rateLimited' as const, up: false, foot: 'HTTP 429' },
          { label: 'Guard blocks', value: metrics?.injection_guard?.blocked ?? 0, icon: ShieldAlert, tone: 'var(--c-high)', key: 'guard' as const, up: false, foot: metrics?.injection_guard ? plural(metrics.injection_guard.hits, 'hit') : 'injection guard' },
        ].map(({ label, value, icon: Icon, tone, key, up, foot }) => (
          <KpiCard
            key={label}
            label={label}
            icon={<Icon size={13} />}
            tone={tone}
            value={<Count value={value} color="var(--c-text)" />}
            series={series ? series.buckets.map(bk => bk[key]) : undefined}
            current={series?.current[key]}
            previous={series?.previous[key]}
            goodWhenUp={up}
            foot={foot}
          />
        ))}
        <KpiCard
          label="Tool latency"
          icon={<Gauge size={13} />}
          tone="var(--c-info)"
          value={<span>{series?.latency.p95 != null ? fmtDuration(series.latency.p95) : '—'}<span className="kpi-unit"> p95</span></span>}
          foot={series?.latency.samples
            ? `p50 ${fmtDuration(series.latency.p50)} · ${plural(series.latency.samples, 'call')}, 30 min`
            : 'no tool calls in 30 min'}
        />
      </div>

      <section className="panel panel-pad">
        <div className="section-label">Request pipeline</div>
        <PipelineStrip lights={lights} />
      </section>

      <div className="split-main">
        <section className="panel panel-grow">
          <div className="panel-head">
            <span className="section-label label-with-icon">
              <FileText size={14} aria-hidden />
              Live Events
            </span>
            <StreamDot state={streamState} />
          </div>
          <div className="events-scroll">
            {events.length === 0 ? (
              <EmptyState
                label="No gateway events yet"
                hint="Events appear here as soon as a client calls the gateway. Try a call with any key:"
                command={trafficCommands(getApiBase()).restCall}
              />
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
                  {events.slice(0, 18).map((evt, idx) => (
                    <tr key={evt.id} className={idx === 0 ? 'row-enter' : ''}>
                      <td className="mono nowrap">{fmtTimestamp(evt.created_at)}</td>
                      <td className={`mono ${auditRowClass(evt)}`}>{evt.action}</td>
                      <td><span className={`badge ${decisionBadgeClass(evt.decision)}`}>{evt.decision}</span></td>
                      <td className="mono">{evt.tool_name ?? '—'}</td>
                      <td className="mono dim">{evt.key_prefix ?? '—'}</td>
                      <td className="mono">{fmtDuration(evt.duration_ms)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

        <section className="panel demo-panel">
          <div className="panel-head">
            <span className="section-label">Demo sequence</span>
            <button className="btn btn-primary btn-sm" onClick={() => void runSequence()} disabled={offline || !!demoRunning}>
              <Play size={12} aria-hidden />
              {demoRunning ? 'Running…' : 'Run demo sequence'}
            </button>
          </div>
          <ol className="demo-steps">
            {DEMO_SEQUENCE.map(step => {
              const result = demoResults[step.id];
              const active = demoRunning === step.id;
              return (
                <li key={step.id} className={active ? 'demo-step demo-step-active' : 'demo-step'}>
                  <p>{step.caption}</p>
                  {result && (
                    <p className="demo-step-result">
                      <span className="badge result-stage" style={{ color: result.stageColor, borderColor: result.stageColor }}>
                        {result.stage}
                      </span>
                      <span className="mono">HTTP {result.status}</span>
                      {result.pinReason && <span className="mono">{result.pinReason}</span>}
                    </p>
                  )}
                  {result && <p className="page-sub">{result.summary}</p>}
                </li>
              );
            })}
          </ol>
          {offline && <p className="page-sub">The sequence sends real requests only while the backend is up.</p>}
          {demoError && <p className="tone-deny">{demoError}</p>}
        </section>
      </div>

      <div className="split-uneven">
        <section className="panel panel-pad">
          <div className="section-label">Tool Pins</div>
          <div className="stack">
            {(['trusted', 'review', 'drift', 'revoked'] as const).map(key => (
              <div key={key} className="row-between">
                <span className={`badge ${PIN_BADGE_CLASS[key]}`}>{PIN_BADGE_LABEL[key]}</span>
                <span className="mono pin-count">{summary[key]}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="panel panel-pad">
          <div className="section-label">Backend Health</div>
          <div className="stack">
            <div className="row-between">
              <span className="muted-line"><Server size={12} aria-hidden /> MCP</span>
              {mcpUnconfigured ? (
                <span className="mcp-warn">MCP not configured: set MCP_SELF_API_KEY</span>
              ) : (
                <span className={`badge ${probe?.mcp === 'online' ? 'badge-allow' : 'badge-deny'}`}>
                  {probe?.mcp ?? '—'}
                </span>
              )}
            </div>
            <div className="row-between">
              <span className="muted-line">Database</span>
              <span className={`badge ${metrics?.database?.available ? 'badge-allow' : 'badge-deny'}`}>
                {metrics?.database?.available ? 'ok' : 'error'}
              </span>
            </div>
            <div className="row-between">
              <span className="muted-line">Latency</span>
              <span className="mono">{probe?.latency_ms != null ? `${probe.latency_ms} ms` : '—'}</span>
            </div>
            <div className="row-between">
              <span className="muted-line">Rate buckets</span>
              <span className="mono">{metrics?.in_process_limiter?.active_buckets ?? 0}</span>
            </div>
          </div>
        </section>

        <section className="panel panel-pad">
          <div className="section-label label-with-icon"><Box size={12} aria-hidden /> Sandbox Runs</div>
          <div className="stack">
            {sandbox && Object.entries(sandbox.by_status).filter(([, count]) => count > 0).sort(([, a], [, b]) => b - a).map(([name, count]) => (
              <div key={name} className="row-between">
                <span className={`badge ${sandboxStatusBadgeClass(name)}`}>{name}</span>
                <span className="mono pin-count">{count}</span>
              </div>
            ))}
            {(!sandbox || Object.values(sandbox.by_status).every(count => count === 0)) && (
              <span className="page-sub">No runs yet</span>
            )}
          </div>
        </section>
      </div>

      {metrics?.slowest_tools && metrics.slowest_tools.length > 0 && (
        <section className="panel">
          <div className="panel-head"><span className="section-label">Slowest Tools</span></div>
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
              {metrics.slowest_tools.map(tool => (
                <tr key={tool.tool_name}>
                  <td className="mono">{tool.tool_name}</td>
                  <td className="mono">{tool.request_count}</td>
                  <td className="mono">{fmtDuration(tool.avg_duration_ms)}</td>
                  <td className="mono">{fmtDuration(tool.max_duration_ms)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
