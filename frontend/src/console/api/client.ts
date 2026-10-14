/**
 * MCP Guard Console — typed API client.
 * Lives entirely in src/console/api/ — never imports from src/lib/api.ts.
 * Auth: Authorization: Bearer <key> only.
 */

const DEFAULT_BASE = 'http://127.0.0.1:8000';
const BASE_STORAGE_KEY = 'mcpg_base';
const REQUEST_TIMEOUT_MS = 5_000;

let _base: string | null = null;

function normaliseBase(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

/** Runtime API origin. The connect screen writes this; nothing is baked into the bundle. */
export function setApiBase(url: string): void {
  const next = normaliseBase(url) || DEFAULT_BASE;
  _base = next;
  try { sessionStorage.setItem(BASE_STORAGE_KEY, next); } catch { /* ignore */ }
}

export function getApiBase(): string {
  if (_base) return _base;
  try {
    const stored = sessionStorage.getItem(BASE_STORAGE_KEY);
    if (stored && stored.trim()) {
      _base = normaliseBase(stored);
      return _base;
    }
  } catch { /* ignore */ }
  const fromEnv = import.meta.env.VITE_API_BASE_URL;
  _base = normaliseBase(typeof fromEnv === 'string' && fromEnv.trim() ? fromEnv : DEFAULT_BASE);
  return _base;
}

function timeoutSignal(): AbortSignal {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  }
  const controller = new AbortController();
  setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  return controller.signal;
}

function asTimeout(err: unknown): ConsoleApiError | null {
  if (err instanceof DOMException && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
    return new ConsoleApiError({
      code: 'TIMEOUT',
      message: 'Request timed out after 5 seconds.',
      details: null,
      request_id: null,
      status: 0,
    });
  }
  return null;
}

// ── Auth store (in-memory + sessionStorage) ───────────────────────────
let _key: string | null = null;

export function setApiKey(key: string, persist: boolean = true): void {
  _key = key;
  if (persist) {
    try { sessionStorage.setItem('mcpg_key', key); } catch { /* ignore */ }
  }
}

export function getApiKey(): string | null {
  if (_key) return _key;
  try {
    const stored = sessionStorage.getItem('mcpg_key');
    if (stored) { _key = stored; return stored; }
  } catch { /* ignore */ }
  return null;
}

export function forgetApiKey(): void {
  _key = null;
  try { sessionStorage.removeItem('mcpg_key'); } catch { /* ignore */ }
}

export function getKeyPrefix(): string | null {
  const k = getApiKey();
  if (!k) return null;
  // mcpg_XXXXXXXX_… — prefix is the 8-char hex part
  const m = k.match(/^mcpg_([0-9a-f]+)_/);
  return m ? m[1] : k.slice(0, 8);
}

// ── Error types ───────────────────────────────────────────────────────
export interface ApiError {
  code: string;
  message: string;
  details: unknown;
  request_id: string | null;
  status: number;
}

export class ConsoleApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly requestId: string | null;
  readonly details: unknown;

  constructor(err: ApiError) {
    super(err.message);
    this.name = 'ConsoleApiError';
    this.code = err.code;
    this.status = err.status;
    this.requestId = err.request_id;
    this.details = err.details;
  }
}

// ── Core fetch helper ─────────────────────────────────────────────────
async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  key?: string,
): Promise<T> {
  const resolvedKey = key ?? getApiKey();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> ?? {}),
  };
  if (resolvedKey) {
    headers['Authorization'] = `Bearer ${resolvedKey}`;
  }

  let res: Response;
  try {
    res = await fetch(`${getApiBase()}${path}`, {
      ...options,
      headers,
      signal: options.signal ?? timeoutSignal(),
    });
  } catch (err) {
    const timeout = asTimeout(err);
    if (timeout) throw timeout;
    throw err;
  }

  if (!res.ok) {
    let errBody: { error?: { code?: string; message?: string; details?: unknown; request_id?: string } } = {};
    try { errBody = await res.json(); } catch { /* ignore */ }
    const e = errBody.error ?? {};
    throw new ConsoleApiError({
      code: e.code ?? String(res.status),
      message: e.message ?? res.statusText,
      details: e.details ?? null,
      request_id: e.request_id ?? res.headers.get('x-request-id'),
      status: res.status,
    });
  }

  // Some endpoints (DELETE) return 204 or empty body
  const ct = res.headers.get('content-type') ?? '';
  if (res.status === 204 || !ct.includes('application/json')) {
    return undefined as T;
  }

  return res.json() as Promise<T>;
}

// ── Types ─────────────────────────────────────────────────────────────

export interface HealthResponse {
  status: string;
  app: string;
}

export interface ToolStatus {
  name: string;
  description: string | null;
  input_schema: Record<string, unknown>;
}

export interface StatusResponse {
  mcp: 'online' | 'offline';
  latency_ms: number | null;
  server_name: string | null;
  server_version: string | null;
  protocol_version: string | null;
  uptime_seconds: number;
  tools: ToolStatus[];
  error: string | null;
}

export interface ApiKey {
  id: string;
  client_id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  expires_at: string | null;
  created_at: string;
  revoked_at: string | null;
  last_used_at: string | null;
}

export interface ApiKeyCreateRequest {
  client_id: string;
  name: string;
  scopes: string[];
  expires_at?: string | null;
}

export interface ApiKeyCreateResponse extends ApiKey {
  raw_key: string;
}

export interface ApiKeyListResponse {
  keys: ApiKey[];
}

export interface AuditEvent {
  id: string;
  created_at: string;
  action: string;
  decision: string;
  status: string;
  status_code: number | null;
  error_code: string | null;
  reason: string | null;
  tool_name: string | null;
  args_hash: string | null;
  duration_ms: number | null;
  request_id: string | null;
  client_ip: string | null;
  client_id: string | null;
  api_key_id: string | null;
  key_prefix: string | null;
}

export interface AuditPage {
  items: AuditEvent[];
  limit: number;
  offset: number;
  next_offset: number | null;
}

export interface MetricsTotals {
  total: number;
  successful: number;
  denied: number;
  error: number;
  rate_limit_rejections: number;
}

export interface SlowTool {
  tool_name: string;
  request_count: number;
  avg_duration_ms: number;
  max_duration_ms: number;
}

export interface BusyKey {
  key_prefix: string;
  request_count: number;
}

export interface SandboxMetrics {
  available: boolean;
  runs_total: number;
  by_status: Record<string, number>;
  by_error_type: Record<string, number>;
  by_tool: SlowTool[];
  in_process: Record<string, unknown>;
}

export interface MetricsResponse {
  database: { available: boolean; error: string | null };
  totals: MetricsTotals;
  slowest_tools: SlowTool[];
  busiest_keys: BusyKey[];
  in_process_limiter: { active_buckets: number };
  sandbox: SandboxMetrics;
}

export interface ToolPin {
  tool_name: string;
  status: string | null;
  fingerprint: string | null;
  live_fingerprint: string | null;
  matches: boolean;
  implementation_digest: string | null;
  approved_at: string | null;
  approved_by_api_key_id: string | null;
  revoked_at: string | null;
  note: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface ToolPinList {
  items: ToolPin[];
}

export interface PinSyncResult {
  updated: string[];
}

export interface ScanFinding {
  id: string;
  tool_name: string;
  fingerprint: string;
  rule_id: string;
  severity: string;
  message: string;
  evidence: string | null;
  created_at: string;
  resolved_at: string | null;
  scan_id: string | null;
}

export interface ScanStats {
  scan_id: string;
  tools_scanned: number;
  findings_open: number;
  by_severity: Record<string, number>;
}

export interface FindingsPage {
  items: ScanFinding[];
  limit: number;
  offset: number;
  next_offset: number | null;
}

export interface SandboxRun {
  id: string;
  status: string;
  tool_name: string | null;
  mode: string | null;
  image: string | null;
  transport: string | null;
  client_id: string | null;
  api_key_id: string | null;
  key_prefix: string | null;
  request_id: string | null;
  audit_event_id: string | null;
  args_hash: string | null;
  exit_code: number | null;
  error_type: string | null;
  duration_ms: number | null;
  output_bytes: number | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface SandboxPage {
  items: SandboxRun[];
  limit: number;
  offset: number;
  next_offset: number | null;
}

export interface SandboxHealth {
  mode: string;
  available: boolean;
  reason: string | null;
  image: string;
  image_present: boolean;
  docker_server_version: string | null;
  active_runs: number;
  max_concurrent: number;
  limits: Record<string, unknown>;
}

// ── API functions ─────────────────────────────────────────────────────

export const consoleApi = {
  // Health (no auth needed)
  async health(): Promise<HealthResponse> {
    return apiFetch<HealthResponse>('/health', { method: 'GET' }, '');
  },

  // Status (any valid key)
  async status(): Promise<StatusResponse> {
    return apiFetch<StatusResponse>('/api/status');
  },

  // MCP info
  async mcpInfo(): Promise<unknown> {
    return apiFetch<unknown>('/api/mcp/info');
  },

  // Keys — GET requires client_id. We get all by iterating or just using known client IDs.
  // The admin key holds client_id which we read from the keys list itself.
  async listKeys(client_id: string): Promise<ApiKeyListResponse> {
    return apiFetch<ApiKeyListResponse>(`/api/keys?client_id=${encodeURIComponent(client_id)}`);
  },

  async createKey(req: ApiKeyCreateRequest): Promise<ApiKeyCreateResponse> {
    return apiFetch<ApiKeyCreateResponse>('/api/keys', {
      method: 'POST',
      body: JSON.stringify(req),
    });
  },

  async revokeKey(key_id: string): Promise<ApiKey> {
    return apiFetch<ApiKey>(`/api/keys/${key_id}`, { method: 'DELETE' });
  },

  // Audit
  async listAudit(params: {
    client_id?: string;
    api_key_id?: string;
    key_prefix?: string;
    tool_name?: string;
    action?: string;
    decision?: 'allowed' | 'denied';
    start?: string;
    end?: string;
    limit?: number;
    offset?: number;
  }): Promise<AuditPage> {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
    }
    return apiFetch<AuditPage>(`/api/audit?${q}`);
  },

  // Metrics
  async metrics(): Promise<MetricsResponse> {
    return apiFetch<MetricsResponse>('/api/metrics');
  },

  // Pins
  async listPins(): Promise<ToolPinList> {
    return apiFetch<ToolPinList>('/api/pins');
  },

  async syncPins(): Promise<PinSyncResult> {
    return apiFetch<PinSyncResult>('/api/pins/sync', { method: 'POST' });
  },

  async approvePin(tool_name: string, note?: string): Promise<ToolPin> {
    return apiFetch<ToolPin>(`/api/pins/${encodeURIComponent(tool_name)}/approve`, {
      method: 'POST',
      body: JSON.stringify({ note: note ?? null }),
    });
  },

  async revokePin(tool_name: string, note?: string): Promise<ToolPin> {
    return apiFetch<ToolPin>(`/api/pins/${encodeURIComponent(tool_name)}/revoke`, {
      method: 'POST',
      body: JSON.stringify({ note: note ?? null }),
    });
  },

  // Scanner
  async listFindings(params: {
    tool_name?: string;
    severity?: string;
    rule_id?: string;
    open_only?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<FindingsPage> {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) q.set(k, String(v));
    }
    return apiFetch<FindingsPage>(`/api/scanner/findings?${q}`);
  },

  async scanAll(): Promise<ScanStats> {
    return apiFetch<ScanStats>('/api/scanner/run', { method: 'POST' });
  },

  async scanTool(tool_name: string): Promise<ScanStats> {
    return apiFetch<ScanStats>(`/api/scanner/run/${encodeURIComponent(tool_name)}`, { method: 'POST' });
  },

  async resolveFinding(finding_id: string): Promise<ScanFinding> {
    return apiFetch<ScanFinding>(`/api/scanner/findings/${finding_id}/resolve`, { method: 'POST' });
  },

  // Sandbox
  async listSandboxRuns(params: {
    client_id?: string;
    tool_name?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<SandboxPage> {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
    }
    return apiFetch<SandboxPage>(`/api/sandbox/runs?${q}`);
  },

  async sandboxHealth(): Promise<SandboxHealth> {
    return apiFetch<SandboxHealth>('/api/sandbox/health');
  },

  // Notes (for Attack Simulator)
  async listNotes(key?: string): Promise<unknown> {
    return apiFetch<unknown>('/api/notes', {}, key);
  },

  async readNote(name: string, key?: string): Promise<unknown> {
    return apiFetch<unknown>(`/api/notes/${encodeURIComponent(name)}`, {}, key);
  },

  async writeNote(name: string, content: string, key?: string): Promise<unknown> {
    return apiFetch<unknown>(`/api/notes/${encodeURIComponent(name)}`, {
      method: 'PUT',
      body: JSON.stringify({ content }),
    }, key);
  },

  // Raw fetch for attack simulator (returns both status + body)
  async rawRequest(
    path: string,
    method: string = 'GET',
    key?: string,
    body?: unknown,
  ): Promise<{ status: number; headers: Record<string, string>; body: unknown; ok: boolean }> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (key !== undefined) {
      if (key !== '') headers['Authorization'] = `Bearer ${key}`;
    } else {
      const k = getApiKey();
      if (k) headers['Authorization'] = `Bearer ${k}`;
    }
    let res: Response;
    try {
      res = await fetch(`${getApiBase()}${path}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: timeoutSignal(),
      });
    } catch (err) {
      const timeout = asTimeout(err);
      if (timeout) throw timeout;
      throw err;
    }

    return readRawResponse(res);
  },

  /** MCP tools/call on a real session: initialize, then reuse mcp-session-id. */
  async mcpToolsCall(
    tool: string,
    args: Record<string, unknown>,
    key?: string,
  ): Promise<{ status: number; headers: Record<string, string>; body: unknown; ok: boolean }> {
    const token = key ?? getApiKey() ?? '';
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
    };
    if (token) headers.Authorization = `Bearer ${token}`;

    const initRes = await fetch(`${getApiBase()}/mcp/`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'mcp-guard-console', version: '1.0.0' },
        },
      }),
      signal: timeoutSignal(),
    });
    const initRaw = await readRawResponse(initRes);
    if (!initRes.ok) return initRaw;

    const session = initRes.headers.get('mcp-session-id');
    if (!session) {
      return {
        status: 0,
        headers: initRaw.headers,
        ok: false,
        body: {
          error: {
            message: 'MCP initialize did not return Mcp-Session-Id, so the tool call was not sent.',
          },
        },
      };
    }
    let protocol = '2025-06-18';
    if (initRaw.body && typeof initRaw.body === 'object') {
      const result = (initRaw.body as { result?: { protocolVersion?: unknown } }).result;
      if (result && typeof result.protocolVersion === 'string' && result.protocolVersion) {
        protocol = result.protocolVersion;
      }
    }
    headers['mcp-session-id'] = session;
    headers['mcp-protocol-version'] = protocol;

    const noted = await fetch(`${getApiBase()}/mcp/`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
      signal: timeoutSignal(),
    }).catch(() => undefined);
    if (noted) await noted.body?.cancel().catch(() => undefined);

    const callRes = await fetch(`${getApiBase()}/mcp/`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: tool, arguments: args },
      }),
      signal: timeoutSignal(),
    });
    return readRawResponse(callRes);
  },
};

async function readRawResponse(res: Response): Promise<{
  status: number;
  headers: Record<string, string>;
  body: unknown;
  ok: boolean;
}> {
  const respHeaders: Record<string, string> = {};
  res.headers.forEach((v, k) => { respHeaders[k] = v; });
  const text = await res.text();
  let respBody: unknown = text ? text : null;
  if (text) {
    try {
      respBody = JSON.parse(text);
    } catch {
      const dataLine = text.split('\n').find(line => line.startsWith('data: '));
      if (dataLine) {
        try { respBody = JSON.parse(dataLine.slice(6)); } catch { respBody = text; }
      }
    }
  }
  return { status: res.status, headers: respHeaders, body: respBody, ok: res.ok };
}

// ── SSE Audit Stream ──────────────────────────────────────────────────

export type StreamState = 'connecting' | 'live' | 'reconnecting' | 'offline';

export interface AuditStreamOptions {
  onEvent: (event: AuditEvent) => void;
  onStateChange: (state: StreamState) => void;
  signal?: AbortSignal;
}

const MAX_BACKOFF_MS = 30_000;
const INITIAL_BACKOFF_MS = 1_000;

export function createAuditStream(options: AuditStreamOptions): () => void {
  let backoff = INITIAL_BACKOFF_MS;
  let cancelled = false;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  async function connect() {
    if (cancelled) return;
    const key = getApiKey();
    if (!key) { options.onStateChange('offline'); return; }

    options.onStateChange(backoff > INITIAL_BACKOFF_MS ? 'reconnecting' : 'connecting');

    try {
      const res = await fetch(`${getApiBase()}/api/audit/stream`, {
        headers: { 'Authorization': `Bearer ${key}` },
        signal: options.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status}`);
      }

      backoff = INITIAL_BACKOFF_MS;
      options.onStateChange('live');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (!cancelled) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        let eventType = '';
        let eventId = '';
        let dataLines: string[] = [];

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith('id: ')) {
            eventId = line.slice(4).trim();
          } else if (line.startsWith('data: ')) {
            dataLines.push(line.slice(6));
          } else if (line === '' && dataLines.length > 0) {
            if (eventType === 'audit') {
              try {
                const parsed = JSON.parse(dataLines.join('\n')) as AuditEvent;
                if (!parsed.id && eventId) parsed.id = eventId;
                options.onEvent(parsed);
              } catch { /* skip malformed */ }
            }
            eventType = '';
            eventId = '';
            dataLines = [];
          }
        }
      }
    } catch (err: unknown) {
      if (cancelled) return;
      const isAbort = err instanceof DOMException && err.name === 'AbortError';
      if (isAbort) return;
      options.onStateChange('reconnecting');
    }

    if (!cancelled) {
      options.onStateChange('reconnecting');
      timeoutId = setTimeout(() => {
        backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
        connect();
      }, backoff);
    }
  }

  connect();

  return () => {
    cancelled = true;
    if (timeoutId !== null) clearTimeout(timeoutId);
    options.onStateChange('offline');
  };
}

const SCOPE_PROBES: { scope: string; run: () => Promise<unknown> }[] = [
  { scope: 'metrics:read', run: () => consoleApi.metrics() },
  { scope: 'audit:read', run: () => consoleApi.listAudit({ limit: 1 }) },
  { scope: 'tools:read', run: () => consoleApi.listPins() },
  { scope: 'scanner:read', run: () => consoleApi.listFindings({ limit: 1 }) },
  { scope: 'sandbox:read', run: () => consoleApi.sandboxHealth() },
  { scope: 'notes:read', run: () => consoleApi.listNotes() },
];

export interface DetectedAccess {
  scopes: string[];
  clientId: string;
}

/**
 * Probe real endpoints. A 200 means the scope is present (admin satisfies every check).
 * A 403 means that scope is absent. There is no whoami route.
 */
export async function detectAccess(): Promise<DetectedAccess> {
  const scopes: string[] = [];
  const settled = await Promise.all(SCOPE_PROBES.map(async probe => {
    try {
      await probe.run();
      return probe.scope;
    } catch (err) {
      if (err instanceof ConsoleApiError && err.status === 401) throw err;
      return null;
    }
  }));
  for (const scope of settled) {
    if (scope) scopes.push(scope);
  }

  try {
    await consoleApi.listKeys('00000000-0000-0000-0000-000000000000');
    scopes.push('admin');
  } catch (err) {
    if (err instanceof ConsoleApiError && err.status === 401) throw err;
  }

  let clientId = '';
  if (scopes.includes('audit:read') || scopes.includes('admin')) {
    try {
      const page = await consoleApi.listAudit({ limit: 30 });
      const prefix = getKeyPrefix();
      const mine = page.items.find(evt => evt.client_id && (!prefix || evt.key_prefix === prefix));
      clientId = mine?.client_id ?? page.items.find(evt => evt.client_id)?.client_id ?? '';
    } catch {
      clientId = '';
    }
  }

  return { scopes, clientId };
}

/** Client ids that have actually appeared on audit rows. */
export async function discoverClientIds(): Promise<string[]> {
  const ids = new Set<string>();
  let offset = 0;
  for (let page = 0; page < 3; page += 1) {
    const audit = await consoleApi.listAudit({ limit: 100, offset });
    for (const item of audit.items) {
      if (item.client_id) ids.add(item.client_id);
    }
    if (audit.next_offset == null) break;
    offset = audit.next_offset;
  }
  return [...ids];
}
