import { useState } from 'react';
import {
  Pin, RefreshCw, CheckCircle, XCircle, AlertTriangle, Info,
} from 'lucide-react';
import { usePins, useSyncPins, useApprovePin, useRevokePin } from '../../api/hooks';
import {
  LoadingPanel, ErrorPanel, EmptyState,
  MonoValue, ConfirmDialog, ConsoleErrorBoundary,
} from '../../components/ui';
import {
  fmtDatetime, elapsedSince,
  getPinBadge, PIN_BADGE_CLASS, PIN_BADGE_LABEL,
} from '../../utils/helpers';
import { DEMO_PINS } from '../../demo/demoData';
import type { ToolPin } from '../../api/client';
import { toast } from 'sonner';

interface PinsViewProps { isDemo: boolean }

function PinStatusIcon({ pin }: { pin: ToolPin }) {
  const badge = getPinBadge(pin);
  switch (badge) {
    case 'trusted':  return <CheckCircle size={14} style={{ color: 'var(--c-allow)' }} aria-label="Trusted" />;
    case 'drift':    return <AlertTriangle size={14} style={{ color: 'var(--c-deny)' }} aria-label="Drift detected" />;
    case 'revoked':  return <XCircle size={14} style={{ color: 'var(--c-deny)' }} aria-label="Revoked" />;
    case 'review':   return <AlertTriangle size={14} style={{ color: 'var(--c-review)' }} aria-label="Needs review" />;
    default:         return <Info size={14} style={{ color: 'var(--c-text-dim)' }} />;
  }
}

function PinsViewInner({ isDemo }: PinsViewProps) {
  const [approveTarget, setApproveTarget] = useState<ToolPin | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<ToolPin | null>(null);
  const [note, setNote] = useState('');
  const [pinningModeHint] = useState<'off' | 'warn' | 'enforce'>('enforce');

  const { data, isLoading, isError, refetch } = usePins(!isDemo);
  const syncPins  = useSyncPins();
  const approvePin = useApprovePin();
  const revokePin  = useRevokePin();

  const pins: ToolPin[] = isDemo ? DEMO_PINS : (data?.items ?? []);

  const handleSync = async () => {
    try {
      const res = await syncPins.mutateAsync();
      toast.success(`Sync complete — ${res.updated.length} pin(s) updated`);
    } catch (err: unknown) {
      toast.error((err as Error).message ?? 'Sync failed');
    }
  };

  const handleApprove = async () => {
    if (!approveTarget) return;
    try {
      await approvePin.mutateAsync({ tool_name: approveTarget.tool_name, note: note || undefined });
      toast.success(`Approved pin for ${approveTarget.tool_name}`);
    } catch (err: unknown) {
      toast.error((err as Error).message ?? 'Approve failed');
    } finally {
      setApproveTarget(null);
      setNote('');
    }
  };

  const handleRevoke = async () => {
    if (!revokeTarget) return;
    try {
      await revokePin.mutateAsync({ tool_name: revokeTarget.tool_name, note: note || undefined });
      toast.success(`Revoked pin for ${revokeTarget.tool_name}`);
    } catch (err: unknown) {
      toast.error((err as Error).message ?? 'Revoke failed');
    } finally {
      setRevokeTarget(null);
      setNote('');
    }
  };

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--c-text)', margin: 0 }}>
            Tool Pinning
          </h1>
          <p style={{ fontSize: 11, color: 'var(--c-text-muted)', margin: '2px 0 0' }}>
            Schema fingerprints — approve or revoke tool definitions.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            className="btn btn-ghost btn-sm"
            onClick={handleSync}
            disabled={isDemo || syncPins.isPending}
            aria-label="Sync pins from live catalog"
          >
            <RefreshCw size={12} style={syncPins.isPending ? { animation: 'spin 1s linear infinite' } : undefined} />
            Sync
          </button>
        </div>
      </div>

      {/* Pinning mode banner */}
      <div
        className="panel"
        style={{
          padding: '10px 14px',
          display: 'flex',
          gap: 10,
          alignItems: 'center',
          borderColor: pinningModeHint === 'enforce' ? 'var(--c-amber)' : 'var(--c-border)',
        }}
      >
        <Pin size={13} style={{ color: 'var(--c-amber)', flexShrink: 0 }} />
        <span style={{ fontSize: 12, color: 'var(--c-text-muted)' }}>
          Pinning mode is set in{' '}
          <span className="mono">api/.env</span>
          {' '}→{' '}
          <span className="mono" style={{ color: 'var(--c-amber)' }}>TOOL_PINNING_MODE</span>.
          {' '}This console shows a hint only — current server value is not exposed by any endpoint.
        </span>
        <span
          className={`badge ${pinningModeHint === 'enforce' ? 'badge-deny' : pinningModeHint === 'warn' ? 'badge-review' : 'badge-muted'}`}
          style={{ flexShrink: 0 }}
        >
          {pinningModeHint}
        </span>
      </div>

      {/* Pin legend */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {(['trusted', 'review', 'drift', 'revoked'] as const).map(k => (
          <span key={k} style={{ display: 'flex', gap: 5, alignItems: 'center', fontSize: 11, color: 'var(--c-text-muted)' }}>
            <span className={`badge ${PIN_BADGE_CLASS[k]}`}>{PIN_BADGE_LABEL[k]}</span>
          </span>
        ))}
        <span style={{ fontSize: 11, color: 'var(--c-text-dim)' }}>
          Drift = approved but fingerprint changed · Review = pending approval
        </span>
      </div>

      {/* Pins table */}
      <div className="panel">
        {!isDemo && isLoading && !data ? (
          <LoadingPanel label="Loading pins…" />
        ) : !isDemo && isError ? (
          <ErrorPanel message="Failed to load pins" onRetry={() => void refetch()} />
        ) : pins.length === 0 ? (
          <EmptyState label="No tools registered yet. Run Sync to populate." icon={Pin} />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Status</th>
                <th>Tool</th>
                <th>Stored fingerprint</th>
                <th>Live fingerprint</th>
                <th>Match</th>
                <th>Approved</th>
                <th aria-label="Actions"></th>
              </tr>
            </thead>
            <tbody>
              {pins.map(pin => {
                const badge = getPinBadge(pin);
                const isDrift = badge === 'drift';

                return (
                  <tr
                    key={pin.tool_name}
                    className={isDrift ? 'snap-deny' : undefined}
                    style={isDrift ? { animationIterationCount: 1 } : undefined}
                  >
                    <td>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <PinStatusIcon pin={pin} />
                        <span className={`badge ${PIN_BADGE_CLASS[badge]}`}>
                          {PIN_BADGE_LABEL[badge]}
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className="mono" style={{ fontSize: 12, fontWeight: 600 }}>
                        {pin.tool_name}
                      </span>
                      {pin.note && (
                        <span style={{ fontSize: 10, color: 'var(--c-text-dim)', marginLeft: 6 }}>
                          {pin.note}
                        </span>
                      )}
                    </td>
                    <td>
                      <MonoValue value={pin.fingerprint} maxLen={16} copyable />
                    </td>
                    <td>
                      <MonoValue
                        value={pin.live_fingerprint}
                        maxLen={16}
                        copyable
                      />
                    </td>
                    <td>
                      {pin.fingerprint && pin.live_fingerprint ? (
                        pin.matches
                          ? <CheckCircle size={13} style={{ color: 'var(--c-allow)' }} aria-label="Matches" />
                          : <AlertTriangle size={13} style={{ color: 'var(--c-deny)' }} aria-label="Mismatch" />
                      ) : (
                        <span style={{ color: 'var(--c-text-dim)', fontSize: 11 }}>—</span>
                      )}
                    </td>
                    <td style={{ fontSize: 11, color: 'var(--c-text-muted)' }}>
                      {pin.approved_at ? elapsedSince(pin.approved_at) : '—'}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {badge !== 'trusted' && badge !== 'revoked' && (
                          <button
                            className="btn btn-success btn-sm"
                            onClick={() => setApproveTarget(pin)}
                            disabled={isDemo}
                            title={`Approve ${pin.tool_name}`}
                            aria-label={`Approve ${pin.tool_name}`}
                          >
                            <CheckCircle size={11} /> Approve
                          </button>
                        )}
                        {badge === 'trusted' && (
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => setRevokeTarget(pin)}
                            disabled={isDemo}
                            title={`Revoke ${pin.tool_name}`}
                            aria-label={`Revoke ${pin.tool_name}`}
                          >
                            <XCircle size={11} /> Revoke
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Approve confirm */}
      {approveTarget && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Approve pin"
        >
          <div
            className="panel"
            style={{ width: 400, padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}
          >
            <div style={{ display: 'flex', gap: 8, color: 'var(--c-allow)', alignItems: 'center' }}>
              <CheckCircle size={16} />
              <span style={{ fontWeight: 700 }}>Approve {approveTarget.tool_name}</span>
            </div>
            <p style={{ fontSize: 12, color: 'var(--c-text-muted)', lineHeight: 1.5 }}>
              This approves the live fingerprint:{' '}
              <span className="mono" style={{ fontSize: 11 }}>
                {(approveTarget.live_fingerprint ?? '').slice(0, 24)}…
              </span>
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label className="section-label" htmlFor="approve-note">Note (optional)</label>
              <input
                id="approve-note"
                className="input"
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="Reason for approval…"
                maxLength={500}
              />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => { setApproveTarget(null); setNote(''); }}>Cancel</button>
              <button className="btn btn-success" onClick={handleApprove} disabled={approvePin.isPending}>
                {approvePin.isPending ? 'Approving…' : 'Approve'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Revoke confirm */}
      <ConfirmDialog
        open={!!revokeTarget}
        title={`Revoke pin: ${revokeTarget?.tool_name}`}
        body={`This revokes the approved pin for "${revokeTarget?.tool_name}". In enforce mode, the tool will be blocked until re-approved.`}
        confirmLabel="Revoke"
        danger
        onConfirm={handleRevoke}
        onCancel={() => { setRevokeTarget(null); setNote(''); }}
      />

      {/* Approved at detail */}
      <div style={{ fontSize: 11, color: 'var(--c-text-dim)' }}>
        {pins
          .filter(p => p.approved_at)
          .slice(0, 2)
          .map(p => (
            <span key={p.tool_name} style={{ marginRight: 12 }}>
              <span className="mono">{p.tool_name}</span> approved {fmtDatetime(p.approved_at!)}
            </span>
          ))}
      </div>
    </div>
  );
}

export function PinsView(props: PinsViewProps) {
  return (
    <ConsoleErrorBoundary>
      <PinsViewInner {...props} />
    </ConsoleErrorBoundary>
  );
}
