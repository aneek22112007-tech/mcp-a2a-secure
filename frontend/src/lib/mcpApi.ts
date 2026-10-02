/**
 * mcpApi.ts — typed HTTP client for the MCP Guard FastAPI + MCP backend.
 *
 * All endpoints live on http://localhost:8000 (the Python FastAPI server).
 * This file is the ONLY place in the frontend that knows the API base URL.
 *
 * Architecture note:
 *   Browser → mcpApi.ts → FastAPI REST endpoints
 *                           → gateway.py → MCP tools
 *
 * The browser cannot speak the MCP protocol directly (MCP uses a stateful
 * JSON-RPC session over Streamable HTTP, not a simple request/response).
 * The REST layer is a thin, stateless bridge with no duplicated logic.
 */

const MCP_GUARD_BASE = import.meta.env.VITE_MCP_GUARD_API_URL ?? 'http://localhost:8000';

// ---------------------------------------------------------------------------
// Types — status (PR #76, real MCP handshake)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Types — notes (Day 1)
// ---------------------------------------------------------------------------

export interface NoteDetail {
  name: string;
  content: string;
}

export interface McpInfo {
  server_name: string;
  transport: string;
  mcp_endpoint: string;
  tools: string[];
}

// ---------------------------------------------------------------------------
// Generic fetch helper
// ---------------------------------------------------------------------------

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${MCP_GUARD_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
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

// ---------------------------------------------------------------------------
// Status API (PR #76 — real MCP handshake health check)
// ---------------------------------------------------------------------------

/** Handshake result from GET /api/status. HTTP 200 with mcp "offline" resolves. */
export function getStatus(): Promise<ServerStatus> {
  return apiFetch<ServerStatus>('/api/status');
}

// ---------------------------------------------------------------------------
// Notes API (Day 1 — gateway-backed CRUD)
// ---------------------------------------------------------------------------

/** List all note names (without .md extension), sorted lexicographically. */
export function listNotes(): Promise<string[]> {
  return apiFetch<string[]>('/api/notes');
}

/** Read the full content of a single note. */
export function readNote(name: string): Promise<NoteDetail> {
  return apiFetch<NoteDetail>(`/api/notes/${encodeURIComponent(name)}`);
}

/** Create or overwrite a note. Returns the saved note. */
export function writeNote(name: string, content: string): Promise<NoteDetail> {
  return apiFetch<NoteDetail>(`/api/notes/${encodeURIComponent(name)}`, {
    method: 'PUT',
    body: JSON.stringify({ content }),
  });
}

// ---------------------------------------------------------------------------
// MCP server info (Day 1)
// ---------------------------------------------------------------------------

/** Fetch live metadata about the running MCP Guard server. */
export function getMcpInfo(): Promise<McpInfo> {
  return apiFetch<McpInfo>('/api/mcp/info');
}

/** Check if the MCP Guard API is reachable. */
export async function checkMcpGuardHealth(): Promise<boolean> {
  try {
    const data = await apiFetch<{ status: string }>('/health');
    return data.status === 'ok';
  } catch {
    return false;
  }
}
