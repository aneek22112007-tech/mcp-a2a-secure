import { useId, type ReactNode } from 'react';
import { Area, AreaChart, ResponsiveContainer } from 'recharts';
import { Check, X } from 'lucide-react';
import { TrendDelta } from './premium';
import { PIPELINE_STAGES, type StageLight } from './pipelineLogic';

/** Card with a title row: title and optional description on the left, an action on the right. */
export function Card({
  title, description, action, children, className = '', bodyClassName = '', icon, label,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  icon?: ReactNode;
  label?: string;
}) {
  return (
    <section className={`card ${className}`} aria-label={label}>
      <header className="card-head">
        <div className="card-titles">
          <h2 className="card-title">{icon && <span className="card-title-icon" aria-hidden>{icon}</span>}{title}</h2>
          {description && <p className="card-desc">{description}</p>}
        </div>
        {action && <div className="card-action">{action}</div>}
      </header>
      <div className={`card-body ${bodyClassName}`}>{children}</div>
    </section>
  );
}

/** KPI card: label and delta on top, value, a one-line narrative, and an area sparkline from real buckets. */
export function StatCard({
  label, value, narrative, series, color = 'var(--c-chart-info)', current, previous, goodWhenUp = true, icon,
}: {
  label: string;
  value: ReactNode;
  narrative?: ReactNode;
  series?: number[];
  color?: string;
  current?: number;
  previous?: number;
  goodWhenUp?: boolean;
  icon?: ReactNode;
}) {
  const gid = `sc${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const data = (series ?? []).map((v, i) => ({ i, v }));
  const hasSeries = data.some(d => d.v > 0);
  return (
    <div className="stat-card">
      <div className="stat-top">
        <span className="stat-label">{icon && <span className="stat-icon" aria-hidden>{icon}</span>}{label}</span>
        {current != null && previous != null && (
          <TrendDelta current={current} previous={previous} goodWhenUp={goodWhenUp} />
        )}
      </div>
      <div className="stat-value">{value}</div>
      {narrative && <div className="stat-narrative">{narrative}</div>}
      {series && <div className="stat-chart" aria-hidden>
        {hasSeries ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} fill={`url(#${gid})`} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="stat-chart-empty" />
        )}
      </div>}
    </div>
  );
}

export interface BarListItem { name: ReactNode; value: number; key: string; hint?: string }

/** Ranked horizontal bars: label over a tinted bar, value right-aligned. */
export function BarList({ items, color = 'var(--c-chart-info)', format = (n: number) => String(n), empty }: {
  items: BarListItem[];
  color?: string;
  format?: (n: number) => string;
  empty?: ReactNode;
}) {
  if (items.length === 0) return <div className="barlist-empty">{empty ?? 'Nothing to rank yet'}</div>;
  const max = Math.max(...items.map(i => i.value), 1);
  return (
    <ul className="barlist">
      {items.map(item => (
        <li key={item.key} className="barlist-row" title={item.hint}>
          <div className="barlist-track">
            <span className="barlist-fill" style={{ width: `${Math.max(4, (item.value / max) * 100)}%`, background: color }} />
            <span className="barlist-name">{item.name}</span>
          </div>
          <span className="barlist-value">{format(item.value)}</span>
        </li>
      ))}
    </ul>
  );
}

/** Numbered horizontal stepper for the gateway request pipeline. */
export function PipelineStepper({ lights }: { lights: StageLight[] }) {
  const lit = lights.some(l => l !== 'idle');
  return (
    <ol className="stepper" aria-label="Request pipeline">
      {PIPELINE_STAGES.map((name, i) => {
        const light = lights[i] ?? 'idle';
        const status = light === 'passed' ? 'Passed' : light === 'blocked' ? 'Stopped here' : lit ? 'Not reached' : 'Waiting';
        return (
          <li key={name} className={`step step-${light}`}>
            <span className="step-node" aria-hidden>
              {light === 'passed' ? <Check size={13} strokeWidth={2.5} /> : light === 'blocked' ? <X size={13} strokeWidth={2.5} /> : i + 1}
            </span>
            <span className="step-text">
              <span className="step-name">{name}</span>
              <span className="step-status">{status}</span>
            </span>
            {i < PIPELINE_STAGES.length - 1 && <span className="step-line" aria-hidden />}
          </li>
        );
      })}
    </ol>
  );
}

/** One status line inside a health card. */
export function StatusRow({ label, icon, value, tone = 'neutral' }: {
  label: string;
  icon?: ReactNode;
  value: ReactNode;
  tone?: 'ok' | 'warn' | 'bad' | 'neutral';
}) {
  return (
    <div className="status-row">
      <span className="status-row-label">{icon && <span className="status-row-icon" aria-hidden>{icon}</span>}{label}</span>
      <span className={`status-row-value tone-${tone}`}>
        {tone !== 'neutral' && <span className="status-row-dot" aria-hidden />}
        {value}
      </span>
    </div>
  );
}
