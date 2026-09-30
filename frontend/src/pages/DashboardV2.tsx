import { StatusView } from '../components/dashboard-v2/views/StatusView';

export function DashboardV2() {
  return (
    <main className="min-h-screen bg-black px-4 py-8 text-white sm:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-8">
        <header>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#FE6E44]">Polaris</p>
          <h1 className="font-[family-name:var(--font-display)] text-3xl tracking-wide sm:text-4xl">
            Server Status
          </h1>
        </header>
        <StatusView />
      </div>
    </main>
  );
}
