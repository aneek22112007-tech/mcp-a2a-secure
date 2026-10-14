/**
 * Real requests used by the attack simulator and the overview demo sequence.
 * Stage labels come from the HTTP status and the error body, not from the button name.
 */
import { consoleApi, getApiKey, getKeyPrefix, type ToolPin } from '../../api/client';

export interface RawHttp {
  status: number;
  headers: Record<string, string>;
  body: unknown;
  ok: boolean;
}

export interface AttackResult extends RawHttp {
  stage: string;
  stageColor: string;
  summary: string;
  pinReason?: string;
}

export const PIN_REASONS = ['pin_revoked', 'pin_drift', 'pin_scan_blocked', 'pin_missing'] as const;

export interface ApiErrorBody {
  code?: string;
  message?: string;
  details?: unknown;
}

export function errorOf(body: unknown): ApiErrorBody {
  if (!body || typeof body !== 'object') return {};
  const err = (body as { error?: unknown }).error;
  if (!err || typeof err !== 'object') return {};
  const record = err as Record<string, unknown>;
  return {
    code: typeof record.code === 'string' ? record.code : undefined,
    message: typeof record.message === 'string' ? record.message : undefined,
    details: record.details,
  };
}

function pinReasonIn(details: unknown, message?: string, code?: string): string | undefined {
  const parts: string[] = [];
  if (typeof details === 'string') parts.push(details);
  else if (details && typeof details === 'object') parts.push(JSON.stringify(details));
  if (message) parts.push(message);
  if (code) parts.push(code);
  const hay = parts.join(' ').toLowerCase();
  return PIN_REASONS.find(reason => hay.includes(reason));
}

export function classify(raw: RawHttp): Pick<AttackResult, 'stage' | 'stageColor' | 'pinReason'> {
  if (raw.status >= 200 && raw.status < 300) {
    return { stage: 'Allowed', stageColor: 'var(--c-allow)' };
  }
  if (raw.status === 401) {
    return { stage: 'Auth', stageColor: 'var(--c-deny)' };
  }
  if (raw.status === 429) {
    return { stage: 'Rate limit', stageColor: 'var(--c-review)' };
  }
  if (raw.status === 403) {
    const err = errorOf(raw.body);
    const pin = pinReasonIn(err.details, err.message, err.code);
    if (pin) return { stage: 'Pin gate', stageColor: 'var(--c-deny)', pinReason: pin };
    const message = (err.message ?? '').toLowerCase();
    if (message.includes('not approved') || message.includes('pin')) {
      return { stage: 'Pin gate', stageColor: 'var(--c-deny)' };
    }
    return { stage: 'Scope', stageColor: 'var(--c-deny)' };
  }
  return { stage: `HTTP ${raw.status || 'error'}`, stageColor: 'var(--c-info)' };
}

function finish(raw: RawHttp, summary: string, override?: Partial<AttackResult>): AttackResult {
  return { ...raw, ...classify(raw), summary, ...override };
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Pause so the step caption stays readable before the next request starts. */
export function waitForCaption(): Promise<void> {
  return sleep(1500);
}

export async function runValidCall(): Promise<AttackResult> {
  const raw = await consoleApi.mcpToolsCall('list_notes', {});
  const stage = classify(raw);
  return finish(raw, stage.stage === 'Allowed'
    ? 'list_notes completed through /mcp/.'
    : `list_notes returned HTTP ${raw.status}.`);
}

export async function runBadKey(): Promise<AttackResult> {
  const raw = await consoleApi.rawRequest('/api/metrics', 'GET', 'mcpg_not_a_real_key');
  return finish(raw, 'GET /api/metrics with a token the server does not know.');
}

export async function runWrongScope(): Promise<AttackResult> {
  const audit = await consoleApi.listAudit({ limit: 30 });
  const prefix = getKeyPrefix();
  const clientId = audit.items.find(evt => evt.client_id && (!prefix || evt.key_prefix === prefix))?.client_id
    ?? audit.items.find(evt => evt.client_id)?.client_id;
  if (!clientId) {
    return finish({
      status: 0,
      headers: {},
      body: { error: { code: 'NO_CLIENT', message: 'No client id in the audit log yet, so a temporary key cannot be created.', details: null } },
      ok: false,
    }, 'Need a client id from GET /api/audit before POST /api/keys.');
  }

  const created = await consoleApi.createKey({
    client_id: clientId,
    name: 'console-scope-probe',
    scopes: ['notes:read', 'notes:write'],
  });
  try {
    const raw = await consoleApi.rawRequest('/api/metrics', 'GET', created.raw_key);
    return finish(raw, `Temporary notes-only key called GET /api/metrics (HTTP ${raw.status}), then the key was revoked.`);
  } finally {
    await consoleApi.revokeKey(created.id).catch(() => undefined);
  }
}

export async function runRateLimit(): Promise<AttackResult> {
  const results = await Promise.all(
    Array.from({ length: 120 }, () => consoleApi.rawRequest('/api/metrics', 'GET')),
  );
  const limited = results.filter(item => item.status === 429);
  const sample = limited[0] ?? results[results.length - 1];
  const retryAfter = limited.map(item => item.headers['retry-after']).find(Boolean) ?? null;
  const summary = retryAfter
    ? `${limited.length} of ${results.length} returned 429. Retry-After: ${retryAfter}s.`
    : `${limited.length} of ${results.length} returned 429.`;
  return finish(
    {
      status: limited.length > 0 ? 429 : sample.status,
      headers: sample.headers,
      body: {
        sent: results.length,
        too_many_requests: limited.length,
        retry_after: retryAfter,
        sample: sample.body,
      },
      ok: limited.length === 0 && sample.ok,
    },
    summary,
  );
}

async function pinReasonFromAudit(tool: string): Promise<string | undefined> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const page = await consoleApi.listAudit({ tool_name: tool, decision: 'denied', limit: 10 });
    const hit = page.items.find(evt => evt.reason && (PIN_REASONS as readonly string[]).includes(evt.reason));
    if (hit?.reason) return hit.reason;
    await sleep(300);
  }
  return undefined;
}

function pinTarget(pins: ToolPin[]): ToolPin | undefined {
  return pins.find(pin => pin.status === 'revoked')
    ?? pins.find(pin => pin.status === 'approved' && !pin.matches)
    ?? pins.find(pin => pin.status !== 'approved');
}

function pinArgs(name: string): Record<string, unknown> {
  if (name === 'write_note') return { name: 'pin-probe', content: 'probe' };
  if (name === 'read_note') return { name: 'pin-probe' };
  if (name === 'list_notes') return {};
  return {};
}

export async function runPinBlock(): Promise<AttackResult> {
  const pins = await consoleApi.listPins();
  const target = pinTarget(pins.items);
  const tool = target?.tool_name ?? 'write_note';
  const raw = await consoleApi.mcpToolsCall(tool, pinArgs(tool), getApiKey() ?? '');
  let result = finish(raw, `tools/call ${tool} returned HTTP ${raw.status}.`);
  if (raw.status === 403 && !result.pinReason) {
    const reason = await pinReasonFromAudit(tool);
    if (reason) {
      result = {
        ...result,
        stage: 'Pin gate',
        stageColor: 'var(--c-deny)',
        pinReason: reason,
        summary: `tools/call ${tool} returned 403. Audit reason: ${reason}.`,
      };
    }
  } else if (result.pinReason) {
    result = { ...result, summary: `tools/call ${tool} returned 403. Reason: ${result.pinReason}.` };
  }
  return result;
}

export async function runPathTraversal(): Promise<AttackResult> {
  const raw = await consoleApi.rawRequest(`/api/notes/${encodeURIComponent('../secret')}`, 'GET');
  if (raw.status === 404) {
    return finish(raw, 'The server did not return a note.', {
      stage: 'rejected: path outside notes store',
      stageColor: 'var(--c-deny)',
    });
  }
  const message = errorOf(raw.body).message;
  return finish(raw, message
    ? `HTTP ${raw.status}: ${message}`
    : `HTTP ${raw.status}.`);
}

export interface DemoStep {
  id: string;
  caption: string;
  run: () => Promise<AttackResult>;
}

export const DEMO_SEQUENCE: DemoStep[] = [
  { id: 'valid', caption: 'Valid call: list_notes through /mcp/ with the connected key.', run: runValidCall },
  { id: 'bad-key', caption: 'Bad key: GET /api/metrics with a token the server does not know.', run: runBadKey },
  { id: 'wrong-scope', caption: 'Wrong scope: a temporary notes-only key calls GET /api/metrics, then is revoked.', run: runWrongScope },
  { id: 'pin', caption: 'Pin gate: tools/call on a revoked or drifted tool.', run: runPinBlock },
  { id: 'rate-limit', caption: 'Rate limit: 120 GET /api/metrics requests at once.', run: runRateLimit },
];
