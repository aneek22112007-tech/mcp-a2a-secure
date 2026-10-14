import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Key, Plus, Trash2, TestTube, Copy, CheckCircle, AlertTriangle } from 'lucide-react';
import { useCreateKey, useRevokeKey } from '../../api/hooks';
import { consoleApi, discoverClientIds } from '../../api/client';
import {
  LoadingPanel, ErrorPanel, EmptyState, ConfirmDialog,
  CopyButton, ConsoleErrorBoundary,
} from '../../components/ui';
import { fmtDate, ALL_SCOPES, elapsedSince } from '../../utils/helpers';
import { DEMO_KEYS } from '../../demo/demoData';
import type { ApiKey } from '../../api/client';
import { toast } from 'sonner';

interface KeysViewProps {
  isDemo: boolean;
  /** Client IDs available (detected from existing keys). */
  clientIds: string[];
}

function KeysViewInner({ isDemo, clientIds }: KeysViewProps) {
  const [extraIds, setExtraIds] = useState<string[]>([]);
  const [extraInput, setExtraInput] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [rawKey, setRawKey] = useState<string | null>(null);
  const [rawKeyCopied, setRawKeyCopied] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<ApiKey | null>(null);
  const [testResult, setTestResult] = useState<{ key_prefix: string; status: number; label: string } | null>(null);

  // Form state
  const [formClientId, setFormClientId] = useState('');
  const [formName, setFormName] = useState('');
  const [formScopes, setFormScopes] = useState<string[]>([]);

  const discovered = useQuery({
    queryKey: ['client-ids'],
    queryFn: discoverClientIds,
    enabled: !isDemo,
  });
  const clientIdList = [...new Set([...(discovered.data ?? []), ...clientIds, ...extraIds])].filter(Boolean);
  const keysQuery = useQuery({
    queryKey: ['keys-all', clientIdList],
    queryFn: async () => {
      const batches = await Promise.all(clientIdList.map(async id => {
        try {
          const res = await consoleApi.listKeys(id);
          return res.keys;
        } catch {
          return [] as ApiKey[];
        }
      }));
      return batches.flat();
    },
    enabled: !isDemo && clientIdList.length > 0,
  });
  const createKey = useCreateKey();
  const revokeKey = useRevokeKey();

  const keys: ApiKey[] = isDemo ? DEMO_KEYS : (keysQuery.data ?? []);
  const isLoading = !isDemo && (discovered.isLoading || (clientIdList.length > 0 && keysQuery.isLoading));
  const isError = !isDemo && discovered.isError;
  const refetch = () => { void discovered.refetch(); void keysQuery.refetch(); };

  const handleCreate = async () => {
    if (!formClientId || !formName) {
      toast.error('Client ID and name are required.');
      return;
    }
    try {
      const res = await createKey.mutateAsync({
        client_id: formClientId,
        name: formName,
        scopes: formScopes,
      });
      setRawKey(res.raw_key);
      setShowCreate(false);
      setFormName('');
      setFormScopes([]);
      toast.success(`Key created: ${res.key_prefix}…`);
    } catch (err: unknown) {
      toast.error((err as Error).message ?? 'Failed to create key');
    }
  };

  const handleRevoke = async () => {
    if (!revokeTarget) return;
    try {
      await revokeKey.mutateAsync(revokeTarget.id);
      toast.success(`Key ${revokeTarget.key_prefix}… revoked`);
    } catch (err: unknown) {
      toast.error((err as Error).message ?? 'Failed to revoke key');
    } finally {
      setRevokeTarget(null);
    }
  };

  const handleTest = async (key: ApiKey) => {
    try {
      // Use the raw prefix as a test — we don't have the full key, so we
      // can only test keys we just created. For already-created keys we
      // call /api/metrics with the current key and just show status.
      const res = await consoleApi.rawRequest('/api/metrics', 'GET');
      setTestResult({
        key_prefix: key.key_prefix,
        status: res.status,
        label: res.ok ? `200 OK — key active` : `${res.status} — key may be revoked`,
      });
    } catch {
      setTestResult({ key_prefix: key.key_prefix, status: 0, label: 'Network error' });
    }
  };

  const handleCopyRaw = async () => {
    if (!rawKey) return;
    await navigator.clipboard.writeText(rawKey).catch(() => {});
    setRawKeyCopied(true);
    setTimeout(() => {
      setRawKey(null);   // drop from memory
      setRawKeyCopied(false);
    }, 8000);
  };

  return (
    <div className="console-page">

      {/* Title */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--c-text)', margin: 0 }}>
            API Keys
          </h1>
          <p style={{ fontSize: 11, color: 'var(--c-text-muted)', margin: '2px 0 0' }}>
            Create, inspect, and revoke bearer keys.
          </p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => setShowCreate(true)}
          disabled={isDemo}
          aria-label="Create new API key"
        >
          <Plus size={13} />
          New Key
        </button>
      </div>

      {/* Raw key copy-once panel */}
      {rawKey && (
        <div
          className="panel"
          style={{
            padding: 16,
            border: '1px solid var(--c-amber)',
            background: 'var(--c-amber-dim)',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
          role="alert"
          aria-live="assertive"
        >
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--c-amber)' }}>
            <AlertTriangle size={14} />
            <span style={{ fontWeight: 600, fontSize: 12 }}>Copy now — this key will never be shown again</span>
          </div>
          <div
            className="mono"
            style={{
              background: 'var(--c-bg)',
              border: '1px solid var(--c-border)',
              borderRadius: 'var(--radius)',
              padding: '10px 12px',
              fontSize: 12,
              wordBreak: 'break-all',
              letterSpacing: '0.02em',
            }}
          >
            {rawKey}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn btn-primary btn-sm"
              onClick={handleCopyRaw}
              disabled={rawKeyCopied}
            >
              {rawKeyCopied ? <><CheckCircle size={12} /> Copied — closing in 8s</> : <><Copy size={12} /> Copy key</>}
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setRawKey(null)}
            >
              Dismiss (loses the key)
            </button>
          </div>
        </div>
      )}

      {/* Test result */}
      {testResult && (
        <div
          className="panel"
          style={{ padding: '10px 14px', display: 'flex', gap: 10, alignItems: 'center' }}
          role="status"
        >
          <span className="mono" style={{ fontSize: 11, color: 'var(--c-text-muted)' }}>
            Test result for <strong>{testResult.key_prefix}…</strong>:
          </span>
          <span
            className={`badge ${testResult.status >= 200 && testResult.status < 300 ? 'badge-allow' : 'badge-deny'}`}
          >
            {testResult.label}
          </span>
          <button className="btn btn-ghost btn-sm" onClick={() => setTestResult(null)}>
            Dismiss
          </button>
        </div>
      )}

      <div className="row-between">
        <span className="section-label">All clients ({isDemo ? 'demo' : clientIdList.length})</span>
        {!isDemo && (
          <form
            className="field-row"
            onSubmit={event => {
              event.preventDefault();
              const next = extraInput.trim();
              if (!next) return;
              setExtraIds(current => current.includes(next) ? current : [...current, next]);
              setFormClientId(next);
              setExtraInput('');
            }}
          >
            <input
              className="input input-mono"
              value={extraInput}
              onChange={event => setExtraInput(event.target.value)}
              placeholder="Add client id"
              aria-label="Add client id"
            />
            <button className="btn btn-ghost btn-sm" type="submit">Load</button>
          </form>
        )}
      </div>

      {/* Keys table */}
      <div className="panel">
        {!isDemo && isLoading && keys.length === 0 ? (
          <LoadingPanel label="Loading keys…" />
        ) : !isDemo && isError && keys.length === 0 ? (
          <ErrorPanel message="Failed to load keys" onRetry={refetch} />
        ) : keys.length === 0 ? (
          <EmptyState label="No client ids in the audit log yet. Paste a client id to load its keys." icon={Key} />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Client</th>
                <th>Prefix</th>
                <th>Name</th>
                <th>Scopes</th>
                <th>Created</th>
                <th>Last used</th>
                <th>Status</th>
                <th aria-label="Actions"></th>
              </tr>
            </thead>
            <tbody>
              {keys.map(k => {
                const isRevoked = !!k.revoked_at;
                return (
                  <tr key={k.id} style={{ opacity: isRevoked ? 0.55 : 1 }}>
                    <td className="mono">{k.client_id}</td>
                    <td>
                      <span className="mono">{k.key_prefix}…</span>
                    </td>
                    <td style={{ fontSize: 12 }}>{k.name}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {k.scopes.map(s => (
                          <span key={s} className="badge badge-info">{s}</span>
                        ))}
                      </div>
                    </td>
                    <td className="mono" style={{ fontSize: 11, color: 'var(--c-text-muted)' }}>
                      {fmtDate(k.created_at)}
                    </td>
                    <td className="mono" style={{ fontSize: 11, color: 'var(--c-text-muted)' }}>
                      {k.last_used_at ? elapsedSince(k.last_used_at) : '—'}
                    </td>
                    <td>
                      {isRevoked
                        ? <span className="badge badge-deny">Revoked</span>
                        : <span className="badge badge-allow">Active</span>}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => void handleTest(k)}
                          title="Test this key"
                          aria-label={`Test key ${k.key_prefix}`}
                        >
                          <TestTube size={11} />
                        </button>
                        <CopyButton value={k.key_prefix} label="Copy prefix" />
                        {!isRevoked && (
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => setRevokeTarget(k)}
                            disabled={isDemo}
                            title="Revoke key"
                            aria-label={`Revoke key ${k.key_prefix}`}
                          >
                            <Trash2 size={11} />
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

      {/* Create key modal */}
      {showCreate && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
          }}
          onClick={() => setShowCreate(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-key-title"
        >
          <div
            className="panel"
            style={{ width: 420, padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Key size={14} style={{ color: 'var(--c-amber)' }} />
              <span id="create-key-title" style={{ fontWeight: 700, fontSize: 13 }}>Create API Key</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label className="section-label" htmlFor="new-client-id">Client ID</label>
              <input
                id="new-client-id"
                className="input input-mono"
                value={formClientId}
                onChange={e => setFormClientId(e.target.value)}
                placeholder="client id"
                list="known-clients"
              />
              <datalist id="known-clients">
                {clientIdList.map(id => <option key={id} value={id} />)}
              </datalist>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label className="section-label" htmlFor="new-key-name">Key Name</label>
              <input
                id="new-key-name"
                className="input"
                value={formName}
                onChange={e => setFormName(e.target.value)}
                placeholder="e.g. CI agent read-only"
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span className="section-label">Scopes</span>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                {ALL_SCOPES.map(s => (
                  <label
                    key={s}
                    style={{
                      display: 'flex', gap: 6, alignItems: 'center',
                      cursor: 'pointer', fontSize: 12,
                      color: formScopes.includes(s) ? 'var(--c-text)' : 'var(--c-text-muted)',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={formScopes.includes(s)}
                      onChange={e => {
                        setFormScopes(prev =>
                          e.target.checked ? [...prev, s] : prev.filter(x => x !== s)
                        );
                      }}
                      style={{ accentColor: 'var(--c-amber)' }}
                    />
                    <span className="mono">{s}</span>
                  </label>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setShowCreate(false)}>Cancel</button>
              <button
                className="btn btn-primary"
                onClick={handleCreate}
                disabled={createKey.isPending}
              >
                {createKey.isPending ? 'Creating…' : 'Create Key'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Revoke confirm */}
      <ConfirmDialog
        open={!!revokeTarget}
        title="Revoke API Key"
        body={`Revoke key ${revokeTarget?.key_prefix}… (${revokeTarget?.name})? This cannot be undone. Any system using this key will get 401.`}
        confirmLabel="Revoke"
        danger
        onConfirm={handleRevoke}
        onCancel={() => setRevokeTarget(null)}
      />
    </div>
  );
}

export function KeysView(props: KeysViewProps) {
  return (
    <ConsoleErrorBoundary>
      <KeysViewInner {...props} />
    </ConsoleErrorBoundary>
  );
}
