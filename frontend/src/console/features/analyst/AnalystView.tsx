import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { ArrowUp, ListTree, RotateCcw, ShieldCheck, X } from 'lucide-react';
import {
  useAnalystStatus,
  useAskAnalyst,
  useAuditStream,
  useExplainIncident,
  useIncident,
  useIncidents,
} from '../../api/hooks';
import {
  ConsoleApiError,
  type AnalystChatAnswer,
  type AnalystChatTurn,
  type AnalystReportBody,
  type Incident,
  type IncidentDetail,
} from '../../api/client';
import { ErrorPanel, MonoValue, Spinner } from '../../components/ui';
import {
  elapsedSince,
  fmtDatetime,
  fmtDuration,
  severityBadgeClass,
} from '../../utils/helpers';

const KINDS = ['injection', 'pin', 'scanner', 'rate_limit', 'scope', 'auth', 'a2a', 'other'] as const;
const SEVERITIES = ['high', 'medium', 'low'] as const;
const OVERVIEW = 'overview';
const MAX_TURNS = 12;
const MAX_CHARS = 1000;

interface AnalystViewProps {
  offline: boolean;
  scopes: string[];
}

interface RunMeta {
  provider: string;
  model: string;
  fell_back: boolean;
  withheld_fields: number;
  created_at: string;
  latency_ms: number;
  cached?: boolean;
}

type Message =
  | { id: string; role: 'user'; text: string; at: string }
  | { id: string; role: 'answer'; answer: AnalystChatAnswer }
  | { id: string; role: 'report'; report: AnalystReportBody; meta: RunMeta; saved: boolean }
  | { id: string; role: 'error'; text: string; retry: string | null };

/* Threads live for the browser tab, so leaving the view and coming back keeps them.
   Nothing is stored on the server. */
const threadStore = new Map<string, Message[]>();
let nextId = 0;
const newId = () => `m${Date.now().toString(36)}${(nextId++).toString(36)}`;

function isPrefix(value: string): boolean {
  return /^[0-9a-f]{8}$/i.test(value);
}

function failureText(err: unknown): string {
  if (!(err instanceof ConsoleApiError)) {
    return err instanceof Error ? err.message : 'The request failed.';
  }
  const details = err.details;
  const reason = details && typeof details === 'object' && 'reason' in details
    ? String((details as { reason?: unknown }).reason ?? '')
    : '';
  if (err.code === 'ANALYST_OUTPUT_REJECTED' || err.status === 502) {
    const why = reason === 'unknown_ref'
      ? 'it cited an event that is not in this data'
      : reason === 'unsafe_output'
        ? 'it contained a key, a link or text that matched a guard rule'
        : reason === 'not_json' || reason === 'invalid_shape'
          ? 'it was not in the expected format'
          : `check ${reason || err.code} failed`;
    return `The model replied, but the reply was not shown because ${why}. Asking again usually works.`;
  }
  if (err.code === 'ANALYST_BUSY') return 'The analyst is answering another request. Try again in a few seconds.';
  if (err.status === 429 || err.code === 'RATE_LIMITED') {
    return 'Rate limit reached for analyst requests on this key. Wait a minute and try again.';
  }
  if (err.code === 'ANALYST_UNAVAILABLE') {
    return reason === 'disabled'
      ? 'The analyst is turned off on this server (LLM_ENABLED is false).'
      : 'No model answered. Ollama is not reachable and the Groq fallback did not reply.';
  }
  return err.message;
}

function unavailableText(status: {
  enabled: boolean;
  ollama_reachable: boolean;
  ollama_model_present: boolean;
  groq_configured: boolean;
} | undefined): string | null {
  if (!status) return null;
  if (!status.enabled) return 'The analyst is turned off on this server (LLM_ENABLED is false), so questions cannot be answered.';
  if (!status.ollama_reachable && !status.groq_configured) {
    return 'No model is available. Ollama is not reachable at the configured URL and Groq is not configured.';
  }
  if (!status.ollama_model_present && !status.groq_configured) {
    return 'No model is available. The configured Ollama model is not pulled and Groq is not configured.';
  }
  return null;
}

function modelLabel(status: { ollama_reachable: boolean; ollama_model: string; ollama_model_present: boolean; groq_configured: boolean } | undefined): string | null {
  if (!status) return null;
  if (status.ollama_reachable && status.ollama_model_present) return `${status.ollama_model} on Ollama`;
  if (status.groq_configured) return 'Groq';
  return null;
}

/** What the model sees of earlier turns: plain text, refs written in brackets. */
function toTurns(messages: Message[]): AnalystChatTurn[] {
  const turns: AnalystChatTurn[] = [];
  for (const m of messages) {
    if (m.role === 'user') turns.push({ role: 'user', content: m.text });
    if (m.role === 'answer') {
      const text = m.answer.answer.map(p => p.text).join('\n\n');
      turns.push({ role: 'assistant', content: text.slice(0, MAX_CHARS) });
    }
    if (m.role === 'report') {
      turns.push({ role: 'assistant', content: m.report.summary.slice(0, MAX_CHARS) });
    }
  }
  return turns.slice(-MAX_TURNS);
}

export function AnalystView({ offline, scopes }: AnalystViewProps) {
  const canAsk = scopes.includes('analyst:run');
  const [kind, setKind] = useState('');
  const [severity, setSeverity] = useState('');
  const [scope, setScope] = useState<string>(OVERVIEW);
  const [threads, setThreads] = useState<Record<string, Message[]>>(() => Object.fromEntries(threadStore));
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<{ scope: string; since: number; label: string } | null>(null);
  const [eventsOpen, setEventsOpen] = useState(false);
  const [hit, setHit] = useState<string | null>(null);
  const [seenId, setSeenId] = useState<string | null>(null);
  const [fresh, setFresh] = useState(false);

  const list = useIncidents({ kind: kind || undefined, severity: severity || undefined }, !offline);
  const all = useIncidents({}, !offline);
  const incidentId = scope === OVERVIEW ? null : scope;
  const detail = useIncident(incidentId, !offline);
  const status = useAnalystStatus(!offline && canAsk);
  const ask = useAskAnalyst();
  const explain = useExplainIncident();
  const stream = useAuditStream(40, !offline);

  const newest = stream.events[0];
  if (newest && newest.id !== seenId) {
    const previous = seenId;
    setSeenId(newest.id);
    if (previous !== null && (newest.decision === 'denied' || newest.action === 'tool.output.injection')) {
      setFresh(true);
    }
  }

  const allItems = all.data?.items;
  const everything = useMemo(() => allItems ?? [], [allItems]);
  const incidents = list.data?.items ?? [];
  const windowHours = all.data?.window_hours ?? list.data?.window_hours ?? 24;
  const byId = useMemo(() => new Map(everything.map(i => [i.id, i])), [everything]);
  const current = incidentId ? (detail.data ?? null) : null;
  const down = unavailableText(status.data);
  const model = modelLabel(status.data);
  const thread = threads[scope] ?? [];
  const draft = drafts[scope] ?? '';
  const busyHere = pending?.scope === scope;
  const overviewEvents = everything.reduce((n, i) => n + i.event_count, 0);

  const write = (key: string, update: (prev: Message[]) => Message[]) => {
    setThreads(prev => {
      const next = update(prev[key] ?? []);
      threadStore.set(key, next);
      return { ...prev, [key]: next };
    });
  };

  const pick = (next: string) => {
    setScope(next);
    setEventsOpen(false);
    setHit(null);
  };

  const sendQuestion = (question: string) => {
    const text = question.trim();
    if (!text || pending || offline || !canAsk || down) return;
    const key = scope;
    const history = toTurns(thread);
    const userMsg: Message = { id: newId(), role: 'user', text, at: new Date().toISOString() };
    write(key, prev => [...prev.filter(m => m.role !== 'error'), userMsg]);
    setDrafts(prev => ({ ...prev, [key]: '' }));
    const eventCount = key === OVERVIEW ? overviewEvents : (current?.event_count ?? 0);
    const label = key === OVERVIEW
      ? `Reading ${everything.length} ${everything.length === 1 ? 'incident' : 'incidents'}`
      : `Reading ${eventCount} ${eventCount === 1 ? 'event' : 'events'}`;
    setPending({ scope: key, since: Date.now(), label });
    ask.mutate(
      {
        ...(key === OVERVIEW ? {} : { incident_id: key }),
        messages: [...history, { role: 'user' as const, content: text }].slice(-MAX_TURNS),
      },
      {
        onSuccess: (answer) => write(key, prev => [...prev, { id: newId(), role: 'answer', answer }]),
        onError: (err) => write(key, prev => [...prev, { id: newId(), role: 'error', text: failureText(err), retry: text }]),
        onSettled: () => setPending(null),
      },
    );
  };

  const requestExplanation = (refresh: boolean) => {
    if (!incidentId || pending || offline || !canAsk || down) return;
    const key = incidentId;
    write(key, prev => [
      ...prev.filter(m => m.role !== 'error'),
      { id: newId(), role: 'user', text: refresh ? 'Write the full explanation again.' : 'Write the full explanation.', at: new Date().toISOString() },
    ]);
    setPending({ scope: key, since: Date.now(), label: `Writing the explanation from ${current?.event_count ?? 0} events` });
    explain.mutate(
      { incident_id: key, refresh },
      {
        onSuccess: (data) => write(key, prev => [
          ...prev,
          { id: newId(), role: 'report', report: data.report, meta: data, saved: data.cached },
        ]),
        onError: (err) => write(key, prev => [...prev, { id: newId(), role: 'error', text: failureText(err), retry: null }]),
        onSettled: () => setPending(null),
      },
    );
  };

  const openRef = (ref: string, refs: Record<string, string>) => {
    if (ref.startsWith('I')) {
      const target = refs[ref];
      if (target) {
        setKind('');
        setSeverity('');
        pick(target);
      }
      return;
    }
    setHit(ref);
    setEventsOpen(true);
    window.setTimeout(() => {
      document.getElementById(`achat-evt-${ref}`)?.scrollIntoView({ block: 'nearest' });
    }, 0);
  };

  const stored = current?.report ?? null;
  const storedStale = current?.latest_report?.stale ?? false;
  const disabledReason = offline
    ? 'The console is offline.'
    : !canAsk
      ? 'This key does not have the analyst:run scope, so it cannot ask questions.'
      : down;
  const noData = scope === OVERVIEW && all.data && everything.length === 0;

  return (
    <div className="console-page achat-page">
      <header className="achat-head">
        <div>
          <h1 className="page-title">AI Analyst</h1>
          <p className="page-sub">
            Ask about incidents grouped from real audit events in the last {windowHours} hours. Answers cite those events.
          </p>
        </div>
        <ModelStatus loading={status.isLoading} enabled={canAsk && !offline} down={down} model={model} />
      </header>

      <div className="achat">
        <aside className="achat-rail" aria-label="Chat scope">
          <button
            type="button"
            className="achat-scope"
            aria-current={scope === OVERVIEW ? 'true' : undefined}
            onClick={() => pick(OVERVIEW)}
          >
            <span className="achat-scope-name">All incidents</span>
            <span className="achat-scope-meta">
              {all.data
                ? `Last ${windowHours} h · ${everything.length} ${everything.length === 1 ? 'incident' : 'incidents'} · ${overviewEvents.toLocaleString()} events`
                : 'Loading…'}
            </span>
            {(threads[OVERVIEW]?.length ?? 0) > 0 && <ThreadCount n={threads[OVERVIEW].length} />}
          </button>

          <div className="achat-rail-head">
            <span className="achat-rail-title">
              Incidents {list.data && <span className="rail-count">{incidents.length}</span>}
            </span>
            {fresh && (
              <button
                type="button"
                className="achat-fresh"
                onClick={() => {
                  setFresh(false);
                  void list.refetch();
                  void all.refetch();
                  if (incidentId) void detail.refetch();
                }}
              >
                New events, refresh
              </button>
            )}
          </div>
          <div className="achat-filters">
            <div className="achat-seg" role="group" aria-label="Severity">
              {['', ...SEVERITIES].map(s => (
                <button key={s || 'all'} type="button" aria-pressed={severity === s} onClick={() => setSeverity(s)}>
                  {s || 'All'}
                </button>
              ))}
            </div>
            <select className="achat-select" aria-label="Kind" value={kind} onChange={e => setKind(e.target.value)}>
              <option value="">Any kind</option>
              {KINDS.map(k => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>

          <div className="achat-list">
            {list.isLoading && <p className="achat-note">Loading incidents…</p>}
            {list.isError && (
              <ErrorPanel
                message={list.error instanceof Error ? list.error.message : 'Could not load incidents.'}
                onRetry={() => { void list.refetch(); }}
              />
            )}
            {list.data && incidents.length === 0 && (
              <p className="achat-note">
                {kind || severity
                  ? 'No incidents match these filters.'
                  : `No security incidents in the last ${list.data.window_hours} hours.`}
              </p>
            )}
            {incidents.map(item => (
              <IncidentRow
                key={item.id}
                item={item}
                active={item.id === scope}
                messages={threads[item.id]?.length ?? 0}
                onPick={() => pick(item.id)}
              />
            ))}
          </div>
        </aside>

        <section className="achat-main" aria-label="Analyst chat">
          <div className="achat-bar">
            <select
              className="achat-select achat-picker"
              aria-label="Chat scope"
              value={scope}
              onChange={e => pick(e.target.value)}
            >
              <option value={OVERVIEW}>All incidents, last {windowHours} hours</option>
              {everything.map(i => (
                <option key={i.id} value={i.id}>{`${i.severity} · ${i.kind} · ${i.group_key}`}</option>
              ))}
            </select>
            <div className={`achat-bar-main${scope === OVERVIEW ? ' is-overview' : ''}`}>
              {scope === OVERVIEW ? (
                <>
                  <p className="achat-bar-kicker">Scope</p>
                  <h2 className="achat-bar-title">All incidents in the last {windowHours} hours</h2>
                </>
              ) : current ? (
                <>
                  <p className="achat-bar-kicker">
                    <span className={`badge ${severityBadgeClass(current.severity)}`}>{current.severity}</span>
                    <span className="achat-kind">{current.kind}</span>
                    <span aria-hidden>·</span>
                    <span>{current.event_count} events</span>
                    <span aria-hidden className="achat-when-part">·</span>
                    <span className="achat-when-part">
                    <time dateTime={current.first_seen} title={fmtDatetime(current.first_seen)}>{elapsedSince(current.first_seen)}</time>
                    {' – '}
                    <time dateTime={current.last_seen} title={fmtDatetime(current.last_seen)}>{elapsedSince(current.last_seen)}</time>
                    </span>
                  </p>
                  <h2 className="achat-bar-title" title={current.brief}>{current.brief}</h2>
                </>
              ) : detail.isError ? (
                <h2 className="achat-bar-title">This incident is no longer in the window.</h2>
              ) : (
                <h2 className="achat-bar-title achat-muted">Loading incident…</h2>
              )}
            </div>
            <div className="achat-bar-actions">
              {current && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  aria-pressed={eventsOpen}
                  onClick={() => setEventsOpen(o => !o)}
                >
                  <ListTree size={14} /> Events <span className="tab-count">{current.event_count}</span>
                </button>
              )}
              {thread.length > 0 && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={busyHere}
                  onClick={() => write(scope, () => [])}
                  title="Start this thread again"
                >
                  <RotateCcw size={14} /> Clear
                </button>
              )}
            </div>
          </div>

          <div className="achat-body">
            <Thread
              key={scope}
              messages={thread}
              pending={busyHere ? pending : null}
              model={model}
              byId={byId}
              onRef={openRef}
              onRetry={sendQuestion}
              intro={
                scope === OVERVIEW ? (
                  <OverviewIntro
                    loading={all.isLoading}
                    count={everything.length}
                    events={overviewEvents}
                    hours={windowHours}
                    high={everything.filter(i => i.severity === 'high').length}
                    started={thread.length > 0}
                    disabled={!!disabledReason || !!pending}
                    onAsk={sendQuestion}
                  />
                ) : current ? (
                  <IncidentIntro
                    incident={current}
                    stored={stored}
                    stale={storedStale}
                    started={thread.length > 0}
                    disabled={!!disabledReason || !!pending}
                    onAsk={sendQuestion}
                    onExplain={requestExplanation}
                    onRef={(ref) => openRef(ref, {})}
                    onOpen={(id) => { setKind(''); setSeverity(''); pick(id); }}
                  />
                ) : null
              }
            />
            {eventsOpen && current && (
              <EventsPanel incident={current} hit={hit} onClose={() => setEventsOpen(false)} />
            )}
          </div>

          <Composer
            value={draft}
            placeholder={scope === OVERVIEW ? `Ask about the last ${windowHours} hours of incidents` : 'Ask about this incident'}
            disabledReason={noData ? `There are no incidents in the last ${windowHours} hours, so there is nothing to ask about yet.` : disabledReason}
            busy={!!pending}
            scopeNote={scope === OVERVIEW
              ? 'Answers use the incident list only. Allowed traffic that was never denied is not included.'
              : 'Answers use only the events of this incident. A reply that cites a missing event is rejected.'}
            onChange={(v) => setDrafts(prev => ({ ...prev, [scope]: v }))}
            onSend={() => sendQuestion(draft)}
          />
        </section>
      </div>
    </div>
  );
}

function ModelStatus({ loading, enabled, down, model }: { loading: boolean; enabled: boolean; down: string | null; model: string | null }) {
  if (!enabled) return null;
  let text = 'Checking model…';
  let cls = 'is-wait';
  if (!loading) {
    if (down) { text = 'Model unavailable'; cls = 'is-down'; }
    else if (model) { text = model; cls = 'is-ok'; }
    else { text = 'Model status unknown'; cls = 'is-wait'; }
  }
  return (
    <span className={`achat-model ${cls}`} title={down ?? undefined}>
      <span className="achat-model-dot" aria-hidden />
      {text}
    </span>
  );
}

function ThreadCount({ n }: { n: number }) {
  return <span className="achat-thread-count">{n} {n === 1 ? 'message' : 'messages'}</span>;
}

function IncidentRow({ item, active, messages, onPick }: { item: Incident; active: boolean; messages: number; onPick: () => void }) {
  return (
    <button type="button" className="achat-row" aria-current={active ? 'true' : undefined} onClick={onPick}>
      <span className="achat-row-top">
        <span className={`achat-sev achat-sev-${item.severity}`} aria-label={`${item.severity} severity`} />
        <span className="achat-kind">{item.kind}</span>
        {isPrefix(item.group_key)
          ? <MonoValue value={item.group_key} />
          : <span className="achat-group">{item.group_key}</span>}
        <time className="achat-when" dateTime={item.last_seen} title={fmtDatetime(item.last_seen)}>{elapsedSince(item.last_seen)}</time>
      </span>
      {item.brief && <span className="achat-brief">{item.brief}</span>}
      <span className="achat-row-meta">
        <span>{item.event_count} events</span>
        {item.latest_report && <span>{item.latest_report.stale ? 'explanation out of date' : 'explained'}</span>}
        {messages > 0 && <ThreadCount n={messages} />}
      </span>
    </button>
  );
}

function OverviewIntro({ loading, count, events, hours, high, started, disabled, onAsk }: {
  loading: boolean; count: number; events: number; hours: number; high: number; started: boolean; disabled: boolean; onAsk: (q: string) => void;
}) {
  if (loading) return <p className="achat-note">Loading incidents…</p>;
  if (count === 0) {
    return (
      <div className="achat-intro">
        <p className="achat-intro-title">Nothing to ask about yet</p>
        <p className="achat-intro-text">
          No requests were denied or flagged in the last {hours} hours, so there are no incidents.
          When the gateway refuses a request, it shows up here.
        </p>
      </div>
    );
  }
  return (
    <div className="achat-intro">
      <p className="achat-intro-title">Ask about the last {hours} hours</p>
      <p className="achat-intro-text">
        {count} {count === 1 ? 'incident' : 'incidents'} built from {events.toLocaleString()} audit events
        {high > 0 ? `, ${high} high severity` : ''}. Pick an incident to ask about its events one by one.
      </p>
      {!started && <Starters
        disabled={disabled}
        onAsk={onAsk}
        items={[
          'Which incidents should I look at first, and why?',
          'Is one API key behind more than one incident?',
          'Summarise what was refused and by which check.',
        ]}
      />}
    </div>
  );
}

function IncidentIntro({ incident, stored, stale, started, disabled, onAsk, onExplain, onRef, onOpen }: {
  incident: IncidentDetail;
  stored: (AnalystReportBody & RunMeta) | null;
  stale: boolean;
  started: boolean;
  disabled: boolean;
  onAsk: (q: string) => void;
  onExplain: (refresh: boolean) => void;
  onRef: (ref: string) => void;
  onOpen: (id: string) => void;
}) {
  return (
    <div className="achat-intro">
      <Facts incident={incident} onOpen={onOpen} />
      {stored ? (
        <>
          <ReportMessage
            report={stored}
            meta={stored}
            saved
            eventCount={incident.event_count}
            onRef={onRef}
          />
          {stale && (
            <p className="achat-note">
              New events joined this incident after this explanation was written.{' '}
              <button type="button" className="achat-link" disabled={disabled} onClick={() => onExplain(true)}>Write it again</button>
            </p>
          )}
        </>
      ) : null}
      {!started && <Starters
        disabled={disabled}
        onAsk={onAsk}
        lead={stored ? null : { label: 'Write the full explanation', run: () => onExplain(false) }}
        items={[
          'What happened, in order?',
          'Which key or tool should I check?',
          'What should I change in MCP Guard after this?',
        ]}
      />}
    </div>
  );
}

function Starters({ items, disabled, onAsk, lead }: {
  items: string[];
  disabled: boolean;
  onAsk: (q: string) => void;
  lead?: { label: string; run: () => void } | null;
}) {
  return (
    <div className="achat-starters">
      <p className="achat-starters-label">Start with</p>
      {lead && (
        <button type="button" className="achat-starter is-lead" disabled={disabled} onClick={lead.run}>
          {lead.label}
          <span className="achat-starter-note">uses the same checks as Explain</span>
        </button>
      )}
      {items.map(q => (
        <button key={q} type="button" className="achat-starter" disabled={disabled} onClick={() => onAsk(q)}>{q}</button>
      ))}
    </div>
  );
}

function Thread({ messages, pending, model, byId, onRef, onRetry, intro }: {
  messages: Message[];
  pending: { since: number; label: string } | null;
  model: string | null;
  byId: Map<string, Incident>;
  onRef: (ref: string, refs: Record<string, string>) => void;
  onRetry: (q: string) => void;
  intro: ReactNode;
}) {
  const end = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [messages.length, pending]);

  return (
    <div className="achat-thread" aria-live="polite">
      <div className="achat-thread-inner">
        {intro}
        {messages.map(m => {
          if (m.role === 'user') {
            return (
              <div key={m.id} className="achat-msg achat-user">
                <p>{m.text}</p>
              </div>
            );
          }
          if (m.role === 'error') {
            return (
              <div key={m.id} className="achat-msg achat-error" role="alert">
                <p>{m.text}</p>
                {m.retry && (
                  <button type="button" className="achat-link" onClick={() => onRetry(m.retry as string)}>Ask again</button>
                )}
              </div>
            );
          }
          if (m.role === 'report') {
            return (
              <ReportMessage
                key={m.id}
                report={m.report}
                meta={m.meta}
                saved={m.saved}
                onRef={(ref) => onRef(ref, {})}
              />
            );
          }
          return <AnswerMessage key={m.id} answer={m.answer} byId={byId} onRef={onRef} />;
        })}
        {pending && <Pending since={pending.since} label={pending.label} model={model} />}
        <div ref={end} />
      </div>
    </div>
  );
}

function Who({ meta }: { meta: string | null }) {
  return (
    <div className="achat-who">
      <span className="achat-avatar" aria-hidden><ShieldCheck size={13} /></span>
      <span className="achat-who-name">Analyst</span>
      {meta && <span className="achat-who-meta">{meta}</span>}
    </div>
  );
}

function runMeta(meta: RunMeta): string {
  const parts = [meta.model, fmtDuration(meta.latency_ms)];
  if (meta.fell_back) parts.push('Groq fallback');
  return parts.join(' · ');
}

function RefChip({ label, title, onClick }: { label: string; title?: string; onClick: () => void }) {
  return (
    <button type="button" className="achat-ref" title={title} onClick={onClick}>{label}</button>
  );
}

const REF = '[EI]\\d{1,4}';
const REF_SPLIT = new RegExp(`\\[(${REF}(?:\\s*(?:,|-|–|to)\\s*${REF})*)\\]|\\b(${REF})\\b`, 'g');
const RANGE = new RegExp(`^(${REF})\\s*(?:-|–|to)\\s*(${REF})$`);

/** "E1, E3 - E12" becomes ["E1", "E3–E12"]. A range opens its first ref. */
function splitRefs(group: string): string[] {
  const out: string[] = [];
  for (const piece of group.split(/\s*,\s*/)) {
    const range = piece.match(RANGE);
    if (range) out.push(`${range[1]}–${range[2]}`);
    else out.push(...piece.split(/\s*(?:-|–|to)\s*/));
  }
  return out;
}

/** Text with its [E1] markers turned into chips. Every ref was checked by the server. */
function CitedText({ text, render }: { text: string; render: (refs: string[], key: string) => ReactNode }) {
  const out: ReactNode[] = [];
  let last = 0;
  let n = 0;
  for (const match of text.matchAll(REF_SPLIT)) {
    const at = match.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    const refs = match[1] ? splitRefs(match[1]) : [match[2]];
    out.push(render(refs, `r${n++}`));
    last = at + match[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return <>{out}</>;
}

function RefGroup({ refs, chip }: { refs: string[]; chip: (ref: string) => ReactNode }) {
  const [open, setOpen] = useState(false);
  const shown = open || refs.length <= 4 ? refs : refs.slice(0, 3);
  return (
    <span className="achat-refs">
      {shown.map(chip)}
      {shown.length < refs.length && (
        <button type="button" className="achat-ref is-more" onClick={() => setOpen(true)}>
          +{refs.length - shown.length}
        </button>
      )}
    </span>
  );
}

function AnswerMessage({ answer, byId, onRef }: {
  answer: AnalystChatAnswer;
  byId: Map<string, Incident>;
  onRef: (ref: string, refs: Record<string, string>) => void;
}) {
  const cited = new Set(answer.answer.flatMap(p => p.refs));
  const chip = (label: string) => {
    const ref = label.split('–')[0];
    const target = answer.refs[ref];
    const inc = ref.startsWith('I') && target ? byId.get(target) : undefined;
    return (
      <RefChip
        key={label}
        label={inc ? `${label} ${inc.kind}` : label}
        title={inc ? inc.brief : target ? `Event ${target}` : undefined}
        onClick={() => onRef(ref, answer.refs)}
      />
    );
  };
  return (
    <article className="achat-msg achat-bot">
      <Who meta={runMeta(answer)} />
      <div className="achat-bot-body">
        {answer.answer.map((part, i) => (
          <p key={i}>
            <CitedText text={part.text} render={(refs, key) => <RefGroup key={key} refs={refs} chip={chip} />} />
          </p>
        ))}
      </div>
      <p className="achat-foot">
        Confidence {answer.confidence}
        {' · '}
        {cited.size === 0 ? 'no references cited' : `${cited.size} ${cited.size === 1 ? 'reference' : 'references'} checked against the data`}
        {answer.withheld_fields > 0 && ` · ${answer.withheld_fields} ${answer.withheld_fields === 1 ? 'field' : 'fields'} withheld because they looked like instructions`}
      </p>
    </article>
  );
}

function ReportMessage({ report, meta, saved, eventCount, onRef }: {
  report: AnalystReportBody;
  meta: RunMeta;
  saved: boolean;
  eventCount?: number;
  onRef: (ref: string) => void;
}) {
  const who = saved
    ? `Saved explanation · ${fmtDatetime(meta.created_at)} IST · ${meta.model}`
    : runMeta(meta);
  return (
    <article className="achat-msg achat-bot">
      <Who meta={who} />
      <div className="achat-bot-body">
        <p>{report.summary}</p>
        {report.timeline.length > 0 && (
          <>
            <p className="achat-sub">What happened</p>
            <ol className="achat-steps">
              {report.timeline.map((item, i) => (
                <li key={`${i}-${item.text}`}>
                  {item.text}
                  <span className="achat-refs">
                    {item.refs.map(ref => <RefChip key={ref} label={ref} onClick={() => onRef(ref)} />)}
                  </span>
                </li>
              ))}
            </ol>
          </>
        )}
        <p><span className="achat-sub-inline">Likely cause.</span> {report.likely_cause || 'Unknown.'}</p>
        <p><span className="achat-sub-inline">Impact.</span> {report.impact || 'Unknown.'}</p>
        {report.next_steps.length > 0 && (
          <>
            <p className="achat-sub">Next steps</p>
            <ul className="achat-steps">
              {report.next_steps.map(step => <li key={step}>{step}</li>)}
            </ul>
          </>
        )}
      </div>
      <p className="achat-foot">
        Confidence {report.confidence}
        {eventCount != null && ` · checked against ${eventCount} events`}
        {meta.withheld_fields > 0 && ` · ${meta.withheld_fields} ${meta.withheld_fields === 1 ? 'field' : 'fields'} withheld because they looked like instructions`}
      </p>
    </article>
  );
}

function Pending({ since, label, model }: { since: number; label: string; model: string | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  const secs = Math.max(0, Math.floor((now - since) / 1000));
  return (
    <div className="achat-msg achat-bot achat-pending" role="status">
      <Who meta={null} />
      <p className="achat-pending-line">
        <span className="achat-typing" aria-hidden><i /><i /><i /></span>
        {label}{model ? ` with ${model}` : ''} · {secs}s
      </p>
    </div>
  );
}

function Composer({ value, placeholder, disabledReason, busy, scopeNote, onChange, onSend }: {
  value: string;
  placeholder: string;
  disabledReason: string | null;
  busy: boolean;
  scopeNote: string;
  onChange: (v: string) => void;
  onSend: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [value]);

  if (disabledReason) {
    return (
      <div className="achat-composer is-off">
        <p className="achat-off">{disabledReason}</p>
      </div>
    );
  }
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      onSend();
    }
  };
  const left = MAX_CHARS - value.length;
  return (
    <div className="achat-composer">
      <div className="achat-box">
        <textarea
          ref={ref}
          rows={1}
          value={value}
          maxLength={MAX_CHARS}
          placeholder={placeholder}
          aria-label="Question"
          onChange={e => onChange(e.target.value)}
          onKeyDown={onKey}
        />
        <button
          type="button"
          className="achat-send"
          aria-label="Send"
          disabled={busy || !value.trim()}
          onClick={onSend}
        >
          {busy ? <Spinner size={14} /> : <ArrowUp size={16} />}
        </button>
      </div>
      <p className="achat-hint">
        <span>{scopeNote}</span>
        <span>{left < 200 ? `${left} characters left` : 'Enter to send, Shift+Enter for a new line'}</span>
      </p>
    </div>
  );
}

function Facts({ incident, onOpen }: { incident: IncidentDetail; onOpen: (id: string) => void }) {
  return (
    <dl className="achat-facts">
      <div>
        <dt>Key prefixes</dt>
        <dd>
          {incident.key_prefixes.length === 0
            ? <span className="achat-muted">none, requests had no valid key</span>
            : incident.key_prefixes.map(prefix => <MonoValue key={prefix} value={prefix} />)}
        </dd>
      </div>
      <div>
        <dt>Tools</dt>
        <dd className="mono">{incident.tool_names.length ? incident.tool_names.join(', ') : '—'}</dd>
      </div>
      <div>
        <dt>Actions</dt>
        <dd className="achat-facts-chips">
          {Object.entries(incident.counts_by_action).map(([action, count]) => (
            <span key={action} className="fact-chip"><span className="mono">{action}</span><b>{count}</b></span>
          ))}
        </dd>
      </div>
      <div>
        <dt>Window</dt>
        <dd>
          <time dateTime={incident.first_seen}>{fmtDatetime(incident.first_seen)}</time>
          {' – '}
          <time dateTime={incident.last_seen}>{fmtDatetime(incident.last_seen)}</time>
        </dd>
      </div>
      {incident.related_ids.length > 0 && (
        <div>
          <dt>Related</dt>
          <dd className="achat-refs">
            {incident.related_ids.map(id => (
              <button key={id} type="button" className="achat-ref" onClick={() => onOpen(id)}>
                {id.slice(0, 12)}
              </button>
            ))}
          </dd>
        </div>
      )}
    </dl>
  );
}

function EventsPanel({ incident, hit, onClose }: { incident: IncidentDetail; hit: string | null; onClose: () => void }) {
  return (
    <aside className="achat-events" aria-label="Incident events">
      <div className="achat-events-head">
        <span>Events <span className="tab-count">{incident.event_count}</span></span>
        <a className="achat-link" href="#/audit">Open Live Audit</a>
        <button type="button" className="achat-icon-btn" aria-label="Close events" onClick={onClose}><X size={15} /></button>
      </div>
      {incident.truncated && <p className="achat-note">Showing the newest 200 events. Earlier refs keep their numbers.</p>}
      <ol className="achat-events-list">
        {incident.events.map(event => (
          <li key={event.ref} id={`achat-evt-${event.ref}`} className={hit === event.ref ? 'is-hit' : undefined}>
            <span className="achat-evt-top">
              <span className="achat-evt-ref">{event.ref}</span>
              <span className="mono">{event.action}</span>
              <span className={`badge ${event.decision === 'denied' ? 'badge-deny' : 'badge-muted'}`}>{event.decision}</span>
              {event.status_code != null && <span className="achat-muted">{event.status_code}</span>}
              <time className="achat-when" dateTime={event.created_at} title={fmtDatetime(event.created_at)}>{elapsedSince(event.created_at)}</time>
            </span>
            {(event.reason || event.tool_name) && (
              <span className="achat-evt-reason">
                {event.tool_name && <span className="mono">{event.tool_name}</span>}
                {event.tool_name && event.reason && ' · '}
                {event.reason}
              </span>
            )}
            <span className="achat-evt-id mono" title={event.event_id}>{event.event_id}</span>
          </li>
        ))}
      </ol>
    </aside>
  );
}
