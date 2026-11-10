import { ArrowUpRight, Bot, Brain, HardDrive, Layers, ScanSearch, Shield } from 'lucide-react';

type Item = {
  icon: typeof Shield;
  title: string;
  description: string;
  links?: { label: string; href: string }[];
  target?: string;
};

const LIVE: Item[] = [
  {
    icon: Shield,
    title: 'Injection guard',
    description:
      'Checks tool output for prompt-injection payloads before it reaches the agent. In enforce mode a match is blocked and written to the audit log as tool.output.injection.',
    links: [
      { label: 'Guard counters in Metrics', href: '#/metrics' },
      { label: 'Blocked events in Live Audit', href: '#/audit' },
    ],
  },
  {
    icon: Bot,
    title: 'LLM notes agent',
    description:
      'An LLM-driven agent that calls the notes tools through the gateway. Every call passes auth, scope, rate limit, pin and guard checks and is audited like any other client.',
    links: [
      { label: 'LLM availability and latency in Metrics', href: '#/metrics' },
      { label: 'Agent tool calls in Live Audit', href: '#/audit' },
    ],
  },
  {
    icon: HardDrive,
    title: 'Filesystem upstream',
    description:
      'The official filesystem MCP server is registered as fs_ tools. Each call runs in its own locked-down container. files:read and files:write are checked at /mcp/, and the published schema is pinned.',
    links: [
      { label: 'Runs in Sandbox', href: '#/sandbox' },
      { label: 'Fingerprints in Tool Pinning', href: '#/pins' },
    ],
  },
  {
    icon: Layers,
    title: 'A2A delegation',
    description:
      'Agent-to-agent calls with scope attenuation at each hop and a delegation chain recorded in the audit log.',
    links: [
      { label: 'a2a.* events in Live Audit', href: '#/audit' },
    ],
  },
];

const UPCOMING: Item[] = [
  {
    icon: ScanSearch,
    title: 'AI-assisted scanner',
    description:
      'A model-based pass over tool descriptions and schemas that adds to the current rule-based findings.',
    target: 'Block 9',
  },
  {
    icon: Brain,
    title: 'AI analyst',
    description:
      'Reads the audit stream, groups related events and flags unusual patterns, such as a key active outside its normal hours.',
    target: 'Block 9',
  },
];

function Row({ item, live }: { item: Item; live: boolean }) {
  const Icon = item.icon;
  return (
    <li className="roadmap-row">
      <span className="roadmap-icon" aria-hidden><Icon size={15} /></span>
      <div style={{ minWidth: 0 }}>
        <div className="roadmap-title">
          <span>{item.title}</span>
          {live
            ? <span className="badge badge-allow">Live</span>
            : <span className="badge badge-muted">Upcoming{item.target ? ` · ${item.target}` : ''}</span>}
        </div>
        <p className="roadmap-desc">{item.description}</p>
        {item.links && (
          <div className="roadmap-links">
            {item.links.map(l => (
              <a key={l.label} href={l.href} className="text-link">
                {l.label} <ArrowUpRight size={12} aria-hidden />
              </a>
            ))}
          </div>
        )}
      </div>
    </li>
  );
}

export function PlannedView() {
  return (
    <div className="console-page">
      <header className="page-header">
        <div>
          <h1 className="page-title">Roadmap</h1>
          <p className="page-sub">What is running in this gateway today and what is planned next.</p>
        </div>
      </header>

      <section className="panel">
        <div className="panel-head"><h2 className="section-label" style={{ margin: 0 }}>Live</h2></div>
        <ul className="roadmap-list">{LIVE.map(i => <Row key={i.title} item={i} live />)}</ul>
      </section>

      <section className="panel">
        <div className="panel-head"><h2 className="section-label" style={{ margin: 0 }}>Upcoming</h2></div>
        <ul className="roadmap-list">{UPCOMING.map(i => <Row key={i.title} item={i} live={false} />)}</ul>
      </section>
    </div>
  );
}
