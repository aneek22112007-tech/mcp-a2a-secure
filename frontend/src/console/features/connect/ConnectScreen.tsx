import { useState, useCallback } from 'react';
import { Shield, Eye, EyeOff, Loader2, AlertTriangle, CheckCircle, Wifi } from 'lucide-react';
import { consoleApi, setApiKey, getKeyPrefix } from '../../api/client';
import { ConsoleApiError } from '../../api/client';
import { ALL_SCOPES } from '../../utils/helpers';

interface ConnectProps {
  onConnected: (clientId: string, scopes: string[]) => void;
}

type ConnectState = 'idle' | 'checking' | 'success' | 'error';

export function ConnectScreen({ onConnected }: ConnectProps) {
  const [baseUrl, setBaseUrl] = useState(
    import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'
  );
  const [key, setKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [pinningMode, setPinningMode] = useState<'off' | 'warn' | 'enforce'>('enforce');
  const [state, setState] = useState<ConnectState>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [detectedScopes, setDetectedScopes] = useState<string[]>([]);
  const [detectedPrefix, setDetectedPrefix] = useState('');

  const handleConnect = useCallback(async () => {
    if (!key.trim()) {
      setErrorMsg('Paste an API key to connect.');
      setState('error');
      return;
    }

    setState('checking');
    setErrorMsg('');

    try {
      // 1. Check /health (no auth) — if this fails, server is down
      await consoleApi.health();
    } catch {
      setState('error');
      setErrorMsg('Backend unreachable. Check the base URL and that uvicorn is running.');
      return;
    }

    try {
      // 2. Try to read metrics (requires metrics:read or admin)
      // We use this to validate the key and detect client ID
      setApiKey(key.trim());
      const metrics = await consoleApi.metrics();
      // If we get here, key is valid
      // Detect scopes by what succeeded — admin key has all
      const scopes = ['admin', ...ALL_SCOPES];
      setDetectedScopes(scopes);
      setDetectedPrefix(getKeyPrefix() ?? key.slice(0, 8));

      // Try to get client_id from the busiest key or just mark success
      void metrics; // we don't need the data here
      setState('success');
      // Give a moment for the success flash
      setTimeout(() => {
        onConnected('', scopes);
      }, 800);
    } catch (err) {
      if (err instanceof ConsoleApiError) {
        if (err.status === 401) {
          setState('error');
          setErrorMsg('Invalid or revoked key. Check the key and try again.');
          return;
        }
        if (err.status === 403) {
          // Key is valid but no metrics scope — try audit:read
          try {
            const audit = await consoleApi.listAudit({ limit: 1 });
            void audit;
            const scopes = ['audit:read'];
            setDetectedScopes(scopes);
            setDetectedPrefix(getKeyPrefix() ?? key.slice(0, 8));
            setState('success');
            setTimeout(() => onConnected('', scopes), 800);
            return;
          } catch {
            // try the bare health path only
          }
          // Very restricted key — accept it with no scopes but warn
          setDetectedScopes([]);
          setDetectedPrefix(getKeyPrefix() ?? key.slice(0, 8));
          setState('success');
          setTimeout(() => onConnected('', []), 800);
          return;
        }
        setState('error');
        setErrorMsg(`${err.code}: ${err.message}`);
      } else {
        setState('error');
        setErrorMsg('Unexpected error. Check the console for details.');
      }
    }
  }, [key, onConnected]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') handleConnect();
    },
    [handleConnect]
  );

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--c-bg)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        fontFamily: 'var(--font-sans)',
      }}
    >
      <div style={{ width: 440, display: 'flex', flexDirection: 'column', gap: 0 }}>

        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <div
              style={{
                width: 32,
                height: 32,
                background: 'var(--c-amber)',
                borderRadius: 'var(--radius-sm)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Shield size={18} color="#0B0C0D" />
            </div>
            <span
              style={{
                fontWeight: 700,
                fontSize: 18,
                letterSpacing: '-0.02em',
                color: 'var(--c-text)',
              }}
            >
              MCP Guard
            </span>
            <span
              className="badge badge-review"
              style={{ marginLeft: 4, fontSize: 9 }}
            >
              Live Console
            </span>
          </div>
          <p style={{ fontSize: 12, color: 'var(--c-text-muted)', lineHeight: 1.6 }}>
            Connect your admin key to the live security gateway. The key is held in memory
            only and never sent anywhere except the backend.
          </p>
        </div>

        {/* Form card */}
        <div className="panel" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>

          {/* Base URL */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label
              htmlFor="base-url"
              className="section-label"
              style={{ display: 'block' }}
            >
              Backend URL
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <Wifi size={14} style={{ color: 'var(--c-text-muted)', marginTop: 8, flexShrink: 0 }} />
              <input
                id="base-url"
                className="input input-mono"
                value={baseUrl}
                onChange={e => setBaseUrl(e.target.value)}
                placeholder="http://localhost:8000"
                aria-label="Backend base URL"
              />
            </div>
          </div>

          {/* API Key */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label
              htmlFor="api-key"
              className="section-label"
              style={{ display: 'block' }}
            >
              API Key
            </label>
            <div style={{ position: 'relative' }}>
              <input
                id="api-key"
                className="input input-mono"
                type={showKey ? 'text' : 'password'}
                value={key}
                onChange={e => setKey(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="mcpg_xxxxxxxx_…"
                autoComplete="off"
                spellCheck={false}
                aria-label="API key"
                style={{ paddingRight: 40 }}
              />
              <button
                type="button"
                onClick={() => setShowKey(v => !v)}
                style={{
                  position: 'absolute',
                  right: 10,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--c-text-muted)',
                  padding: 0,
                  display: 'flex',
                }}
                aria-label={showKey ? 'Hide key' : 'Show key'}
              >
                {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <p style={{ fontSize: 11, color: 'var(--c-text-dim)' }}>
              Obtain from: <span className="mono">python scripts/create_admin_key.py</span>
            </p>
          </div>

          {/* Pinning mode hint */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label htmlFor="pin-mode" className="section-label">
              Tool Pinning Mode (server .env)
            </label>
            <select
              id="pin-mode"
              className="input"
              value={pinningMode}
              onChange={e => setPinningMode(e.target.value as typeof pinningMode)}
              style={{ cursor: 'pointer' }}
            >
              <option value="off">off — no checks</option>
              <option value="warn">warn — audit only</option>
              <option value="enforce">enforce — blocks on violations</option>
            </select>
            <p style={{ fontSize: 11, color: 'var(--c-text-dim)' }}>
              This is a display hint only. Set in <span className="mono">api/.env</span>.
            </p>
          </div>

          {/* Error / success state */}
          {state === 'error' && (
            <div
              style={{
                display: 'flex',
                gap: 8,
                alignItems: 'flex-start',
                padding: '10px 12px',
                background: 'var(--c-deny-dim)',
                borderRadius: 'var(--radius)',
                border: '1px solid var(--c-deny)',
              }}
              role="alert"
            >
              <AlertTriangle size={14} style={{ color: 'var(--c-deny)', flexShrink: 0, marginTop: 1 }} />
              <span style={{ fontSize: 12, color: 'var(--c-deny)', lineHeight: 1.5 }}>{errorMsg}</span>
            </div>
          )}

          {state === 'success' && (
            <div
              style={{
                display: 'flex',
                gap: 8,
                alignItems: 'center',
                padding: '10px 12px',
                background: 'var(--c-allow-dim)',
                borderRadius: 'var(--radius)',
                border: '1px solid var(--c-allow)',
              }}
              role="status"
            >
              <CheckCircle size={14} style={{ color: 'var(--c-allow)' }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 12, color: 'var(--c-allow)', fontWeight: 600 }}>
                  Connected — key prefix: <span className="mono">{detectedPrefix}</span>
                </span>
                <span style={{ fontSize: 11, color: 'var(--c-text-muted)' }}>
                  {detectedScopes.length > 0
                    ? `Scopes: ${detectedScopes.slice(0, 4).join(', ')}${detectedScopes.length > 4 ? '…' : ''}`
                    : 'Limited scopes — some views may show "needs scope X"'}
                </span>
              </div>
            </div>
          )}

          {/* Connect button */}
          <button
            className="btn btn-primary"
            onClick={handleConnect}
            disabled={state === 'checking' || state === 'success'}
            style={{ width: '100%', justifyContent: 'center', padding: '10px 16px', fontSize: 13 }}
          >
            {state === 'checking' ? (
              <>
                <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                Checking…
              </>
            ) : state === 'success' ? (
              <>
                <CheckCircle size={14} />
                Opening console…
              </>
            ) : (
              <>
                <Shield size={14} />
                Connect
              </>
            )}
          </button>
        </div>

        {/* Offline mode note */}
        <p style={{ marginTop: 12, fontSize: 11, color: 'var(--c-text-dim)', textAlign: 'center' }}>
          If the backend is offline, the console shows static demo data labelled{' '}
          <span className="mono">DEMO DATA</span>.
        </p>
      </div>
    </div>
  );
}
