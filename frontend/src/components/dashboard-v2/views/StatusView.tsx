import { useEffect, useRef, useState } from 'react';
import { getStatus, type ServerStatus, type ToolStatus } from '../../../lib/mcpApi';

interface InputField {
  name: string;
  type: string;
  required: boolean;
}

function formatUptime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remain = total % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${remain}s`;
  return `${remain}s`;
}

function fieldsFromSchema(schema: Record<string, unknown>): InputField[] {
  const properties = schema.properties;
  if (!properties || typeof properties !== 'object' || Array.isArray(properties)) return [];
  const required = new Set(
    Array.isArray(schema.required)
      ? schema.required.filter((item): item is string => typeof item === 'string')
      : [],
  );
  return Object.entries(properties).map(([name, prop]) => {
    let type = 'any';
    if (prop && typeof prop === 'object' && 'type' in prop) {
      const raw = (prop as { type?: unknown }).type;
      if (typeof raw === 'string') type = raw;
      else if (Array.isArray(raw)) {
        const names = raw.filter((item): item is string => typeof item === 'string');
        if (names.length > 0) type = names.join(' | ');
      }
    }
    return { name, type, required: required.has(name) };
  });
}

function offlineFromError(message: string): ServerStatus {
  return {
    mcp: 'offline',
    latency_ms: null,
    server_name: null,
    server_version: null,
    protocol_version: null,
    uptime_seconds: 0,
    tools: [],
    error: message,
  };
}

function StatusSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading server status">
      <div className="h-32 animate-pulse rounded-2xl bg-white/5" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <div className="h-44 animate-pulse rounded-2xl bg-white/5" />
        <div className="h-44 animate-pulse rounded-2xl bg-white/5" />
        <div className="h-44 animate-pulse rounded-2xl bg-white/5" />
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-28">
      <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/45">{label}</dt>
      <dd className="mt-1 text-sm text-[#D9D9D9]">{value}</dd>
    </div>
  );
}

function ToolCard({ tool }: { tool: ToolStatus }) {
  const fields = fieldsFromSchema(tool.input_schema);
  return (
    <article className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <div>
        <h2 className="font-mono text-base text-white">{tool.name}</h2>
        <p className="mt-2 text-sm leading-relaxed text-[#D9D9D9]">
          {tool.description?.trim() || 'No description'}
        </p>
      </div>
      {fields.length === 0 ? (
        <p className="text-xs uppercase tracking-[0.14em] text-white/40">No inputs</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {fields.map((field) => (
            <li
              key={field.name}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 px-3 py-2"
            >
              <span className="font-mono text-sm text-white">{field.name}</span>
              <span className="text-xs uppercase tracking-[0.12em] text-[#D9D9D9]">{field.type}</span>
              <span className={field.required ? 'text-xs text-[#FE6E44]' : 'text-xs text-white/40'}>
                {field.required ? 'required' : 'optional'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

export function StatusView() {
  const [status, setStatus] = useState<ServerStatus | null>(null);
  const loadRef = useRef<() => void>(() => {});

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const next = await getStatus();
        if (cancelled) return;
        setStatus(next);
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'Status request failed';
        setStatus(offlineFromError(message));
      }
    };

    loadRef.current = () => {
      void load();
    };
    void load();
    const id = window.setInterval(() => {
      void load();
    }, 10_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  if (status === null) return <StatusSkeleton />;

  const online = status.mcp === 'online';
  const latency = status.latency_ms === null ? '—' : `${status.latency_ms} ms`;
  const server =
    status.server_name === null
      ? '—'
      : `${status.server_name}${status.server_version ? ` ${status.server_version}` : ''}`;

  return (
    <section className="flex flex-col gap-6" aria-label="Server status">
      <div className="flex flex-wrap items-center gap-6 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <div className="flex items-center gap-3" aria-live="polite">
          <span
            className={`h-4 w-4 rounded-full ${online ? 'bg-[#7CFF4F]' : 'bg-[#ff4444]'}`}
            aria-hidden="true"
          />
          <p className="font-[family-name:var(--font-display)] text-3xl tracking-wide sm:text-4xl">
            {online ? 'ONLINE' : 'OFFLINE'}
          </p>
        </div>
        <dl className="flex flex-1 flex-wrap gap-x-8 gap-y-3">
          <Metric label="Latency" value={latency} />
          <Metric label="Server" value={server} />
          <Metric label="Protocol" value={status.protocol_version ?? '—'} />
          <Metric label="Uptime" value={formatUptime(status.uptime_seconds)} />
        </dl>
        <button
          type="button"
          onClick={() => loadRef.current()}
          className="rounded-full border border-[#FE6E44] px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#FE6E44] transition hover:bg-[#FE6E44] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FE6E44]"
        >
          Refresh
        </button>
      </div>

      {status.error ? (
        <p role="alert" className="rounded-xl border border-[#ff4444]/40 bg-[#ff4444]/10 px-4 py-3 text-sm text-[#ffb4b4]">
          {status.error}
        </p>
      ) : null}

      {status.tools.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {status.tools.map((tool) => (
            <ToolCard key={tool.name} tool={tool} />
          ))}
        </div>
      ) : null}
    </section>
  );
}
