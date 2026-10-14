import { useState, useCallback } from 'react';
import { Play, Clock, Info } from 'lucide-react';
import { ConsoleErrorBoundary } from '../../components/ui';
import { PipelineStrip } from '../../components/Pipeline';
import { lightsMatched, pipelineLights, type StageLight } from '../../components/pipelineLogic';
import { errorOf, waitForCaption, type AttackResult } from './runners';
import {
  runBadKey,
  runPathTraversal,
  runPinBlock,
  runRateLimit,
  runWrongScope,
} from './runners';

interface AttackViewProps { isDemo: boolean }

type StepStatus = 'idle' | 'running' | 'done' | 'error';

interface AttackStep {
  id: string;
  label: string;
  description: string;
  run: () => Promise<AttackResult>;
}

const PIPELINE_IDLE = pipelineLights('', 0);

const STEPS: AttackStep[] = [
  {
    id: 'bad-key',
    label: 'Bad key',
    description: 'GET /api/metrics with a bearer token the server has never issued.',
    run: runBadKey,
  },
  {
    id: 'wrong-scope',
    label: 'Wrong scope',
    description: 'POST /api/keys with only notes scopes, GET /api/metrics with that key, then DELETE /api/keys/{id}.',
    run: runWrongScope,
  },
  {
    id: 'pin-blocked',
    label: 'Pin gate',
    description: 'Calls a revoked or drifted tool through /mcp/ and shows the audit reason.',
    run: runPinBlock,
  },
  {
    id: 'rate-limit',
    label: 'Rate limit',
    description: 'Sends 120 GET /api/metrics requests at once and counts the real 429 responses.',
    run: runRateLimit,
  },
  {
    id: 'path-traversal',
    label: 'Path traversal',
    description: 'Requests a note name that leaves the notes directory. The status and message are the server response.',
    run: runPathTraversal,
  },
];

function ResultPanel({ result }: { result: AttackResult }) {
  const err = errorOf(result.body);
  const allowed = result.status >= 200 && result.status < 300;
  return (
    <div className={`result-panel ${allowed ? 'result-allow' : 'result-deny'}`} aria-live="polite" role="status">
      <div className="result-status">
        <span className={`mono result-code ${allowed ? 'tone-allow' : 'tone-deny'}`}>HTTP {result.status}</span>
        <span className="badge result-stage" style={{ color: result.stageColor, borderColor: result.stageColor }}>
          {result.stage}
        </span>
        {result.pinReason && <span className="mono result-reason">{result.pinReason}</span>}
        {result.headers['retry-after'] && (
          <span className="result-retry">
            <Clock size={12} aria-hidden />
            Retry-After: {result.headers['retry-after']}s
          </span>
        )}
        {result.headers['x-request-id'] && (
          <span className="mono result-rid">{result.headers['x-request-id']}</span>
        )}
      </div>
      {result.summary && <p className="result-summary">{result.summary}</p>}
      {(err.code || err.message) && (
        <p className="result-error">
          {err.code && <span className="mono">{err.code}</span>}
          {err.message && <span>{err.message}</span>}
        </p>
      )}
      <pre className="mono result-body">{JSON.stringify(result.body, null, 2)}</pre>
    </div>
  );
}

function AttackViewInner({ isDemo }: AttackViewProps) {
  const [results, setResults] = useState<Record<string, AttackResult>>({});
  const [statuses, setStatuses] = useState<Record<string, StepStatus>>({});
  const [runningAll, setRunningAll] = useState(false);
  const [lights, setLights] = useState<StageLight[]>(PIPELINE_IDLE);

  const runStep = useCallback(async (step: AttackStep) => {
    if (isDemo) return;
    const remember = (result: AttackResult) => {
      const next = pipelineLights(result.stage, result.status);
      if (lightsMatched(next)) setLights(next);
    };
    setStatuses(current => ({ ...current, [step.id]: 'running' }));
    try {
      const result = await step.run();
      setResults(current => ({ ...current, [step.id]: result }));
      setStatuses(current => ({ ...current, [step.id]: 'done' }));
      remember(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Network error';
      const failed: AttackResult = {
        status: 0,
        body: { error: { message } },
        headers: {},
        ok: false,
        stage: 'HTTP error',
        stageColor: 'var(--c-deny)',
        summary: message,
      };
      setResults(current => ({ ...current, [step.id]: failed }));
      setStatuses(current => ({ ...current, [step.id]: 'error' }));
      remember(failed);
    }
  }, [isDemo]);

  const runAll = useCallback(async () => {
    setRunningAll(true);
    for (let index = 0; index < STEPS.length; index += 1) {
      await runStep(STEPS[index]);
      if (index < STEPS.length - 1) await waitForCaption();
    }
    setRunningAll(false);
  }, [runStep]);

  return (
    <div className="console-page">
      <header className="page-header">
        <div>
          <h1 className="page-title">Attack Simulator</h1>
          <p className="page-sub">Each label is the real HTTP status. A 200 is Allowed.</p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => void runAll()} disabled={isDemo || runningAll}>
          <Play size={12} aria-hidden />
          {runningAll ? 'Running…' : 'Run all'}
        </button>
      </header>

      <section className="panel panel-pad">
        <div className="section-label label-with-icon">Request pipeline</div>
        <PipelineStrip lights={lights} />
      </section>

      <p className="panel panel-note">
        <Info size={14} aria-hidden />
        <span>
          Pin blocks return 403 only when <span className="mono">TOOL_PINNING_MODE=enforce</span>.
          The reason (<span className="mono">pin_revoked</span>, <span className="mono">pin_drift</span>, <span className="mono">pin_scan_blocked</span>, <span className="mono">pin_missing</span>) is read from the error body when it is there, otherwise from the newest denied audit row.
        </span>
      </p>

      <div className="attack-list">
        {STEPS.map(step => {
          const status = statuses[step.id] ?? 'idle';
          const result = results[step.id];
          return (
            <section key={step.id} className="panel panel-pad">
              <div className="row-between">
                <div>
                  <h2 className="attack-label">{step.label}</h2>
                  <p className="page-sub">{step.description}</p>
                </div>
                <button
                  className="btn btn-sm btn-amber"
                  onClick={() => void runStep(step)}
                  disabled={isDemo || status === 'running' || runningAll}
                >
                  <Play size={12} aria-hidden />
                  {status === 'running' ? 'Running…' : 'Run'}
                </button>
              </div>
              {result && <ResultPanel result={result} />}
            </section>
          );
        })}
      </div>

      {isDemo && (
        <p className="panel panel-note">
          <Info size={14} aria-hidden />
          <span>Connect to a live backend to run these requests. Demo mode does not send them.</span>
        </p>
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
