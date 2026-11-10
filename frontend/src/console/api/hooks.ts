/**
 * All TanStack Query hooks for the console.
 * One hook per resource. No fetch inside components.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  consoleApi,
  type ApiKeyCreateRequest,
  type AuditEvent,
  type StreamState,
} from './client';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { createAuditStream } from './client';
import { isConsolePoll, percentile } from '../utils/helpers';

// ── Query keys ────────────────────────────────────────────────────────
export const QK = {
  health:        ['health']                             as const,
  status:        ['status']                             as const,
  metrics:       ['metrics']                            as const,
  keys:          (clientId: string) => ['keys', clientId] as const,
  audit:         (params: object) => ['audit', params]  as const,
  pins:          ['pins']                               as const,
  findings:      (params: object) => ['findings', params] as const,
  sandboxRuns:   (params: object) => ['sandboxRuns', params] as const,
  sandboxHealth: ['sandboxHealth']                      as const,
};

// ── Health ────────────────────────────────────────────────────────────
export function useHealth(enabled = true) {
  return useQuery({
    queryKey: QK.health,
    queryFn:  () => consoleApi.health(),
    refetchInterval: 10_000,
    retry: 0,
    enabled,
  });
}

// ── Status ────────────────────────────────────────────────────────────
export function useStatus(enabled = true) {
  return useQuery({
    queryKey: QK.status,
    queryFn:  () => consoleApi.status(),
    refetchInterval: 30_000,
    retry: 0,
    enabled,
  });
}

// ── Metrics ───────────────────────────────────────────────────────────
export function useMetrics(enabled = true) {
  return useQuery({
    queryKey: QK.metrics,
    queryFn:  () => consoleApi.metrics(),
    refetchInterval: 15_000,
    retry: 0,
    enabled,
  });
}

// ── API Keys ──────────────────────────────────────────────────────────
export function useApiKeys(clientId: string, enabled = true) {
  return useQuery({
    queryKey: QK.keys(clientId),
    queryFn:  () => consoleApi.listKeys(clientId),
    enabled:  enabled && !!clientId,
    staleTime: 60_000,
  });
}

export function useCreateKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: ApiKeyCreateRequest) => consoleApi.createKey(req),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['keys'] });
    },
  });
}

export function useRevokeKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (keyId: string) => consoleApi.revokeKey(keyId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['keys'] });
    },
  });
}

// ── Audit ─────────────────────────────────────────────────────────────
export function useAudit(params: Parameters<typeof consoleApi.listAudit>[0], enabled = true) {
  return useQuery({
    queryKey: QK.audit(params),
    queryFn:  () => consoleApi.listAudit(params),
    refetchInterval: 10_000,
    enabled,
  });
}

// ── Audit SSE Stream ──────────────────────────────────────────────────
/**
 * One shared SSE connection for the whole console. Every view that calls
 * useAuditStream subscribes to the same hub, so switching views no longer
 * tears the stream down and reconnects, and a new view starts with the
 * events already received.
 */
const HUB_BUFFER = 200;
const hub = {
  refs: 0,
  events: [] as AuditEvent[],
  state: 'connecting' as StreamState,
  stop: null as (() => void) | null,
  controller: null as AbortController | null,
  closeTimer: 0 as ReturnType<typeof setTimeout> | 0,
  listeners: new Set<() => void>(),
};

function hubEmit() {
  for (const fn of hub.listeners) fn();
}

function hubAcquire() {
  hub.refs += 1;
  if (hub.closeTimer) {
    clearTimeout(hub.closeTimer);
    hub.closeTimer = 0;
  }
  if (hub.stop) return;
  const controller = new AbortController();
  hub.controller = controller;
  hub.state = 'connecting';
  hub.stop = createAuditStream({
    onEvent: (evt) => {
      if (hub.events.some(e => e.id === evt.id)) return;
      hub.events = [evt, ...hub.events].slice(0, HUB_BUFFER);
      hubEmit();
    },
    onStateChange: (st) => {
      hub.state = st;
      hubEmit();
    },
    signal: controller.signal,
  });
}

function hubRelease() {
  hub.refs = Math.max(0, hub.refs - 1);
  if (hub.refs > 0 || hub.closeTimer) return;
  // Short grace period so a view swap does not drop the connection.
  hub.closeTimer = setTimeout(() => {
    hub.closeTimer = 0;
    if (hub.refs > 0) return;
    hub.controller?.abort();
    hub.stop?.();
    hub.stop = null;
    hub.controller = null;
    hub.state = 'connecting';
  }, 1500);
}

export function useAuditStream(maxEvents = 100, enabled = true) {
  const [, force] = useState(0);
  const [clearedAt, setClearedAt] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const fn = () => force(n => n + 1);
    hub.listeners.add(fn);
    hubAcquire();
    fn();
    return () => {
      hub.listeners.delete(fn);
      hubRelease();
    };
  }, [enabled]);

  let events = enabled ? hub.events : [];
  if (clearedAt) {
    const idx = events.findIndex(e => e.id === clearedAt);
    events = idx === -1 ? events : events.slice(0, idx);
  }
  events = events.slice(0, maxEvents);

  const clear = () => setClearedAt(hub.events[0]?.id ?? null);

  return { events, state: enabled ? hub.state : ('offline' as StreamState), clear };
}

// ── Pins ──────────────────────────────────────────────────────────────
export function usePins(enabled = true) {
  return useQuery({
    queryKey: QK.pins,
    queryFn:  () => consoleApi.listPins(),
    refetchInterval: 30_000,
    enabled,
  });
}

export function useSyncPins() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => consoleApi.syncPins(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.pins });
    },
  });
}

export function useApprovePin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ tool_name, note }: { tool_name: string; note?: string }) =>
      consoleApi.approvePin(tool_name, note),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.pins });
    },
  });
}

export function useRevokePin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ tool_name, note }: { tool_name: string; note?: string }) =>
      consoleApi.revokePin(tool_name, note),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.pins });
    },
  });
}

// ── Scanner ───────────────────────────────────────────────────────────
export function useFindings(
  params: Parameters<typeof consoleApi.listFindings>[0],
  enabled = true,
) {
  return useQuery({
    queryKey: QK.findings(params),
    queryFn:  () => consoleApi.listFindings(params),
    refetchInterval: 30_000,
    enabled,
  });
}

export function useScanAll() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => consoleApi.scanAll(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['findings'] });
      qc.invalidateQueries({ queryKey: QK.pins });
    },
  });
}

export function useScanTool() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (tool_name: string) => consoleApi.scanTool(tool_name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['findings'] });
    },
  });
}

export function useResolveFinding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => consoleApi.resolveFinding(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['findings'] });
    },
  });
}

// ── Sandbox ───────────────────────────────────────────────────────────
export function useSandboxRuns(
  params: Parameters<typeof consoleApi.listSandboxRuns>[0],
  enabled = true,
) {
  return useQuery({
    queryKey: QK.sandboxRuns(params),
    queryFn:  () => consoleApi.listSandboxRuns(params),
    refetchInterval: 15_000,
    enabled,
  });
}

export function useSandboxHealth(enabled = true) {
  return useQuery({
    queryKey: QK.sandboxHealth,
    queryFn:  () => consoleApi.sandboxHealth(),
    refetchInterval: 30_000,
    enabled,
  });
}

// ── Audit activity series (for KPI sparklines) ────────────────────────
export interface ActivityBucket {
  t: number;
  total: number;
  allowed: number;
  denied: number;
  rateLimited: number;
  guard: number;
}

export interface ActivitySeries {
  buckets: ActivityBucket[];
  current: Omit<ActivityBucket, 't'>;
  previous: Omit<ActivityBucket, 't'>;
  sampled: number;
  /** Tool call latency over the 30 minute window, from audit duration_ms. */
  latency: { p50: number | null; p95: number | null; samples: number; byTool: Record<string, { p50: number | null; p95: number | null; samples: number }> };
}

const BUCKET_MS = 60_000;
const BUCKETS = 30;

function emptyCounts(): Omit<ActivityBucket, 't'> {
  return { total: 0, allowed: 0, denied: 0, rateLimited: 0, guard: 0 };
}

/** Real audit rows from the last 30 minutes, bucketed per minute. Console polls are skipped. */
export function buildActivitySeries(events: AuditEvent[], now = Date.now()): ActivitySeries {
  const end = Math.ceil(now / BUCKET_MS) * BUCKET_MS;
  const start = end - BUCKETS * BUCKET_MS;
  const buckets: ActivityBucket[] = Array.from({ length: BUCKETS }, (_, i) => ({ t: start + i * BUCKET_MS, ...emptyCounts() }));
  const half = BUCKETS / 2;
  const current = emptyCounts();
  const previous = emptyCounts();
  const durations: number[] = [];
  const toolDur: Record<string, number[]> = {};
  for (const evt of events) {
    if (isConsolePoll(evt)) continue;
    const ts = new Date(evt.created_at).getTime();
    if (!(ts >= start && ts < end)) continue;
    if (evt.action === 'tool.call' && typeof evt.duration_ms === 'number') {
      durations.push(evt.duration_ms);
      if (evt.tool_name) (toolDur[evt.tool_name] ??= []).push(evt.duration_ms);
    }
    const idx = Math.floor((ts - start) / BUCKET_MS);
    const denied = evt.decision === 'denied';
    const rl = evt.status_code === 429 || evt.action.startsWith('rate_limit');
    const guard = evt.action.startsWith('tool.output.injection') || evt.action.startsWith('guard');
    for (const target of [buckets[idx], idx >= half ? current : previous]) {
      target.total += 1;
      if (denied) target.denied += 1; else target.allowed += 1;
      if (rl) target.rateLimited += 1;
      if (guard) target.guard += 1;
    }
  }
  const byTool: ActivitySeries['latency']['byTool'] = {};
  for (const [tool, list] of Object.entries(toolDur)) {
    byTool[tool] = { p50: percentile(list, 50), p95: percentile(list, 95), samples: list.length };
  }
  return {
    buckets, current, previous, sampled: events.length,
    latency: { p50: percentile(durations, 50), p95: percentile(durations, 95), samples: durations.length, byTool },
  };
}

export function useActivitySeries(enabled = true) {
  return useQuery({
    queryKey: ['audit', 'activity-series'],
    queryFn: async () => {
      const all: AuditEvent[] = [];
      let offset = 0;
      for (let page = 0; page < 5; page += 1) {
        const res = await consoleApi.listAudit({ limit: 100, offset });
        all.push(...res.items);
        const last = res.items[res.items.length - 1];
        if (res.next_offset == null || !last) break;
        if (Date.now() - new Date(last.created_at).getTime() > BUCKETS * BUCKET_MS) break;
        offset = res.next_offset;
      }
      return buildActivitySeries(all);
    },
    refetchInterval: 15_000,
    enabled,
  });
}

// ── Last updated timestamp across all queries ─────────────────────────
export function useLastUpdated(): number {
  const qc = useQueryClient();
  const cache = qc.getQueryCache();
  return useSyncExternalStore(
    cb => cache.subscribe(cb),
    () => cache.getAll().reduce((m, q) => Math.max(m, q.state.dataUpdatedAt), 0),
  );
}
