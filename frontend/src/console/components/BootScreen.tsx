import { Monitor, Shield } from 'lucide-react';
import { useEffect, useState } from 'react';
import { getApiBase } from '../api/client';
import './boot.css';

function useElapsedMs() {
  const [ms, setMs] = useState(0);
  useEffect(() => {
    const start = performance.now();
    const id = window.setInterval(() => setMs(performance.now() - start), 250);
    return () => window.clearInterval(id);
  }, []);
  return ms;
}

function hostOf(base: string) {
  try { return new URL(base).host; } catch { return base; }
}

/** Shown while the first /health request is pending (it times out after 60 s). */
export function BootScreen() {
  const s = Math.floor(useElapsedMs() / 1000);
  const slow = s >= 5;
  return (
    <main className="boot-screen boot-d" role="status" aria-live="polite">
      <div className="boot-d-wrap">
        <div className="boot-d-path" aria-hidden>
          <div className="boot-d-node">
            <span className="boot-d-icon"><Monitor size={18} strokeWidth={1.8} /></span>
            <span className="boot-d-label">Console</span>
          </div>
          <div className="boot-d-line">
            <span className="boot-d-packet" />
            <span className="boot-d-packet boot-d-packet-2" />
          </div>
          <div className="boot-d-node">
            <span className={`boot-d-icon boot-d-gate${slow ? ' is-slow' : ''}`}><Shield size={18} strokeWidth={2} color="#0B0C0D" /></span>
            <span className="boot-d-label">{hostOf(getApiBase())}</span>
          </div>
        </div>
        <div className="boot-wordmark">MCP GUARD</div>
        <p className="boot-d-status">
          {slow
            ? 'No reply yet. The server may be waking up, which can take up to a minute.'
            : 'Request sent to /health, waiting for a reply.'}
        </p>
        <p className="boot-d-time">{s}s</p>
      </div>
    </main>
  );
}
