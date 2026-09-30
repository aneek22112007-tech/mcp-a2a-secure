/**
 * Typed client for the Polaris FastAPI server.
 * This is the only frontend module that knows the API origin.
 */

const POLARIS_BASE = import.meta.env.VITE_POLARIS_API_URL ?? 'http://localhost:8000';

export interface ToolStatus {
  name: string;
  description: string | null;
  input_schema: Record<string, unknown>;
}

export interface ServerStatus {
  mcp: 'online' | 'offline';
  latency_ms: number | null;
  server_name: string | null;
  server_version: string | null;
  protocol_version: string | null;
  uptime_seconds: number;
  tools: ToolStatus[];
  error: string | null;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${POLARIS_BASE}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { detail?: string };
    throw new Error(body.detail ?? `HTTP ${response.status}`);
  }

  return response.json() as Promise<T>;
}

/** Handshake result from GET /api/status. HTTP 200 with mcp "offline" resolves. */
export function getStatus(): Promise<ServerStatus> {
  return apiFetch<ServerStatus>('/api/status');
}
