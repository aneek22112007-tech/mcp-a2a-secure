import { useState } from 'react';
import { Brain } from 'lucide-react';
import { toast } from 'sonner';
import {
  useAnalystStatus,
  useAuditStream,
  useExplainIncident,
  useIncident,
  useIncidents,
} from '../../api/hooks';
import {
  ConsoleApiError,
  type AnalystReportBody,
  type ExplainResult,
  type IncidentDetail,
} from '../../api/client';
import { EmptyState, ErrorPanel, LoadingPanel, MonoValue, Spinner } from '../../components/ui';
import {
  elapsedSince,
  fmtDatetime,
  fmtDuration,
  severityBadgeClass,
} from '../../utils/helpers';

const KINDS = ['injection', 'pin', 'scanner', 'rate_limit', 'scope', 'auth', 'a2a', 'other'] as const;
const SEVERITIES = ['high', 'medium', 'low'] as const;

interface AnalystViewProps {
  offline: boolean;
  scopes: string[];
}

function isPrefix(value: string): boolean {
  return /^[0-9a-f]{8}$/i.test(value);
}

function explainMessage(err: unknown): string {
  if (!(err instanceof ConsoleApiError)) return 'The explanation request failed.';
  const details = err.details;
  const reason = details && typeof details === 'object' && 'reason' in details
    ? String((details as { reason?: unknown }).reason ?? '')
    : '';
  if (err.code === 'ANALYST_OUTPUT_REJECTED' || err.status === 502) {
    return `The analyst's reply failed the checks (${reason || err.code}) and was not shown.`;
  }
  if (err.code === 'ANALYST_BUSY') {
    return 'The analyst is busy (ANALYST_BUSY). Try again in a few seconds.';
  }
  if (err.status === 429 || err.code === 'RATE_LIMITED') {
    return 'Too many explanations (429). Wait and try again.';
  }
  if (err.code === 'ANALYST_UNAVAILABLE') {
    return reason === 'disabled'
      ? 'Analyst unavailable. LLM_ENABLED is false.'
      : 'Analyst unavailable. Ollama is not reachable at the configured URL and Groq is not configured.';
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
  if (!status.enabled) return 'Analyst unavailable. LLM_ENABLED is false.';
  if (!status.ollama_reachable && !status.groq_configured) {
    return 'Analyst unavailable. Ollama is not reachable at the configured URL and Groq is not configured.';
  }
  if (!status.ollama_model_present && !status.groq_configured) {
    return 'Analyst unavailable. The configured Ollama model is not present and Groq is not configured.';
  }
  return null;
}

export function AnalystView({ offline, scopes }: AnalystViewProps) {
  const canExplain = scopes.includes('analyst:run');
  const [kind, setKind] = useState('');
  const [severity, setSeverity] = useState('');
  const [picked, setPicked] = useState<string | null>(null);
  const [fresh, setFresh] = useState(false);
  const [seenId, setSeenId] = useState<string | null>(null);
  const [hit, setHit] = useState<string | null>(null);
  const [live, setLive] = useState<ExplainResult | null>(null);
  const [errorFor, setErrorFor] = useState<{ id: string; message: string } | null>(null);

  const list = useIncidents(
    { kind: kind || undefined, severity: severity || undefined },
    !offline,
  );
  const selected = list.data?.items.some(item => item.id === picked)
    ? picked
    : (list.data?.items[0]?.id ?? null);
  const detail = useIncident(selected, !offline);
  const status = useAnalystStatus(!offline && canExplain);
  const explain = useExplainIncident();
  const stream = useAuditStream(40, !offline);

  const newest = stream.events[0];
  if (newest && newest.id !== seenId) {
    const previous = seenId;
    setSeenId(newest.id);
    if (
      previous !== null
      && (newest.decision === 'denied' || newest.action === 'tool.output.injection')
    ) {
      setFresh(true);
    }
  }

  const windowHours = list.data?.window_hours;
  const down = unavailableText(status.data);
  const shownLive = live && live.incident_id === selected ? live : null;
  const stored = detail.data?.report ?? null;
  const report: AnalystReportBody | null = down ? null : (shownLive?.report ?? stored);
  const explainError = errorFor && errorFor.id === selected ? errorFor.message : null;
  const stale = detail.data?.latest_report?.stale ?? false;
  const askingModel = status.data?.ollama_model || 'the model';

  const ask = (refresh: boolean) => {
    if (!selected) return;
    setErrorFor(null);
    explain.mutate(
      { incident_id: selected, refresh },
      {
        onSuccess: (data) => setLive(data),
        onError: (err) => {
          const message = explainMessage(err);
          setErrorFor({ id: selected, message });
          toast.error(message);
        },
      },
    );
  };

  return (
    <div className="console-page">
      <div>
        <h1 className="page-title">AI Analyst</h1>
        <p className="page-sub">
          Incidents grouped from real audit events
          {windowHours != null ? ` in the last ${windowHours} hours` : ''}.
          An explanation cites those events. It does not block or approve anything.
        </p>
      </div>

      {fresh && (
        <div className="banner banner-allow" role="status">
          <span>New security events. Refresh</span>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setFresh(false);
              void list.refetch();
              void detail.refetch();
            }}
          >
            Refresh
          </button>
        </div>
      )}

      <div className="analyst-filters">
        <FilterChips
          label="Kind"
          value={kind}
          options={KINDS}
          onChange={setKind}
        />
        <FilterChips
          label="Severity"
          value={severity}
          options={SEVERITIES}
          onChange={setSeverity}
        />
      </div>

      <div className="analyst-split">
        <section className="panel" aria-label="Incidents">
          {list.isLoading && <LoadingPanel label="Loading incidents…" />}
          {list.isError && (
            <ErrorPanel
              message={list.error instanceof Error ? list.error.message : 'Could not load incidents.'}
              onRetry={() => { void list.refetch(); }}
            />
          )}
          {list.data && list.data.items.length === 0 && (
            <EmptyState label={`No security incidents in the last ${list.data.window_hours} hours.`} icon={Brain} />
          )}
          {list.data && list.data.items.length > 0 && (
            <ul className="analyst-list">
              {list.data.items.map(item => (
                <li key={item.id}>
                  <button
                    type="button"
                    className="analyst-row"
                    aria-current={item.id === selected ? 'true' : undefined}
                    onClick={() => setPicked(item.id)}
                  >
                    <span className="analyst-row-top">
                      <span className={`badge ${severityBadgeClass(item.severity)}`}>{item.severity}</span>
                      <span>{item.kind}</span>
                      {isPrefix(item.group_key)
                        ? <MonoValue value={item.group_key} />
                        : <span>{item.group_key}</span>}
                      <span className="analyst-count">{item.event_count} events</span>
                      {item.latest_report && (
                        <span className={`badge ${item.latest_report.stale ? 'badge-review' : 'badge-allow'}`}>
                          {item.latest_report.stale ? 'stale' : 'explained'}
                        </span>
                      )}
                    </span>
                    <span className="analyst-times">
                      <time dateTime={item.first_seen} title={fmtDatetime(item.first_seen)}>
                        {elapsedSince(item.first_seen)}
                      </time>
                      {' – '}
                      <time dateTime={item.last_seen} title={fmtDatetime(item.last_seen)}>
                        {elapsedSince(item.last_seen)}
                      </time>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel panel-pad analyst-detail" aria-label="Incident detail">
          {!selected && <p className="page-sub">Select an incident.</p>}
          {detail.isLoading && selected && <LoadingPanel label="Loading incident…" />}
          {detail.isError && (
            <ErrorPanel
              message={detail.error instanceof Error ? detail.error.message : 'Could not load this incident.'}
              onRetry={() => { void detail.refetch(); }}
            />
          )}
          {detail.data && (
            <Facts
              incident={detail.data}
              onOpen={(id) => {
                setKind('');
                setSeverity('');
                setPicked(id);
              }}
            />
          )}
          {detail.data && (
            <EventsTable
              incident={detail.data}
              hit={hit}
            />
          )}
          <div className="analyst-explain">
            {!canExplain && (
              <p>You need the analyst:run scope to ask for an explanation.</p>
            )}
            {canExplain && down && <p>{down}</p>}
            {canExplain && !down && status.isError && (
              <p>Analyst status could not be loaded.</p>
            )}
            {canExplain && (
              <button
                type="button"
                className="btn btn-amber btn-sm"
                disabled={!selected || offline || !!down || explain.isPending || status.isLoading}
                onClick={() => ask(stale)}
              >
                {explain.isPending && <Spinner size={12} />}
                {explain.isPending
                  ? `Asking ${askingModel}...`
                  : stale && report
                    ? 'Explain again'
                    : 'Explain'}
              </button>
            )}
            {canExplain && !down && stale && report && (
              <p>New events joined this incident since this explanation.</p>
            )}
            {canExplain && !down && explainError && <p role="alert">{explainError}</p>}
            {canExplain && !down && report && detail.data && (
              <Explanation
                report={report}
                eventCount={detail.data.event_count}
                meta={shownLive ?? stored}
                onRef={(ref) => {
                  setHit(ref);
                  document.getElementById(`analyst-evt-${ref}`)?.scrollIntoView({ block: 'nearest' });
                }}
              />
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function FilterChips({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (next: string) => void;
}) {
  return (
    <div className="analyst-filters-row">
      <span className="section-label">{label}</span>
      <button type="button" className="chip" aria-pressed={value === ''} onClick={() => onChange('')}>All</button>
      {options.map(option => (
        <button
          key={option}
          type="button"
          className="chip"
          aria-pressed={value === option}
          onClick={() => onChange(option)}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

function Facts({
  incident,
  onOpen,
}: {
  incident: IncidentDetail;
  onOpen: (id: string) => void;
}) {
  return (
    <div className="analyst-facts">
      <p>
        <span className={`badge ${severityBadgeClass(incident.severity)}`}>{incident.severity}</span>
        {' '}{incident.kind}
      </p>
      <p>
        Key prefixes:{' '}
        {incident.key_prefixes.length === 0
          ? '—'
          : incident.key_prefixes.map(prefix => <MonoValue key={prefix} value={prefix} />)}
      </p>
      <p>Tools: {incident.tool_names.length ? incident.tool_names.join(', ') : '—'}</p>
      <p>
        Counts:{' '}
        {Object.entries(incident.counts_by_action).map(([action, count]) => (
          <span key={action}>{action} {count} </span>
        ))}
      </p>
      <p>
        <time dateTime={incident.first_seen} title={fmtDatetime(incident.first_seen)}>
          {elapsedSince(incident.first_seen)}
        </time>
        {' – '}
        <time dateTime={incident.last_seen} title={fmtDatetime(incident.last_seen)}>
          {elapsedSince(incident.last_seen)}
        </time>
      </p>
      {incident.related_ids.length > 0 && (
        <p className="analyst-refs">
          Related:{' '}
          {incident.related_ids.map(id => (
            <button key={id} type="button" className="chip" onClick={() => onOpen(id)}>
              <MonoValue value={id} />
            </button>
          ))}
        </p>
      )}
    </div>
  );
}

function EventsTable({ incident, hit }: { incident: IncidentDetail; hit: string | null }) {
  return (
    <div className="events-scroll">
      {incident.truncated && <p className="page-sub">Showing the newest 200 events. Earlier refs are unchanged.</p>}
      <table className="data-table">
        <thead>
          <tr>
            <th>Ref</th>
            <th>Time</th>
            <th>Action</th>
            <th>Decision</th>
            <th>Status</th>
            <th>Reason</th>
            <th>Tool</th>
            <th>Event</th>
          </tr>
        </thead>
        <tbody>
          {incident.events.map(event => (
            <tr
              key={event.ref}
              id={`analyst-evt-${event.ref}`}
              className={hit === event.ref ? 'analyst-event-hit' : undefined}
            >
              <td>{event.ref}</td>
              <td title={fmtDatetime(event.created_at)}>{elapsedSince(event.created_at)}</td>
              <td>{event.action}</td>
              <td>{event.decision}</td>
              <td>{event.status_code ?? '—'}</td>
              <td>{event.reason ?? '—'}</td>
              <td>{event.tool_name ?? '—'}</td>
              <td>
                <MonoValue value={event.event_id} />
                {' '}
                <a href="#/audit">Audit</a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Explanation({
  report,
  eventCount,
  meta,
  onRef,
}: {
  report: AnalystReportBody;
  eventCount: number;
  meta: {
    provider: string;
    model: string;
    fell_back: boolean;
    withheld_fields: number;
    created_at: string;
    latency_ms: number;
    cached?: boolean;
  } | null;
  onRef: (ref: string) => void;
}) {
  const withheld = meta?.withheld_fields ?? 0;
  return (
    <div>
      <p className="section-label">AI explanation, checked against {eventCount} events</p>
      <p>{report.summary}</p>
      <ol className="analyst-timeline">
        {report.timeline.map((item, index) => (
          <li key={`${item.text}-${index}`}>
            <span>{item.text}</span>
            <span className="analyst-refs">
              {item.refs.map(ref => (
                <button key={ref} type="button" className="chip" onClick={() => onRef(ref)}>
                  {ref}
                </button>
              ))}
            </span>
          </li>
        ))}
      </ol>
      <p>Likely cause: {report.likely_cause || 'unknown'}</p>
      <p>Impact: {report.impact || 'unknown'}</p>
      {report.next_steps.length > 0 && (
        <ul>
          {report.next_steps.map(step => <li key={step}>{step}</li>)}
        </ul>
      )}
      <p>Confidence: {report.confidence}</p>
      {meta && (
        <p className="page-sub">
          {meta.provider}
          {' · '}{meta.model}
          {' · '}{fmtDuration(meta.latency_ms)}
          {withheld > 0 && (
            <>
              {' · '}
              {withheld} {withheld === 1 ? 'field' : 'fields'} withheld because they looked like instructions
            </>
          )}
          {' · '}{fmtDatetime(meta.created_at)}
          {meta.fell_back && ' · via Groq fallback'}
          {meta.cached && ' · cached'}
        </p>
      )}
    </div>
  );
}
