import type { ReactNode } from 'react';
import { Shield } from 'lucide-react';

export type CoreState = 'ok' | 'degraded' | 'down' | 'unknown';

const STATE_LABEL: Record<CoreState, string> = {
  ok: 'Gateway operational',
  degraded: 'Gateway degraded',
  down: 'Gateway unreachable',
  unknown: 'Checking gateway',
};

/**
 * A 3D gyroscope that reflects the live gateway state. The rings are pure
 * CSS transforms. Colour and speed follow `state`; the facts beside it are
 * passed in by the caller and come straight from the API.
 */
export function GatewayCore({
  state,
  facts,
}: {
  state: CoreState;
  facts: { label: string; value: ReactNode }[];
}) {
  return (
    <div className={`core-card core-${state}`}>
      <div className="core-stage" aria-hidden>
        <div className="core-gimbal">
          <span className="core-ring core-ring-1" />
          <span className="core-ring core-ring-2" />
          <span className="core-ring core-ring-3" />
          <span className="core-orbit"><span className="core-sat" /></span>
        </div>
        <span className="core-orb"><Shield size={20} strokeWidth={1.8} /></span>
      </div>
      <div className="core-meta">
        <span className="core-status" role="status">
          <span className="core-dot" aria-hidden />
          {STATE_LABEL[state]}
        </span>
        <dl className="core-facts">
          {facts.map(fact => (
            <div key={fact.label}>
              <dt>{fact.label}</dt>
              <dd>{fact.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
