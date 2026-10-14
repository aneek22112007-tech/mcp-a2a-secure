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
import { useEffect, useRef, useState } from 'react';
import { createAuditStream } from './client';

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
    retry: 1,
    enabled,
  });
}

// ── Status ────────────────────────────────────────────────────────────
export function useStatus(enabled = true) {
  return useQuery({
    queryKey: QK.status,
    queryFn:  () => consoleApi.status(),
    refetchInterval: 30_000,
    retry: 1,
    enabled,
  });
}

// ── Metrics ───────────────────────────────────────────────────────────
export function useMetrics(enabled = true) {
  return useQuery({
    queryKey: QK.metrics,
    queryFn:  () => consoleApi.metrics(),
    refetchInterval: 15_000,
    retry: 2,
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
export function useAuditStream(maxEvents = 100) {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [state, setState] = useState<StreamState>('connecting');
  const abortRef = useRef<AbortController | null>(null);
  const stopRef  = useRef<(() => void) | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;

    const stop = createAuditStream({
      onEvent: (evt) => {
        setEvents(prev => {
          const next = [evt, ...prev];
          return next.length > maxEvents ? next.slice(0, maxEvents) : next;
        });
      },
      onStateChange: setState,
      signal: controller.signal,
    });
    stopRef.current = stop;

    return () => {
      controller.abort();
      stop();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const clear = () => setEvents([]);

  return { events, state, clear };
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
