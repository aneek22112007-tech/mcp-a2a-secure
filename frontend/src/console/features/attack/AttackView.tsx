import { useState, useCallback } from 'react';
import { Play, Clock, Info } from 'lucide-react';
import { ConsoleErrorBoundary, LoadingPanel, ErrorPanel } from '../../components/ui';
import { PipelineStrip } from '../../components/Pipeline';
import { lightsMatched, pipelineLights, type StageLight } from '../../components/pipelineLogic';
import { useUpstreams } from '../../api/hooks';
import { errorOf, waitForCaption, type AttackResult } from './runners';
import {
  runBadKey,
  runPathTraversal,
  runPinBlock,
  runRateLimit,
  runWrongScope,
  runLabInjection,
  runLabScannerGate,
  runLabOutputCap,
  runLabTimeout,
  runLabEscapeProbe,
} from './runners';

interface AttackViewProps { offline: boolean }

type StepStatus = 'idle' | 'running' | 'done' | 'error';

export interface AttackStep {
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

const LAB_ATTACKS: AttackStep[] = [
  {
    id: 'lab-injection',
    label: 'Output injection',
    description: 'Calls lab_fetch_tip with the override variation. Prompt injection is caught and blocked by rule G1.',
    run: runLabInjection,
  },
  {
    id: 'lab-scanner-gate',
    label: 'Scanner gate',
    description: 'Calls lab_add_numbers. Because high-severity injection is present in its schema, execution is denied by the scan gate.',
    run: runLabScannerGate,
  },
  {
    id: 'lab-output-cap',
    label: 'Output cap',
    description: 'Calls lab_flood with size: 2048 (2 MB). The run exceeds the 1 MB sandbox limit and is aborted.',
    run: runLabOutputCap,
  },
  {
    id: 'lab-timeout',
    label: 'Timeout',
    description: 'Calls lab_hang. The tool runs indefinitely until the sandbox execution deadline terminates it.',
    run: runLabTimeout,
  },
  {
    id: 'lab-probe-host',
    label: 'Host escape probe',
    description: 'Calls lab_probe_host with target: "network". Verifies container network isolation blocks external access.',
    run: runLabEscapeProbe,
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

function AttackViewInner({ offline }: AttackViewProps) {
  const [results, setResults] = useState<Record<string, AttackResult>>({});
  const [statuses, setStatuses] = useState<Record<string, StepStatus>>({});
  const [runningAll, setRunningAll] = useState(false);
  const [lights, setLights] = useState<StageLight[]>(PIPELINE_IDLE);

  const {
    data: upstreams,
    isLoading: upstreamsLoading,
    isError: upstreamsError,
    refetch: refetchUpstreams,
  } = useUpstreams(!offline);
  const labUpstream = upstreams?.find(u => u.id === 'lab');
  const isLabAvailable = Boolean(labUpstream?.available);

  const runStep = useCallback(async (step: AttackStep) => {
    if (offline) return;
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
  }, [offline]);

  const runAll = useCallback(async () => {
    setRunningAll(true);
    const stepsToRun = isLabAvailable ? [...STEPS, ...LAB_ATTACKS] : STEPS;
    for (let index = 0; index < stepsToRun.length; index += 1) {
      await runStep(stepsToRun[index]);
      if (index < stepsToRun.length - 1) await waitForCaption();
    }
    setRunningAll(false);
  }, [isLabAvailable, runStep]);

  return (
    <div className="console-page">
      <header className="page-header">
        <div>
          <h1 className="page-title">Attack Simulator</h1>
          <p className="page-sub">Each label is the real HTTP status. A 200 is Allowed.</p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => void runAll()} disabled={offline || runningAll}>
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
                  disabled={offline || status === 'running' || runningAll}
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

      <section className="lab-attacks-section" style={{ marginTop: 24 }}>
        <div className="section-label label-with-icon" style={{ marginBottom: 12 }}>
          Hostile lab upstream attacks
        </div>

        {upstreamsLoading && <LoadingPanel label="Checking upstream status…" />}

        {upstreamsError && (
          <ErrorPanel
            message="Failed to load upstream status."
            onRetry={() => void refetchUpstreams()}
          />
        )}

        {!upstreamsLoading && !upstreamsError && (
          isLabAvailable ? (
            <div className="attack-list">
              {LAB_ATTACKS.map(step => {
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
                        disabled={offline || status === 'running' || runningAll}
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
          ) : (
            <p className="panel panel-note">
              <Info size={14} aria-hidden />
              <span>Hostile lab upstream is off (UPSTREAM_LAB_ENABLED).</span>
            </p>
          )
        )}
      </section>

      {offline && (
        <p className="panel panel-note">
          <Info size={14} aria-hidden />
          <span>Connect to a live backend to run these requests. Attacks cannot run while offline.</span>
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
