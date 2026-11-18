import { useEffect, useState } from 'react';
import { Bot } from 'lucide-react';
import {
  useA2AAgentCard,
  useA2ACapabilities,
  useA2ATask,
  useRunA2ATask,
  useRunNotesAgent,
} from '../../api/hooks';
import {
  ConsoleApiError,
  type A2ATaskDetail,
  type A2ATaskResponse,
  type AgentToolCall,
  type NotesRunResponse,
} from '../../api/client';
import {
  ConsoleErrorBoundary,
  CopyButton,
  DetailRow,
  Drawer,
  EmptyState,
  ErrorPanel,
  LoadingPanel,
} from '../../components/ui';
import { CONSOLE_TZ_LABEL, fmtDatetime } from '../../utils/helpers';

const TASK_MAX = 8000;
const PREVIEW_CHARS = 160;
const SESSION_LIMIT = 20;

interface AgentsViewProps {
  offline: boolean;
}

interface SessionRun {
  task: string;
  response: A2ATaskResponse;
}

interface FullText {
  title: string;
  body: string;
}

function toApiError(err: unknown): ConsoleApiError {
  if (err instanceof ConsoleApiError) return err;
  const message = err instanceof Error ? err.message : 'The request failed.';
  return new ConsoleApiError({
    code: 'NETWORK',
    message,
    details: null,
    request_id: null,
    status: 0,
  });
}

function errorText(err: ConsoleApiError): string {
  if (err.code === 'TIMEOUT' || err.status === 0) return err.message;
  return `${err.message} (HTTP ${err.status})`;
}

function isModelOff(err: ConsoleApiError): boolean {
  return err.status === 503 && err.message === 'LLM is disabled.';
}

function a2aStatusClass(status: string): string {
  switch (status) {
    case 'completed':
      return 'badge-allow';
    case 'blocked':
    case 'failed':
      return 'badge-deny';
    case 'cancelled':
      return 'badge-muted';
    default:
      return 'badge-muted';
  }
}

function toolStatusClass(status: string): string {
  switch (status.toLowerCase()) {
    case 'ok':
    case 'success':
    case 'completed':
      return 'badge-allow';
    case 'error':
    case 'failed':
    case 'blocked':
    case 'denied':
      return 'badge-deny';
    default:
      return 'badge-muted';
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function cardString(card: Record<string, unknown> | undefined, key: string): string | null {
  const value = card?.[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function skillRows(card: Record<string, unknown> | undefined): { name: string; description: string | null; tags: string[] }[] {
  const skills = card?.skills;
  if (!Array.isArray(skills)) return [];
  const rows: { name: string; description: string | null; tags: string[] }[] = [];
  for (const skill of skills) {
    if (typeof skill === 'string' && skill) {
      rows.push({ name: skill, description: null, tags: [] });
      continue;
    }
    const rec = asRecord(skill);
    if (!rec) continue;
    const name = typeof rec.name === 'string' && rec.name
      ? rec.name
      : typeof rec.id === 'string' && rec.id
        ? rec.id
        : null;
    if (!name) continue;
    const description = typeof rec.description === 'string' ? rec.description : null;
    const tags = Array.isArray(rec.tags)
      ? rec.tags.filter((tag): tag is string => typeof tag === 'string' && tag.length > 0)
      : [];
    rows.push({ name, description, tags });
  }
  return rows;
}

function preview(text: string): string {
  if (text.length <= PREVIEW_CHARS) return text;
  return `${text.slice(0, PREVIEW_CHARS)}…`;
}

function Elapsed() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const id = window.setInterval(() => {
      setSeconds(Math.floor((Date.now() - started) / 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, []);
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  const label = minutes > 0 ? `${minutes}m ${rest}s` : `${rest}s`;
  return <span className="mono" role="status">Running for {label}</span>;
}

function ModelOffPanel({ requestId }: { requestId: string | null }) {
  return (
    <div className="panel" role="status" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span className="badge badge-review" style={{ alignSelf: 'flex-start' }}>LLM disabled</span>
      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>
        The model is turned off on this server (LLM_ENABLED=false). The notes agent needs it.
      </p>
      {requestId && (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span className="mono" style={{ fontSize: 11 }}>{requestId}</span>
          <CopyButton value={requestId} label="Copy request id" />
        </span>
      )}
    </div>
  );
}

function ProviderBadges({ provider, model }: { provider: string | null; model: string | null }) {
  if (!provider && !model) return <span style={{ color: 'var(--c-text-dim)' }}>—</span>;
  return (
    <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
      {provider && (
        <span className={`badge ${provider === 'groq' ? 'badge-review' : 'badge-allow'}`}>
          {provider === 'groq' ? 'Groq fallback' : provider}
        </span>
      )}
      {model && <span className="badge badge-muted">{model}</span>}
    </span>
  );
}

function ScopeChips({ scopes }: { scopes: string[] }) {
  if (scopes.length === 0) return <span style={{ color: 'var(--c-text-dim)' }}>—</span>;
  return (
    <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
      {scopes.map(scope => (
        <span key={scope} className="scope-chip mono">{scope}</span>
      ))}
    </span>
  );
}

function ToolCallsTable({
  calls,
  onOpen,
}: {
  calls: AgentToolCall[];
  onOpen: (text: FullText) => void;
}) {
  if (calls.length === 0) {
    return <EmptyState label="This run made no tool calls." icon={Bot} />;
  }
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="data-table">
        <thead>
          <tr>
            <th>Tool</th>
            <th>Status</th>
            <th>Arguments</th>
            <th>Output or error</th>
          </tr>
        </thead>
        <tbody>
          {calls.map((call, index) => {
            const args = JSON.stringify(call.arguments ?? {});
            const detail = call.error ?? call.output ?? '';
            const long = detail.length > PREVIEW_CHARS;
            return (
              <tr key={`${call.name}-${index}`}>
                <td className="mono">{call.name || '—'}</td>
                <td>
                  <span className={`badge ${toolStatusClass(call.status)}`}>{call.status || '—'}</span>
                </td>
                <td className="mono" style={{ fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {args}
                </td>
                <td style={{ fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {detail ? (
                    <span style={{ color: call.error ? 'var(--c-deny)' : 'inherit' }}>
                      {preview(detail)}
                      {long && (
                        <>
                          {' '}
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => onOpen({
                              title: call.error ? `${call.name} error` : `${call.name} output`,
                              body: detail,
                            })}
                          >
                            Full text
                          </button>
                        </>
                      )}
                    </span>
                  ) : (
                    <span style={{ color: 'var(--c-text-dim)' }}>—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function NotesResult({ result, onOpen }: { result: NotesRunResponse; onOpen: (text: FullText) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.5 }}>{result.result}</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <ProviderBadges provider={result.provider} model={result.model} />
        {result.request_id && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span className="mono" style={{ fontSize: 11 }}>{result.request_id}</span>
            <CopyButton value={result.request_id} label="Copy request id" />
          </span>
        )}
      </div>
      <ToolCallsTable calls={result.tool_calls} onOpen={onOpen} />
    </div>
  );
}

function A2AResult({ result, onOpen }: { result: A2ATaskResponse; onOpen: (text: FullText) => void }) {
  const modelOff = result.status === 'failed' && result.result === 'LLM is disabled.';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {modelOff && <ModelOffPanel requestId={result.manager_request_id} />}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <span className={`badge ${a2aStatusClass(result.status)}`}>{result.status}</span>
        <span className="mono" style={{ fontSize: 11 }}>{result.task_id}</span>
        <CopyButton value={result.task_id} label="Copy task id" />
      </div>
      <p style={{ margin: 0, fontSize: 12, color: 'var(--c-text-muted)', lineHeight: 1.5 }}>
        A2A audit rows use this task id as the request id. Paste it into the{' '}
        <a className="text-link" href="#/audit">Live Audit</a> search box.
      </p>
      <div style={{ fontSize: 12 }}>
        <span className="section-label">Keys </span>
        <span className="mono">{result.manager_key_prefix ?? '—'}</span>
        <span aria-hidden> → </span>
        <span className="mono">{result.worker_key_prefix ?? '—'}</span>
      </div>
      <div>
        <div className="section-label" style={{ marginBottom: 6 }}>Delegated scopes</div>
        <ScopeChips scopes={result.delegated_scopes} />
      </div>
      <ProviderBadges provider={result.provider} model={result.model} />
      <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.5 }}>{result.result}</div>
      {result.error && (
        <div style={{ whiteSpace: 'pre-wrap', fontSize: 12, color: 'var(--c-deny)' }}>{result.error}</div>
      )}
      <ToolCallsTable calls={result.tool_calls} onOpen={onOpen} />
    </div>
  );
}

function TaskDetail({ detail }: { detail: A2ATaskDetail }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <DetailRow label="Status">
        <span className={`badge ${a2aStatusClass(detail.status)}`}>{detail.status}</span>
      </DetailRow>
      <DetailRow label="Task">
        <span style={{ whiteSpace: 'pre-wrap' }}>{detail.task_input || '—'}</span>
      </DetailRow>
      <DetailRow label="Result">
        <span style={{ whiteSpace: 'pre-wrap' }}>{detail.result ?? '—'}</span>
      </DetailRow>
      <DetailRow label="Error">
        <span style={{ whiteSpace: 'pre-wrap', color: detail.error ? 'var(--c-deny)' : 'inherit' }}>
          {detail.error ?? '—'}
        </span>
      </DetailRow>
      <DetailRow label="Manager key">
        <span className="mono">{detail.manager_key_prefix ?? '—'}</span>
      </DetailRow>
      <DetailRow label="Worker key">
        <span className="mono">{detail.worker_key_prefix ?? '—'}</span>
      </DetailRow>
      <DetailRow label="Scopes">
        <ScopeChips scopes={detail.delegated_scopes} />
      </DetailRow>
      <DetailRow label={`Created (${CONSOLE_TZ_LABEL})`}>
        {fmtDatetime(detail.created_at)}
      </DetailRow>
      <DetailRow label={`Started (${CONSOLE_TZ_LABEL})`}>
        {fmtDatetime(detail.started_at)}
      </DetailRow>
      <DetailRow label={`Finished (${CONSOLE_TZ_LABEL})`}>
        {fmtDatetime(detail.finished_at)}
      </DetailRow>
      <DetailRow label="A2A task">
        {detail.a2a_task ? (
          <pre className="mono" style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 11 }}>
            {JSON.stringify(detail.a2a_task, null, 2)}
          </pre>
        ) : '—'}
      </DetailRow>
    </div>
  );
}

function AgentsViewInner({ offline }: AgentsViewProps) {
  const [notesTask, setNotesTask] = useState('');
  const [a2aTask, setA2aTask] = useState('');
  const [lookupId, setLookupId] = useState('');
  const [notesResult, setNotesResult] = useState<NotesRunResponse | null>(null);
  const [notesError, setNotesError] = useState<ConsoleApiError | null>(null);
  const [a2aResult, setA2aResult] = useState<A2ATaskResponse | null>(null);
  const [a2aError, setA2aError] = useState<ConsoleApiError | null>(null);
  const [runs, setRuns] = useState<SessionRun[]>([]);
  const [activeTaskId, setActiveTaskId] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [fullText, setFullText] = useState<FullText | null>(null);
  const [showRawCard, setShowRawCard] = useState(false);

  const notesRun = useRunNotesAgent();
  const a2aRun = useRunA2ATask();
  const capsQuery = useA2ACapabilities(!offline);
  const cardQuery = useA2AAgentCard(!offline);
  const taskQuery = useA2ATask(activeTaskId, drawerOpen);

  const openTask = (id: string) => {
    const next = id.trim();
    if (!next) return;
    setActiveTaskId(next);
    setDrawerOpen(true);
    if (next === activeTaskId.trim()) void taskQuery.refetch();
  };

  const submitNotes = () => {
    const task = notesTask.trim();
    if (!task || offline || notesRun.isPending) return;
    setNotesError(null);
    notesRun.mutate(task, {
      onSuccess: data => {
        setNotesResult(data);
        setNotesError(null);
      },
      onError: err => {
        setNotesResult(null);
        setNotesError(toApiError(err));
      },
    });
  };

  const submitA2A = () => {
    const task = a2aTask.trim();
    if (!task || offline || a2aRun.isPending) return;
    setA2aError(null);
    a2aRun.mutate(task, {
      onSuccess: data => {
        setA2aResult(data);
        setA2aError(null);
        setRuns(prev => [{ task, response: data }, ...prev].slice(0, SESSION_LIMIT));
      },
      onError: err => {
        setA2aResult(null);
        setA2aError(toApiError(err));
      },
    });
  };

  const caps = capsQuery.data;
  const card = cardQuery.data;
  const skills = skillRows(card);
  const taskMissing = taskQuery.isError
    && taskQuery.error instanceof ConsoleApiError
    && taskQuery.error.status === 404;

  return (
    <div className="console-page">
      <header className="page-header">
        <div>
          <h1 className="page-title">Agents</h1>
          <p className="page-sub">
            Run the notes agent and signed A2A delegation through the gateway with the key you are connected with. Every run is real and appears in Live Audit and LLM Calls.
          </p>
        </div>
      </header>

      <section className="panel" aria-label="Notes agent">
        <div className="panel-head">
          <h2 className="section-label" style={{ margin: 0 }}>Notes agent</h2>
        </div>
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label className="field" htmlFor="notes-task">
            <span className="section-label">Task</span>
            <textarea
              id="notes-task"
              className="input"
              rows={4}
              maxLength={TASK_MAX}
              value={notesTask}
              placeholder="Describe a notes task"
              onChange={event => setNotesTask(event.target.value)}
            />
          </label>
          <div className="row-between">
            <span className="mono" style={{ fontSize: 11, color: 'var(--c-text-muted)' }}>
              {notesTask.length} / {TASK_MAX}
            </span>
            <span style={{ display: 'inline-flex', gap: 10, alignItems: 'center' }}>
              {notesRun.isPending && <Elapsed />}
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={offline || notesRun.isPending || notesTask.trim().length === 0}
                onClick={submitNotes}
              >
                {notesRun.isPending ? 'Running…' : 'Run'}
              </button>
            </span>
          </div>
          {notesError && isModelOff(notesError) && (
            <ModelOffPanel requestId={notesError.requestId} />
          )}
          {notesError && !isModelOff(notesError) && (
            <ErrorPanel message={errorText(notesError)} />
          )}
          {notesResult && <NotesResult result={notesResult} onOpen={setFullText} />}
          {!notesResult && !notesError && !notesRun.isPending && (
            <EmptyState label="No run yet in this session." icon={Bot} />
          )}
        </div>
      </section>

      <section className="panel" aria-label="A2A delegation">
        <div className="panel-head">
          <h2 className="section-label" style={{ margin: 0 }}>A2A delegation</h2>
        </div>
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label className="field" htmlFor="a2a-task">
            <span className="section-label">Task</span>
            <textarea
              id="a2a-task"
              className="input"
              rows={4}
              maxLength={TASK_MAX}
              value={a2aTask}
              placeholder="Describe a notes task"
              onChange={event => setA2aTask(event.target.value)}
            />
          </label>
          <div className="row-between">
            <span className="mono" style={{ fontSize: 11, color: 'var(--c-text-muted)' }}>
              {a2aTask.length} / {TASK_MAX}
            </span>
            <span style={{ display: 'inline-flex', gap: 10, alignItems: 'center' }}>
              {a2aRun.isPending && <Elapsed />}
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={offline || a2aRun.isPending || a2aTask.trim().length === 0}
                onClick={submitA2A}
              >
                {a2aRun.isPending ? 'Running…' : 'Run'}
              </button>
            </span>
          </div>
          {a2aError && a2aError.status === 403 && (
            <div className="panel" role="status" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span className="badge badge-deny" style={{ alignSelf: 'flex-start' }}>Delegation denied</span>
              <p style={{ margin: 0, fontSize: 13 }}>{a2aError.message}</p>
            </div>
          )}
          {a2aError && a2aError.status === 503 && (
            <div className="panel" role="status" style={{ padding: 16 }}>
              <p style={{ margin: 0, fontSize: 13 }}>{a2aError.message}</p>
            </div>
          )}
          {a2aError && a2aError.status !== 403 && a2aError.status !== 503 && (
            <ErrorPanel message={errorText(a2aError)} />
          )}
          {a2aResult && <A2AResult result={a2aResult} onOpen={setFullText} />}
          {!a2aResult && !a2aError && !a2aRun.isPending && (
            <EmptyState label="No run yet in this session." icon={Bot} />
          )}
        </div>
      </section>

      <section className="panel" aria-label="Session runs">
        <div className="panel-head">
          <h2 className="section-label" style={{ margin: 0 }}>Session runs</h2>
        </div>
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {runs.length === 0 ? (
            <EmptyState label="No run yet in this session." icon={Bot} />
          ) : (
            runs.map(run => (
              <button
                key={run.response.task_id}
                type="button"
                className="btn btn-ghost"
                style={{ justifyContent: 'flex-start', gap: 10, textAlign: 'left' }}
                onClick={() => openTask(run.response.task_id)}
              >
                <span className={`badge ${a2aStatusClass(run.response.status)}`}>{run.response.status}</span>
                <span className="mono" style={{ fontSize: 11 }}>{run.response.task_id}</span>
                <span style={{ fontSize: 12, color: 'var(--c-text-muted)' }}>{preview(run.task)}</span>
              </button>
            ))
          )}
        </div>
      </section>

      <section className="panel" aria-label="Look up a task">
        <div className="panel-head">
          <h2 className="section-label" style={{ margin: 0 }}>Look up a task</h2>
        </div>
        <div style={{ padding: 16, display: 'flex', gap: 8, alignItems: 'center' }}>
          <label className="field" htmlFor="task-lookup" style={{ flex: 1 }}>
            <span className="sr-only">Task id</span>
            <input
              id="task-lookup"
              className="input input-mono"
              value={lookupId}
              placeholder="Task id"
              onChange={event => setLookupId(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter') openTask(lookupId);
              }}
            />
          </label>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={offline || lookupId.trim().length === 0}
            onClick={() => openTask(lookupId)}
          >
            Look up
          </button>
        </div>
      </section>

      <section className="panel" aria-label="Worker">
        <div className="panel-head">
          <h2 className="section-label" style={{ margin: 0 }}>Worker</h2>
        </div>
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {offline && !caps && !card && (
            <EmptyState label="The worker card loads when the backend is reachable." icon={Bot} />
          )}
          {!offline && capsQuery.isLoading && !caps && <LoadingPanel label="Loading worker capabilities…" />}
          {capsQuery.isError && (
            <ErrorPanel
              message={errorText(toApiError(capsQuery.error))}
              onRetry={() => void capsQuery.refetch()}
            />
          )}
          {caps && (
            <>
              <DetailRow label="Agent">
                <span className="mono">{caps.agent_name}</span>
              </DetailRow>
              <DetailRow label="A2A SDK">
                <span className="mono">{caps.a2a_sdk}</span>
              </DetailRow>
              <DetailRow label="Max hops">
                <span className="mono">{caps.max_hops}</span>
              </DetailRow>
              <DetailRow label="Allowed tools">
                {caps.allowed_tools.length === 0
                  ? <span style={{ color: 'var(--c-text-dim)' }}>—</span>
                  : (
                    <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
                      {caps.allowed_tools.map(tool => (
                        <span key={tool} className="scope-chip mono">{tool}</span>
                      ))}
                    </span>
                  )}
              </DetailRow>
              <DetailRow label="Max task">
                <span className="mono">{caps.max_task_chars}</span>
              </DetailRow>
              <DetailRow label="Delegation">
                {caps.delegation_signing
                  ? <span className="badge badge-allow">Signed delegation: {caps.delegation_signing_algorithm}</span>
                  : <span className="badge badge-muted">Delegation signing is off</span>}
              </DetailRow>
            </>
          )}
          {!offline && cardQuery.isLoading && !card && <LoadingPanel label="Loading agent card…" />}
          {cardQuery.isError && (
            <ErrorPanel
              message={errorText(toApiError(cardQuery.error))}
              onRetry={() => void cardQuery.refetch()}
            />
          )}
          {card && (
            <>
              <DetailRow label="Card name">
                {cardString(card, 'name') ?? '—'}
              </DetailRow>
              <DetailRow label="Description">
                <span style={{ whiteSpace: 'pre-wrap' }}>{cardString(card, 'description') ?? '—'}</span>
              </DetailRow>
              <DetailRow label="Version">
                <span className="mono">{cardString(card, 'version') ?? '—'}</span>
              </DetailRow>
              <DetailRow label="Skills">
                {skills.length === 0 ? (
                  <span style={{ color: 'var(--c-text-dim)' }}>—</span>
                ) : (
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {skills.map(skill => (
                      <span key={skill.name}>
                        <span style={{ fontWeight: 600 }}>{skill.name}</span>
                        {skill.description && (
                          <span style={{ display: 'block', color: 'var(--c-text-muted)' }}>{skill.description}</span>
                        )}
                        {skill.tags.length > 0 && (
                          <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                            {skill.tags.map(tag => (
                              <span key={tag} className="scope-chip mono">{tag}</span>
                            ))}
                          </span>
                        )}
                      </span>
                    ))}
                  </span>
                )}
              </DetailRow>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ alignSelf: 'flex-start' }}
                aria-pressed={showRawCard}
                onClick={() => setShowRawCard(open => !open)}
              >
                {showRawCard ? 'Hide raw agent card' : 'Show raw agent card'}
              </button>
              {showRawCard && (
                <pre className="mono" style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 11, overflow: 'auto' }}>
                  {JSON.stringify(card, null, 2)}
                </pre>
              )}
            </>
          )}
        </div>
      </section>

      <Drawer
        open={drawerOpen}
        title="A2A task"
        onClose={() => setDrawerOpen(false)}
      >
        {taskQuery.isLoading && <LoadingPanel label="Loading task…" />}
        {taskMissing && (
          <p role="status" style={{ margin: 0, fontSize: 13 }}>
            No task with this id was started by the connected key.
          </p>
        )}
        {taskQuery.isError && !taskMissing && (
          <ErrorPanel
            message={errorText(toApiError(taskQuery.error))}
            onRetry={() => void taskQuery.refetch()}
          />
        )}
        {taskQuery.data && <TaskDetail detail={taskQuery.data} />}
      </Drawer>

      <Drawer
        open={fullText !== null}
        title={fullText?.title ?? 'Full text'}
        onClose={() => setFullText(null)}
      >
        <pre className="mono" style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 12 }}>
          {fullText?.body ?? ''}
        </pre>
      </Drawer>
    </div>
  );
}

export function AgentsView(props: AgentsViewProps) {
  return (
    <ConsoleErrorBoundary>
      <AgentsViewInner {...props} />
    </ConsoleErrorBoundary>
  );
}
