/**
 * ConsoleApp — connect state, live/demo switch, and view routing.
 */
import './styles/console.css';
import './styles/premium.css';
import { useEffect, useState, lazy, Suspense } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { ConnectScreen } from './features/connect/ConnectScreen';
import { ConsoleShell } from './components/Shell';
import { VIEW_IDS, type ViewId } from './components/views';
import { useAuditStream } from './api/hooks';
import { consoleApi, detectAccess, forgetApiKey, getApiKey } from './api/client';
import { LoadingPanel } from './components/ui';

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

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5_000,
      retry: 0,
      throwOnError: false,
    },
  },
});

interface Session {
  clientId: string;
  scopes: string[];
}

function readHashView(): ViewId {
  const id = window.location.hash.replace(/^#\/?/, '') as ViewId;
  return VIEW_IDS.includes(id) ? id : 'overview';
}

function ConsoleBody({
  session,
  isDemo,
  backendUp,
}: {
  session: Session;
  isDemo: boolean;
  backendUp: boolean;
}) {
  const [view, setViewState] = useState<ViewId>(readHashView);

  // Keep the active view in the URL hash so refresh and deep links work.
  useEffect(() => {
    const onHash = () => setViewState(readHashView());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const setView = (next: ViewId) => {
    setViewState(next);
    const hash = `#/${next}`;
    if (window.location.hash !== hash) window.history.pushState(null, '', hash);
  };

  useEffect(() => {
    const label = view.charAt(0).toUpperCase() + view.slice(1);
    document.title = `${label} · MCP Guard Console`;
  }, [view]);

  const { state: streamState } = useAuditStream(100, !isDemo && backendUp);

  return (
    <ConsoleShell
      activeView={view}
      onViewChange={setView}
      streamState={isDemo ? 'offline' : streamState}
      scopes={session.scopes}
      isDemo={isDemo}
      backendUp={backendUp}
    >
      <Suspense fallback={<LoadingPanel />}>
        {view === 'overview' && <OverviewView isDemo={isDemo} />}
        {view === 'keys' && <KeysView isDemo={isDemo} clientIds={session.clientId ? [session.clientId] : []} />}
        {view === 'audit' && <AuditView isDemo={isDemo} />}
        {view === 'metrics' && <MetricsView isDemo={isDemo} />}
        {view === 'pins' && <PinsView isDemo={isDemo} />}
        {view === 'scanner' && <ScannerView isDemo={isDemo} />}
        {view === 'sandbox' && <SandboxView isDemo={isDemo} />}
        {view === 'attack' && <AttackView isDemo={isDemo} />}
        {view === 'planned' && <PlannedView />}
      </Suspense>
    </ConsoleShell>
  );
}

export function ConsoleApp() {
  const [session, setSession] = useState<Session | null>(null);
  const [backendUp, setBackendUp] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        await consoleApi.health();
        if (!cancelled) setBackendUp(true);
      } catch {
        if (!cancelled) setBackendUp(false);
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), 8000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    if (backendUp !== true || session || !getApiKey()) return;
    let cancelled = false;
    detectAccess()
      .then(detected => {
        if (!cancelled) {
          setSession({ clientId: detected.clientId, scopes: detected.scopes });
        }
      })
      .catch(() => {
        forgetApiKey();
      });
    return () => { cancelled = true; };
  }, [backendUp, session]);

  const offline = backendUp === false;
  const isDemo = offline;

  if (backendUp === null) {
    return (
      <div className="boot-screen" role="status">
        Checking backend…
      </div>
    );
  }

  if (!session) {
    return (
      <>
        <ConnectScreen
          onConnected={(clientId, scopes) => {
            setSession({ clientId, scopes });
          }}
        />
        <Toaster richColors theme="dark" position="bottom-right" />
      </>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ConsoleBody session={session} isDemo={isDemo} backendUp={backendUp === true} />
      <Toaster richColors theme="dark" position="bottom-right" />
    </QueryClientProvider>
  );
}

