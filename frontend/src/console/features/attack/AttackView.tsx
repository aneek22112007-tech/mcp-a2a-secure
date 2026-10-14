import { useState, useCallback } from 'react';
import { Zap, Play, CheckCircle, AlertTriangle, Clock, Info } from 'lucide-react';
import { consoleApi, getApiKey } from '../../api/client';
import { ConsoleErrorBoundary } from '../../components/ui';

interface AttackViewProps { isDemo: boolean }

type StepStatus = 'idle' | 'running' | 'done' | 'error';

interface AttackStep {
  id: string;
  label: string;
  description: string;
  run: () => Promise<AttackResult>;
}

interface AttackResult {
  status: number;
  body: unknown;
  headers: Record<string, string>;
  ok: boolean;
  pipelineStage: string;
  pipelineColor: string;
}

function ResultPanel({ result }: { result: AttackResult }) {
  const body = result.body as Record<string, unknown> | null;
  const errorBlock = body?.error as Record<string, unknown> | undefined;

  return (
    <div
      style={{
        marginTop: 8,
        background: 'var(--c-bg)',
        border: `1px solid ${result.ok ? 'var(--c-allow)' : 'var(--c-deny)'}`,
        borderRadius: 'var(--radius)',
        overflow: 'hidden',
      }}
      aria-live="polite"
      role="status"
    >
      {/* Status line */}
      <div
        style={{
          padding: '8px 12px',
          background: result.ok ? 'var(--c-allow-dim)' : 'var(--c-deny-dim)',
          display: 'flex',
          gap: 10,
          alignItems: 'center',
          borderBottom: '1px solid var(--c-border)',
          flexWrap: 'wrap',
        }}
      >
        <span
          className="mono"
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: result.ok ? 'var(--c-allow)' : 'var(--c-deny)',
          }}
        >
          HTTP {result.status}
        </span>
        <span
          className="badge"
          style={{
            background: result.pipelineColor + '22',
            borderColor: result.pipelineColor,
            color: result.pipelineColor,
            fontSize: 10,
          }}
        >
          Stopped at: {result.pipelineStage}
        </span>
        {result.headers['retry-after'] && (
          <span style={{ fontSize: 11, color: 'var(--c-review)' }}>
            <Clock size={10} style={{ verticalAlign: 'middle', marginRight: 3 }} />
            Retry-After: {result.headers['retry-after']}s
          </span>
        )}
        {result.headers['x-request-id'] && (
          <span className="mono" style={{ fontSize: 10, color: 'var(--c-text-dim)', marginLeft: 'auto' }}>
            {result.headers['x-request-id']}
          </span>
        )}
      </div>

      {/* Error code + message */}
      {errorBlock && (
        <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--c-border)' }}>
          {Boolean(errorBlock.code) && (
            <span className="mono" style={{ fontSize: 11, color: 'var(--c-deny)', marginRight: 8 }}>
              {String(errorBlock.code)}
            </span>
          )}
          {Boolean(errorBlock.message) && (
            <span style={{ fontSize: 12, color: 'var(--c-text-muted)' }}>
              {String(errorBlock.message)}
            </span>
          )}
        </div>
      )}

      {/* Raw body */}
      <pre
        className="mono"
        style={{
          padding: '8px 12px',
          fontSize: 10,
          color: 'var(--c-text-dim)',
          margin: 0,
          overflowX: 'auto',
          maxHeight: 120,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
        }}
      >
        {JSON.stringify(result.body, null, 2)}
      </pre>
    </div>
  );
}

function buildSteps(): AttackStep[] {
  return [
    {
      id: 'bad-key',
      label: 'Bad key → 401',
      description: 'Sends a completely invalid bearer token to /api/metrics.',
      run: async () => {
        const r = await consoleApi.rawRequest('/api/metrics', 'GET', 'mcpg_bad_key_totally_invalid_xyz');
        return {
          ...r,
          pipelineStage: 'Bearer Auth',
          pipelineColor: 'var(--c-deny)',
        };
      },
    },
    {
      id: 'wrong-scope',
      label: 'Valid key, wrong scope → 403',
      description: 'Uses the connected admin key but calls /api/audit/stream with an injected scope check. Actually calls /api/notes — if tools are not approved this also returns 403.',
      run: async () => {
        const r = await consoleApi.rawRequest('/api/notes', 'GET');
        return {
          ...r,
          pipelineStage: 'Scope / Pin Gate',
          pipelineColor: 'var(--c-deny)',
        };
      },
    },
    {
      id: 'revoked-key',
      label: 'Revoked key → 401',
      description: 'Sends a well-formed but revoked mcpg_ key prefix pattern (not a real key).',
      run: async () => {
        const r = await consoleApi.rawRequest('/api/metrics', 'GET', 'mcpg_revoked00_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
        return {
          ...r,
          pipelineStage: 'Bearer Auth',
          pipelineColor: 'var(--c-deny)',
        };
      },
    },
    {
      id: 'rate-limit',
      label: 'Rate-limit burst → 429',
      description: 'Fires 15 rapid sequential requests to exhaust the token bucket. Retry-After is shown from the response.',
      run: async () => {
        let last = await consoleApi.rawRequest('/api/metrics', 'GET');
        for (let i = 0; i < 15 && last.ok; i++) {
          last = await consoleApi.rawRequest('/api/metrics', 'GET');
        }
        if (last.ok) {
          return {
            status: 200,
            body: { note: 'Bucket not yet exhausted — server capacity is higher than 15 requests' },
            headers: last.headers,
            ok: true,
            pipelineStage: 'Rate Limiter (not triggered)',
            pipelineColor: 'var(--c-allow)',
          };
        }
        return {
          ...last,
          pipelineStage: 'Rate Limiter',
          pipelineColor: 'var(--c-review)',
        };
      },
    },
    {
      id: 'pin-blocked',
      label: 'Revoked-pin tool call → 403',
      description: 'Sends a JSON-RPC tools/call request to /mcp/ for write_note (currently revoked). Requires TOOL_PINNING_MODE=enforce.',
      run: async () => {
        const key = getApiKey() ?? '';
        const r = await consoleApi.rawRequest('/mcp/', 'POST', key, {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: { name: 'write_note', arguments: { name: 'attack-test', content: 'pwned' } },
        });
        return {
          ...r,
          pipelineStage: 'Tool Pin Gate (enforce)',
          pipelineColor: 'var(--c-deny)',
        };
      },
    },
    {
      id: 'path-traversal',
      label: 'Path traversal note name',
      description: 'Sends "../secret" as a note name — backend should reject it.',
      run: async () => {
        const r = await consoleApi.rawRequest('/api/notes/%2E%2E%2Fsecret', 'GET');
        return {
          ...r,
          pipelineStage: r.ok ? 'Handler (not blocked — check backend)' : 'Input Validation / Handler',
          pipelineColor: r.ok ? 'var(--c-review)' : 'var(--c-allow)',
        };
      },
    },
  ];
}

function AttackViewInner({ isDemo }: AttackViewProps) {
  const [results, setResults] = useState<Record<string, AttackResult>>({});
  const [statuses, setStatuses] = useState<Record<string, StepStatus>>({});
  const [runningAll, setRunningAll] = useState(false);

  const steps = buildSteps();

  const runStep = useCallback(async (step: AttackStep) => {
    if (isDemo) return;
    setStatuses(s => ({ ...s, [step.id]: 'running' }));
    try {
      const result = await step.run();
      setResults(r => ({ ...r, [step.id]: result }));
      setStatuses(s => ({ ...s, [step.id]: 'done' }));
    } catch (err: unknown) {
      setResults(r => ({
        ...r,
        [step.id]: {
          status: 0,
          body: { error: { message: (err as Error).message ?? 'Network error' } },
          headers: {},
          ok: false,
          pipelineStage: 'Network / CORS',
          pipelineColor: 'var(--c-deny)',
        },
      }));
      setStatuses(s => ({ ...s, [step.id]: 'error' }));
    }
  }, [isDemo]);

  const runAll = useCallback(async () => {
    setRunningAll(true);
    for (const step of steps) {
      await runStep(step);
      await new Promise(r => setTimeout(r, 500));
    }
    setRunningAll(false);
  }, [runStep, steps]);

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--c-text)', margin: 0 }}>
            Attack Simulator
          </h1>
          <p style={{ fontSize: 11, color: 'var(--c-text-muted)', margin: '2px 0 0' }}>
            Real requests — every result lands in Live Audit within a second.
          </p>
        </div>
        <button
          className="btn btn-primary btn-sm"
          onClick={runAll}
          disabled={isDemo || runningAll}
          aria-label="Run all attacks sequentially"
        >
          <Play size={12} />
          {runningAll ? 'Running…' : 'Run all'}
        </button>
      </div>

      {/* Pipeline strip */}
      <div className="panel" style={{ padding: '12px 16px' }}>
        <div className="section-label" style={{ marginBottom: 10 }}>MCP Request Pipeline</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 0, flexWrap: 'wrap' }}>
          {[
            { label: 'Bearer Auth',     color: 'var(--c-info)' },
            { label: 'Scope Check',     color: 'var(--c-info)' },
            { label: 'Rate Limiter',    color: 'var(--c-review)' },
            { label: 'Pin Gate',        color: 'var(--c-amber)' },
            { label: 'Scanner Gate',    color: 'var(--c-amber)' },
            { label: 'Audit',           color: 'var(--c-allow)' },
            { label: 'Sandbox',         color: 'var(--c-allow)' },
          ].map((stage, i, arr) => (
            <div key={stage.label} style={{ display: 'flex', alignItems: 'center' }}>
              <div
                style={{
                  padding: '4px 10px',
                  background: stage.color + '18',
                  border: `1px solid ${stage.color}`,
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 10,
                  fontWeight: 600,
                  color: stage.color,
                  whiteSpace: 'nowrap',
                }}
              >
                {stage.label}
              </div>
              {i < arr.length - 1 && (
                <div style={{ width: 16, height: 1, background: 'var(--c-border)', flexShrink: 0 }} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Enforce mode note */}
      <div
        className="panel"
        style={{ padding: '10px 14px', display: 'flex', gap: 8, alignItems: 'center' }}
      >
        <Info size={13} style={{ color: 'var(--c-amber)', flexShrink: 0 }} />
        <span style={{ fontSize: 11, color: 'var(--c-text-muted)', lineHeight: 1.5 }}>
          Pin-gate attacks only trigger a{' '}
          <span className="badge badge-deny" style={{ fontSize: 9 }}>403</span>
          {' '}when the server runs with{' '}
          <span className="mono">TOOL_PINNING_MODE=enforce</span>.
          {' '}In <span className="mono">warn</span> mode the tool call is audited but passes through.
        </span>
      </div>

      {/* Attack steps */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {steps.map(step => {
          const status = statuses[step.id] ?? 'idle';
          const result = results[step.id];
          return (
            <div key={step.id} className="panel" style={{ padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                    {status === 'done' && !result?.ok && (
                      <CheckCircle size={14} style={{ color: 'var(--c-allow)', flexShrink: 0 }} aria-label="Attack blocked (expected)" />
                    )}
                    {status === 'done' && result?.ok && (
                      <AlertTriangle size={14} style={{ color: 'var(--c-review)', flexShrink: 0 }} aria-label="Request succeeded (verify)" />
                    )}
                    {status === 'error' && (
                      <AlertTriangle size={14} style={{ color: 'var(--c-deny)', flexShrink: 0 }} aria-label="Network error" />
                    )}
                    <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--c-text)' }}>
                      {step.label}
                    </span>
                  </div>
                  <p style={{ fontSize: 11, color: 'var(--c-text-muted)', margin: 0, lineHeight: 1.5 }}>
                    {step.description}
                  </p>
                </div>
                <button
                  className={`btn btn-sm ${status === 'running' ? 'btn-ghost' : 'btn-ghost'}`}
                  onClick={() => void runStep(step)}
                  disabled={isDemo || status === 'running' || runningAll}
                  style={{
                    flexShrink: 0,
                    borderColor: 'var(--c-amber)',
                    color: 'var(--c-amber)',
                  }}
                  aria-label={`Run: ${step.label}`}
                >
                  {status === 'running' ? (
                    <><Zap size={12} style={{ animation: 'pulse-dot 1s ease infinite' }} /> Running…</>
                  ) : (
                    <><Play size={12} /> Run</>
                  )}
                </button>
              </div>

              {result && <ResultPanel result={result} />}
            </div>
          );
        })}
      </div>

      {/* Demo mode note */}
      {isDemo && (
        <div
          className="panel"
          style={{ padding: '12px 16px', borderColor: 'var(--c-review)', display: 'flex', gap: 8, alignItems: 'center' }}
        >
          <Info size={14} style={{ color: 'var(--c-review)' }} />
          <span style={{ fontSize: 12, color: 'var(--c-text-muted)' }}>
            Connect to a live backend to run attacks. Demo mode disables all buttons.
          </span>
        </div>
      )}
    </div>
  );
}

export function AttackView(props: AttackViewProps) {
  return (
    <ConsoleErrorBoundary>
      <AttackViewInner {...props} />
    </ConsoleErrorBoundary>
  );
}
