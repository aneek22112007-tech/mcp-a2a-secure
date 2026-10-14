import { useState, useCallback } from 'react';
import { Shield, Eye, EyeOff, Loader2, AlertTriangle, CheckCircle, Wifi } from 'lucide-react';
import { consoleApi, detectAccess, forgetApiKey, getApiBase, setApiBase, setApiKey, getKeyPrefix } from '../../api/client';
import { ConsoleApiError } from '../../api/client';

interface ConnectProps {
  onConnected: (clientId: string, scopes: string[]) => void;
  onUseDemo?: () => void;
}

type ConnectState = 'idle' | 'checking' | 'success' | 'error';

export function ConnectScreen({ onConnected, onUseDemo }: ConnectProps) {
  const [baseUrl, setBaseUrl] = useState(getApiBase());
  const [key, setKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [pinningMode, setPinningMode] = useState<'off' | 'warn' | 'enforce'>('enforce');
  const [state, setState] = useState<ConnectState>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [detectedScopes, setDetectedScopes] = useState<string[]>([]);
  const [detectedPrefix, setDetectedPrefix] = useState('');

  const handleBaseChange = (value: string) => {
    setBaseUrl(value);
    setApiBase(value);
  };

  const handleConnect = useCallback(async () => {
    const keyToUse = key.trim();
    if (!keyToUse) {
      setErrorMsg('Paste an API key to connect.');
      setState('error');
      return;
    }
    setApiBase(baseUrl);
    setState('checking');
    setErrorMsg('');

    try {
      await consoleApi.health();
    } catch {
      setState('error');
      setErrorMsg('Backend unreachable. Check the base URL and that uvicorn is running.');
      return;
    }

    setApiKey(keyToUse);
    try {
      const detected = await detectAccess();
      setDetectedScopes(detected.scopes);
      setDetectedPrefix(getKeyPrefix() ?? keyToUse.slice(0, 8));
      setState('success');
      window.setTimeout(() => onConnected(detected.clientId, detected.scopes), 400);
    } catch (err) {
      forgetApiKey();
      if (err instanceof ConsoleApiError && err.status === 401) {
        setState('error');
        setErrorMsg('Invalid or revoked key. Check the key and try again.');
        return;
      }
      setState('error');
      setErrorMsg(err instanceof Error ? err.message : 'Unexpected error.');
    }
  }, [baseUrl, key, onConnected]);

  return (
    <div className="connect-screen">
      <div className="connect-card">
        <div className="connect-brand">
          <span className="connect-mark" aria-hidden><Shield size={18} color="#0B0C0D" /></span>
          <span className="connect-name">MCP Guard</span>
          <span className="badge badge-review">Live Console</span>
        </div>
        <p className="page-sub">
          Type an API key to connect. It stays in this browser tab (sessionStorage) and is sent only to the backend URL below.
        </p>

        <div className="panel panel-pad connect-form">
          <label className="field" htmlFor="base-url">
            <span className="section-label">Backend URL</span>
            <span className="field-row">
              <Wifi size={14} aria-hidden />
              <input
                id="base-url"
                className="input input-mono"
                value={baseUrl}
                onChange={event => handleBaseChange(event.target.value)}
                placeholder="http://127.0.0.1:8000"
                aria-label="Backend base URL"
              />
            </span>
          </label>

          <label className="field" htmlFor="api-key">
            <span className="section-label">API Key</span>
            <span className="field-row">
              <input
                id="api-key"
                className="input input-mono"
                type={showKey ? 'text' : 'password'}
                value={key}
                onChange={event => setKey(event.target.value)}
                onKeyDown={event => { if (event.key === 'Enter') void handleConnect(); }}
                placeholder="mcpg_…"
                autoComplete="off"
                spellCheck={false}
                aria-label="API key"
              />
              <button type="button" className="icon-btn" onClick={() => setShowKey(value => !value)} aria-label={showKey ? 'Hide key' : 'Show key'}>
                {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </span>
            <span className="page-sub">Create one with <span className="mono">python scripts/create_admin_key.py</span></span>
          </label>

          <label className="field" htmlFor="pin-mode">
            <span className="section-label">Tool pinning mode (server .env)</span>
            <select
              id="pin-mode"
              className="input"
              value={pinningMode}
              onChange={event => setPinningMode(event.target.value as typeof pinningMode)}
            >
              <option value="off">off — no checks</option>
              <option value="warn">warn — audit only</option>
              <option value="enforce">enforce — blocks on violations</option>
            </select>
            <span className="page-sub">Display hint only. Set <span className="mono">TOOL_PINNING_MODE</span> in <span className="mono">api/.env</span>.</span>
          </label>

          {state === 'error' && (
            <div className="banner banner-deny" role="alert">
              <AlertTriangle size={14} aria-hidden />
              <span>{errorMsg}</span>
            </div>
          )}
          {state === 'success' && (
            <div className="banner banner-allow" role="status">
              <CheckCircle size={14} aria-hidden />
              <span>
                Connected. Key prefix <span className="mono">{detectedPrefix}</span>.
                {detectedScopes.length > 0
                  ? ` Scopes: ${detectedScopes.join(', ')}.`
                  : ' No console scopes were detected, so only Overview, Attack, and Planned are available.'}
              </span>
            </div>
          )}

          <button className="btn btn-primary connect-submit" onClick={() => void handleConnect()} disabled={state === 'checking' || state === 'success'}>
            {state === 'checking' ? <><Loader2 size={14} className="spin" aria-hidden /> Checking…</> : <><Shield size={14} aria-hidden /> Connect</>}
          </button>

          {onUseDemo && (
            <button type="button" className="btn btn-ghost" onClick={onUseDemo}>
              View with demo data
            </button>
          )}
        </div>

        <p className="connect-foot">Backend URL <span className="mono">{getApiBase()}</span></p>
      </div>
    </div>
  );
}
