import NumberFlow from '@number-flow/react';
import type { AuditEvent, ToolPin } from '../../api/client';
import { PIPELINE_STAGES, type StageLight } from '../../components/pipelineLogic';
import { fmtPercent, fmtUptime, isConsolePoll, plural } from '../../utils/helpers';
import { useReducedMotion } from '../../../hooks/useReducedMotion';

type GatewayState = 'ok' | 'degraded' | 'down' | 'unknown';

interface Props {
  state: GatewayState;
  envName: string;
  total: number;
  allowRate: number | null;
  denied: number;
  uptimeSeconds?: number | null;
  events: AuditEvent[];
  pins: ToolPin[];
  lights: StageLight[];
}

const HEADLINE: Record<GatewayState, string> = {
  ok: 'Every request is being checked',
  degraded: 'Gateway up, live stream degraded',
  down: 'Gateway unreachable',
  unknown: 'Connecting to the gateway',
};

function Big({ value, suffix }: { value: number; suffix?: string }) {
  const reduced = useReducedMotion();
  return (
    <span className="band-num">
      {reduced ? value.toLocaleString() : <NumberFlow value={value} format={{ useGrouping: true }} />}
      {suffix && <span className="band-num-unit">{suffix}</span>}
    </span>
  );
}

/** Group the loaded audit rows into who called, which tool, and how many were stopped. */
function summarise(events: AuditEvent[], pins: ToolPin[]) {
  const seen = new Set<string>();
  const keys = new Map<string, number>();
  const tools = new Map<string, number>();
  let blocked = 0;
  let screened = 0;
  for (const evt of events) {
    if (seen.has(evt.id) || isConsolePoll(evt)) continue;
    seen.add(evt.id);
    screened += 1;
    const who = evt.key_prefix ?? 'no key';
    keys.set(who, (keys.get(who) ?? 0) + 1);
    if (evt.decision === 'denied') blocked += 1;
    if (evt.tool_name && evt.action === 'mcp.tools_call') tools.set(evt.tool_name, (tools.get(evt.tool_name) ?? 0) + 1);
  }
  for (const pin of pins) if (!tools.has(pin.tool_name)) tools.set(pin.tool_name, 0);
  const top = (m: Map<string, number>, n: number) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
  return { keys: top(keys, 3), keyCount: keys.size, tools: top(tools, 3), toolCount: tools.size, blocked, screened };
}

export function CommandBand({ state, envName, total, allowRate, denied, uptimeSeconds, events, pins, lights }: Props) {
  const s = summarise(events, pins);
  const W = 660;
  const H = 300;
  const gx = 250;
  const gw = 170;
  const gy = 40;
  const gh = 210;
  const rowY = (i: number, n: number) => (n <= 1 ? H / 2 - 10 : 50 + (i * (H - 120)) / (n - 1));
  const keyRows = s.keys.length ? s.keys : [['no traffic yet', 0] as [string, number]];
  const toolRows = s.tools.length ? s.tools : [['no tools yet', 0] as [string, number]];
  const maxKey = Math.max(1, ...keyRows.map(k => k[1]));
  const maxTool = Math.max(1, ...toolRows.map(t => t[1]));
  const mid = gy + gh / 2;

  return (
    <section className={`command-band band-${state}`} aria-label="Gateway status">
      <div className="band-glow" aria-hidden />
      <div className="band-left">
        <div className="band-eyebrow">
          <span className={`band-dot dot-${state}`} aria-hidden />
          {state === 'ok' ? 'Live' : state === 'degraded' ? 'Degraded' : state === 'down' ? 'Offline' : 'Checking'} · {envName}
          {uptimeSeconds != null && <span className="band-up"> · up {fmtUptime(uptimeSeconds)}</span>}
        </div>
        <h2 className="band-title">{HEADLINE[state]}</h2>
        <p className="band-sub">
          {PIPELINE_STAGES.length} checks stand between your agents and {plural(s.toolCount, 'tool')}.
          {s.screened > 0 && ` ${s.blocked} of the latest ${s.screened} requests were stopped.`}
        </p>
        <div className="band-counters">
          <div>
            <Big value={total} />
            <span className="band-label">requests screened</span>
          </div>
          <div>
            <span className="band-num band-allow">{allowRate == null ? '—' : fmtPercent(allowRate)}</span>
            <span className="band-label">allowed</span>
          </div>
          <div>
            <span className="band-deny"><Big value={denied} /></span>
            <span className="band-label">blocked</span>
          </div>
        </div>
      </div>

      <svg className="band-flow" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Traffic flow: ${s.keyCount} callers through ${PIPELINE_STAGES.length} gateway checks to ${s.toolCount} tools, ${s.blocked} blocked, from the latest ${s.screened} audit events`}>
        <defs>
          <linearGradient id="bandIn" x1="0" x2="1">
            <stop offset="0" stopColor="#FF6A3D" stopOpacity="0.15" />
            <stop offset="1" stopColor="#FF6A3D" stopOpacity="0.95" />
          </linearGradient>
          <linearGradient id="bandOut" x1="0" x2="1">
            <stop offset="0" stopColor="#2DD4BF" stopOpacity="0.95" />
            <stop offset="1" stopColor="#2DD4BF" stopOpacity="0.35" />
          </linearGradient>
        </defs>

        {keyRows.map(([name, n], i) => {
          const y = rowY(i, keyRows.length);
          const w = 1.5 + (n / maxKey) * 5;
          return (
            <g key={`k-${name}`}>
              <path className="flow-line" d={`M130,${y + 20} C190,${y + 20} 190,${mid} ${gx},${mid}`} stroke="url(#bandIn)" strokeWidth={w} fill="none" />
              <rect x="0" y={y} width="130" height="40" rx="12" className="flow-node" />
              <text x="14" y={y + 17} className="flow-name">{name}</text>
              <text x="14" y={y + 32} className="flow-meta">{plural(n, 'request')}</text>
            </g>
          );
        })}

        {toolRows.map(([name, n], i) => {
          const y = rowY(i, toolRows.length);
          const w = n > 0 ? 1.5 + (n / maxTool) * 5 : 1;
          return (
            <g key={`t-${name}`}>
              <path className={`flow-line ${n > 0 ? '' : 'flow-idle'}`} d={`M${gx + gw},${mid} C${gx + gw + 60},${mid} ${W - 190},${y + 20} ${W - 130},${y + 20}`} stroke="url(#bandOut)" strokeWidth={w} fill="none" />
              <rect x={W - 130} y={y} width="130" height="40" rx="12" className="flow-node" />
              <text x={W - 116} y={y + 17} className="flow-name">{name}</text>
              <text x={W - 116} y={y + 32} className="flow-meta">{plural(n, 'call')}</text>
            </g>
          );
        })}

        <rect x={gx} y={gy} width={gw} height={gh} rx="20" className="flow-gate" />
        <text x={gx + gw / 2} y={gy + 28} textAnchor="middle" className="flow-gate-title">MCP GUARD</text>
        {PIPELINE_STAGES.map((stage, i) => {
          const light = lights[i] ?? 'idle';
          const y = gy + 44 + i * 26;
          return (
            <g key={stage}>
              <rect x={gx + 14} y={y} width={gw - 28} height="20" rx="7" className={`flow-stage stage-${light}`} />
              <circle cx={gx + 26} cy={y + 10} r="3" className={`flow-stage-dot stage-${light}`} />
              <text x={gx + 36} y={y + 14} className="flow-stage-text">{stage}</text>
            </g>
          );
        })}

        <path className="flow-line flow-block" d={`M${gx + gw / 2},${gy + gh} L${gx + gw / 2},${H - 8}`} strokeWidth={2 + Math.min(4, s.blocked / 10)} fill="none" />
        <text x={gx + gw / 2 + 12} y={H - 10} className="flow-block-text">{s.blocked} blocked</text>
      </svg>
    </section>
  );
}
