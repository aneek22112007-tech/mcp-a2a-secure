import { useId, type ReactNode } from 'react';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';

// ── Sparkline ─────────────────────────────────────────────────────────
export function Sparkline({
  values,
  color = 'var(--c-amber)',
  height = 32,
  label,
}: {
  values: number[];
  color?: string;
  height?: number;
  label?: string;
}) {
  const gid = useId().replace(/:/g, '');
  const w = 120;
  const max = Math.max(1, ...values);
  const step = values.length > 1 ? w / (values.length - 1) : w;
  const pts = values.map((v, i) => [i * step, height - 2 - (v / max) * (height - 4)] as const);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} L${w},${height} L0,${height} Z`;
  const last = pts[pts.length - 1];
  return (
    <svg
      className="sparkline"
      viewBox={`0 0 ${w} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={label ?? 'Trend over the last 30 minutes'}
      style={{ height }}
    >
      <defs>
        <linearGradient id={`sg-${gid}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.14" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {values.length > 1 && <path d={area} fill={`url(#sg-${gid})`} />}
      {values.length > 1 && (
        <path d={line} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      )}
      {last && <circle cx={last[0]} cy={last[1]} r="2" fill={color} vectorEffect="non-scaling-stroke" />}
    </svg>
  );
}

// ── Trend delta ───────────────────────────────────────────────────────
/** `goodWhenUp` flips colouring for metrics where an increase is bad (denials). */
export function TrendDelta({ current, previous, goodWhenUp = true }: { current: number; previous: number; goodWhenUp?: boolean }) {
  const diff = current - previous;
  if (current === 0 && previous === 0) {
    return <span className="trend trend-flat"><Minus size={11} aria-hidden /> idle</span>;
  }
  const pct = previous === 0 ? null : Math.round((diff / previous) * 100);
  const up = diff > 0;
  const flat = diff === 0;
  const tone = flat ? 'flat' : (up === goodWhenUp ? 'good' : 'bad');
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
  const text = flat ? 'no change' : pct == null ? `+${diff} new` : `${up ? '+' : ''}${pct}%`;
  return (
    <span className={`trend trend-${tone}`} title={`${current} in the last 15 min vs ${previous} in the 15 min before`}>
      <Icon size={11} aria-hidden /> {text}
    </span>
  );
}

// ── KPI card ──────────────────────────────────────────────────────────
export function KpiCard({
  label, icon, value, tone = 'var(--c-text)', series, current, previous, goodWhenUp, foot, wide,
}: {
  label: string;
  icon: ReactNode;
  value: ReactNode;
  tone?: string;
  series?: number[];
  current?: number;
  previous?: number;
  goodWhenUp?: boolean;
  foot?: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={`kpi-card ${wide ? 'kpi-card-wide' : ''}`} style={{ ['--kpi-tone' as string]: tone }}>
      <div className="kpi-head">
        <span className="kpi-icon" aria-hidden>{icon}</span>
        <span className="stat-card-label">{label}</span>
      </div>
      <div className="kpi-body">
        <div className="kpi-value">{value}</div>
        {series && <Sparkline values={series} color={tone} label={`${label} per minute, last 30 minutes`} />}
      </div>
      <div className="kpi-foot">
        {current != null && previous != null && <TrendDelta current={current} previous={previous} goodWhenUp={goodWhenUp} />}
        {foot && <span className="kpi-foot-note">{foot}</span>}
      </div>
    </div>
  );
}

// ── Skeletons ─────────────────────────────────────────────────────────
export function Skeleton({ w = '100%', h = 12, r }: { w?: number | string; h?: number | string; r?: number }) {
  return <span className="skeleton" style={{ width: w, height: h, borderRadius: r }} aria-hidden />;
}

export function SkeletonPage({ label = 'Loading…', rows = 6, cards = 4 }: { label?: string; rows?: number; cards?: number }) {
  return (
    <div className="console-page" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}</span>
      <div className="page-header">
        <div style={{ display: 'grid', gap: 8 }}>
          <Skeleton w={180} h={22} />
          <Skeleton w={260} h={12} />
        </div>
      </div>
      {cards > 0 && (
        <div className="kpi-row">
          {Array.from({ length: cards }, (_, i) => (
            <div key={i} className="kpi-card" style={{ gap: 12 }}>
              <Skeleton w={90} h={10} />
              <Skeleton w={120} h={26} />
              <Skeleton h={28} />
            </div>
          ))}
        </div>
      )}
      <div className="panel" style={{ padding: 16, display: 'grid', gap: 12 }}>
        <Skeleton w={140} h={10} />
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '90px 1fr 120px 80px', gap: 16 }}>
            <Skeleton h={12} /><Skeleton h={12} w={`${60 + ((i * 17) % 35)}%`} /><Skeleton h={12} /><Skeleton h={12} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="kbd">{children}</kbd>;
}

