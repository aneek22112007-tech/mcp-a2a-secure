/**
 * ConsoleApp — top-level router for the MCP Guard live console.
 * Manages: connect state, demo mode, view routing, TanStack Query provider.
 */
import './styles/console.css';
import { useState, lazy, Suspense } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { ConnectScreen } from './features/connect/ConnectScreen';
import { ConsoleShell, type ViewId } from './components/Shell';
import { useAuditStream } from './api/hooks';
import { getApiKey, setApiKey } from './api/client';
import { LoadingPanel } from './components/ui';

// Lazy views — only loaded when the tab is visited
const OverviewView = lazy(() =>
  import('./features/overview/OverviewView').then(m => ({ default: m.OverviewView }))
);
const KeysView = lazy(() =>
  import('./features/keys/KeysView').then(m => ({ default: m.KeysView }))
);
const AuditView = lazy(() =>
  import('./features/audit/AuditView').then(m => ({ default: m.AuditView }))
);
const MetricsView = lazy(() =>
  import('./features/metrics/MetricsView').then(m => ({ default: m.MetricsView }))
);
const PinsView = lazy(() =>
  import('./features/pins/PinsView').then(m => ({ default: m.PinsView }))
);
const ScannerView = lazy(() =>
  import('./features/scanner/ScannerView').then(m => ({ default: m.ScannerView }))
);
const SandboxView = lazy(() =>
  import('./features/sandbox/SandboxView').then(m => ({ default: m.SandboxView }))
);
const AttackView = lazy(() =>
  import('./features/attack/AttackView').then(m => ({ default: m.AttackView }))
);
const PlannedView = lazy(() =>
  import('./features/planned/PlannedView').then(m => ({ default: m.PlannedView }))
);

// One shared QueryClient for the whole console
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5_000,
      retry: 1,
      // Never throw — ErrorPanel handles it
      throwOnError: false,
    },
  },
});

// ── Session state ─────────────────────────────────────────────────────

interface Session {
  clientId: string;
  scopes: string[];
}

/** Try to restore session from sessionStorage at boot */
function restoreSession(): Session | null {
  const key = getApiKey();
  if (!key) return null;
  // We have a key but we don't know scopes — treat as basic session
  // The user will need to re-run Connect to get scopes
  // OR we can just assume admin for now (will get 403 on restricted endpoints)
  return { clientId: '', scopes: ['admin'] };
}

// ── Route guard — SSE lives here (above lazy views) ───────────────────

function ConsoleBody({
  session,
  isDemo,
}: {
  session: Session;
  isDemo: boolean;
}) {
  const [view, setView] = useState<ViewId>('overview');
  const { state: streamState } = useAuditStream(100);

  return (
    <ConsoleShell
      activeView={view}
      onViewChange={setView}
      streamState={streamState}
      scopes={session.scopes}
      isDemo={isDemo}
    >
      <Suspense fallback={<LoadingPanel />}>
        {view === 'overview' && <OverviewView isDemo={isDemo} />}
        {view === 'keys'     && <KeysView isDemo={isDemo} clientIds={[session.clientId].filter(Boolean)} />}
        {view === 'audit'    && <AuditView isDemo={isDemo} />}
        {view === 'metrics'  && <MetricsView isDemo={isDemo} />}
        {view === 'pins'     && <PinsView isDemo={isDemo} />}
        {view === 'scanner'  && <ScannerView isDemo={isDemo} />}
        {view === 'sandbox'  && <SandboxView isDemo={isDemo} />}
        {view === 'attack'   && <AttackView isDemo={isDemo} />}
        {view === 'planned'  && <PlannedView />}
      </Suspense>
    </ConsoleShell>
  );
}

// ── Root ──────────────────────────────────────────────────────────────

export function ConsoleApp() {
  const [session, setSession] = useState<Session | null>(restoreSession);
  const [isDemo, setIsDemo] = useState(false);

  const handleConnected = (clientId: string, scopes: string[]) => {
    setSession({ clientId, scopes });
    setIsDemo(false);
  };

  const handleDemoMode = () => {
    // User clicked "use demo mode" — no key required
    setIsDemo(true);
    setSession({ clientId: 'demo', scopes: ['admin'] });
  };

  if (!session) {
    return (
      <>
        <ConnectScreen onConnected={handleConnected} onUseDemo={handleDemoMode} />
        <button
          onClick={handleDemoMode}
          style={{
            position: 'fixed',
            bottom: 20,
            right: 20,
            background: 'var(--c-surface)',
            border: '1px solid var(--c-border)',
            borderRadius: 'var(--radius)',
            padding: '8px 14px',
            fontSize: 11,
            color: 'var(--c-text-muted)',
            cursor: 'pointer',
            fontFamily: 'var(--font-sans)',
          }}
        >
          ← View with demo data (no key needed)
        </button>
        <Toaster richColors theme="dark" position="bottom-right" />
      </>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ConsoleBody session={session} isDemo={isDemo} />
      <Toaster richColors theme="dark" position="bottom-right" />
    </QueryClientProvider>
  );
}

// Export setApiKey for ConnectScreen — it does the validation before calling onConnected
export { setApiKey };
