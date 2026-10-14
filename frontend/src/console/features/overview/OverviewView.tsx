import { useEffect, useState } from 'react';
import NumberFlow from '@number-flow/react';
import { Activity, Shield, AlertTriangle, Clock, Server, Box, FileText, Play } from 'lucide-react';
import { useMetrics, useHealth, useStatus, useAuditStream, useAudit, usePins } from '../../api/hooks';
import { LoadingPanel, ErrorPanel, StreamDot, EmptyState } from '../../components/ui';
import { PipelineStrip } from '../../components/Pipeline';
import { lightsMatched, pipelineLights, type StageLight } from '../../components/pipelineLogic';
import { DEMO_SEQUENCE, waitForCaption, type AttackResult } from '../attack/runners';
import {
  fmtTimestamp, fmtDuration, fmtUptime, decisionBadgeClass,
  getPinBadge, PIN_BADGE_CLASS, PIN_BADGE_LABEL,
  sandboxStatusBadgeClass, auditRowClass, isConsolePoll,
} from '../../utils/helpers';
import type { MetricsResponse, AuditEvent, ToolPin } from '../../api/client';
import { DEMO_METRICS, DEMO_AUDIT_EVENTS, DEMO_PINS } from '../../demo/demoData';
import { useReducedMotion } from '../../../hooks/useReducedMotion';

interface OverviewProps {
  isDemo: boolean;
}

function useGaveUp(active: boolean): boolean {
  const [gaveUp, setGaveUp] = useState(false);
  useEffect(() => {
    if (!active) {
      setGaveUp(false);
      return;
    }
    const timer = window.setTimeout(() => setGaveUp(true), 5000);
    return () => window.clearTimeout(timer);
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
      <NumberFlow value={value} format={{ notation: 'compact' }} />
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

export function OverviewView({ isDemo }: OverviewProps) {
  const { data: liveMetrics, isLoading, isError, refetch } = useMetrics(!isDemo);
  const { data: health } = useHealth(!isDemo);
  const { data: status } = useStatus(!isDemo);
  const { data: livePins } = usePins(!isDemo);
  const { data: auditPage } = useAudit({ limit: 50 }, !isDemo);
  const { events: liveEvents, state: streamState } = useAuditStream(20, !isDemo);
  const [demoResults, setDemoResults] = useState<Record<string, AttackResult>>({});
  const [demoRunning, setDemoRunning] = useState<string | null>(null);
  const [demoError, setDemoError] = useState('');
  const [lights, setLights] = useState<StageLight[]>(() => pipelineLights('', 0));
  const gaveUp = useGaveUp(!isDemo && isLoading && !liveMetrics);

  const metrics: MetricsResponse | undefined = isDemo ? DEMO_METRICS : liveMetrics;
  const probe = isDemo ? undefined : status;
  const events: AuditEvent[] = isDemo
    ? DEMO_AUDIT_EVENTS
    : mergeEvents(liveEvents, auditPage?.items ?? []);
  const pins = isDemo ? DEMO_PINS : (livePins?.items ?? []);
  const summary = pinCounts(pins);

  if (!isDemo && isLoading && !metrics && !gaveUp) return <LoadingPanel label="Loading metrics…" />;
  if (!isDemo && (isError || gaveUp) && !metrics) {
    return (
      <ErrorPanel
        message={gaveUp && !isError ? 'Metrics timed out after 5 seconds.' : 'Failed to load metrics'}
        onRetry={() => void refetch()}
      />
    );
  }

  const totals = metrics?.totals ?? { total: 0, successful: 0, denied: 0, error: 0, rate_limit_rejections: 0 };
  const sandbox = metrics?.sandbox;
  const mcpUnconfigured = !isDemo && status?.mcp === 'offline' && status.error === 'mcp_unavailable';

  const rememberLights = (result: AttackResult) => {
    const next = pipelineLights(result.stage, result.status);
    if (lightsMatched(next)) setLights(next);
  };

  const runSequence = async () => {
    if (isDemo || demoRunning) return;
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
          {!isDemo && (
            <p className="page-sub">
              {health ? health.app : 'Backend status unknown'}
              {probe?.uptime_seconds != null && ` · uptime ${fmtUptime(probe.uptime_seconds)}`}
            </p>
          )}
        </div>
        {!isDemo && <StreamDot state={streamState} />}
      </header>

      <div className="stat-row">
        {[
          { label: 'Total Requests', value: totals.total, icon: Activity, color: 'var(--c-text)', wide: true },
          { label: 'Successful', value: totals.successful, icon: Shield, color: 'var(--c-allow)', wide: false },
          { label: 'Denied', value: totals.denied, icon: AlertTriangle, color: 'var(--c-deny)', wide: false },
          { label: 'Rate Limited', value: totals.rate_limit_rejections, icon: Clock, color: 'var(--c-review)', wide: false },
        ].map(({ label, value, icon: Icon, color, wide }) => (
          <div key={label} className={`stat-card ${wide ? 'stat-card-wide' : ''}`}>
            <div className="row-between">
              <span className="stat-card-label">{label}</span>
              <Icon size={14} aria-hidden />
            </div>
            <Count value={value} color={color} />
          </div>
        ))}
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
            {!isDemo && <StreamDot state={streamState} />}
          </div>
          <div className="events-scroll">
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
                  {events.slice(0, 18).map((evt, idx) => (
                    <tr key={evt.id} className={idx === 0 && !isDemo ? 'row-enter' : ''}>
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
            <button className="btn btn-primary btn-sm" onClick={() => void runSequence()} disabled={isDemo || !!demoRunning}>
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
          {isDemo && <p className="page-sub">Demo data is on screen. The sequence sends real requests only while the backend is up.</p>}
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
              {isDemo ? (
                <span className="badge badge-muted">demo</span>
              ) : mcpUnconfigured ? (
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
