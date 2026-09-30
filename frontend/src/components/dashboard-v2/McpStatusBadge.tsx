import { useEffect, useState } from 'react';
import { getStatus, type ServerStatus } from '../../lib/mcpApi';

export function McpStatusBadge() {
  const [status, setStatus] = useState<ServerStatus | null>(null);
  const [unreachable, setUnreachable] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const next = await getStatus();
        if (cancelled) return;
        setStatus(next);
        setUnreachable(false);
      } catch {
        if (cancelled) return;
        setStatus(null);
        setUnreachable(true);
      }
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

  const online = status?.mcp === 'online';
  const latencyLabel =
    online && status?.latency_ms != null ? `${status.latency_ms} ms` : 'unavailable';
  const tooltip = `Latency ${latencyLabel}`;

  return (
    <span className="group relative inline-flex">
      <span
        title={tooltip}
        className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.03] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em]"
      >
        <span
          className={`h-2 w-2 rounded-full ${online ? 'bg-[#7CFF4F]' : 'bg-[#ff4444]'}`}
          aria-hidden="true"
        />
        <span>{online ? 'MCP online' : unreachable || status ? 'MCP offline' : 'MCP checking'}</span>
      </span>
      <span
        role="tooltip"
        className="pointer-events-none absolute top-full left-1/2 z-10 mt-2 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-white/10 bg-black px-2 py-1 text-[11px] font-normal normal-case tracking-normal text-[#D9D9D9] group-hover:block"
      >
        {tooltip}
      </span>
    </span>
  );
}
