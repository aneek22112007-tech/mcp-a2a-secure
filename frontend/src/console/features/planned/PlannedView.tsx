import { HelpCircle, Layers, Bot, Shield, Brain } from 'lucide-react';

export function PlannedView() {
  const planned = [
    {
      icon: Layers,
      title: 'A2A Agent Delegation',
      description:
        'Agent-to-agent trust chains with scope inheritance and delegation audit trails. Sub-agents receive attenuated scopes — no privilege escalation across hops.',
      block: 'Block 7',
    },
    {
      icon: Bot,
      title: 'LLM Agent Integration',
      description:
        'Connect an LLM-driven agent that calls MCP tools through the gateway. Each tool call passes through the full security stack and appears in audit.',
      block: 'Block 8',
    },
    {
      icon: Shield,
      title: 'Injection Guard',
      description:
        'Runtime prompt-injection detection beyond static scanner rules. Monitors tool arguments in flight and blocks calls that carry injection payloads.',
      block: 'Block 8',
    },
    {
      icon: Brain,
      title: 'AI Analyst',
      description:
        'An on-device language model that reads the audit stream, correlates events, and surfaces anomalies — e.g. a single key making calls at unusual hours.',
      block: 'Block 9',
    },
  ];

  return (
    <div className="console-page">
      <div>
        <h1
          style={{
            fontSize: 15,
            fontWeight: 700,
            letterSpacing: '-0.02em',
            color: 'var(--c-text)',
            margin: 0,
          }}
        >
          Planned Features
        </h1>
        <p style={{ fontSize: 11, color: 'var(--c-text-muted)', margin: '2px 0 0' }}>
          A2A agents and delegation, LLM agent, injection guard, AI analyst: planned for Blocks 7–9.
        </p>
      </div>

      <div
        className="panel"
        style={{
          padding: '10px 14px',
          display: 'flex',
          gap: 8,
          alignItems: 'center',
        }}
      >
        <HelpCircle size={13} style={{ color: 'var(--c-info)', flexShrink: 0 }} />
        <span style={{ fontSize: 11, color: 'var(--c-text-muted)', lineHeight: 1.5 }}>
          These panels are text-only. No fake data, no fake graphs. All numbers shown in the
          rest of the console come from the real backend.
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {planned.map(({ icon: Icon, title, description, block }) => (
          <div
            key={title}
            className="panel"
            style={{
              padding: 20,
              display: 'grid',
              gridTemplateColumns: '40px 1fr',
              gap: 16,
              alignItems: 'start',
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                border: '1px solid var(--c-border-2)',
                borderRadius: 'var(--radius)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon size={16} style={{ color: 'var(--c-text-muted)' }} />
            </div>
            <div>
              <div
                style={{
                  display: 'flex',
                  gap: 10,
                  alignItems: 'center',
                  marginBottom: 6,
                }}
              >
                <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--c-text)' }}>
                  {title}
                </span>
                <span className="badge badge-muted" style={{ fontSize: 9 }}>{block}</span>
              </div>
              <p
                style={{
                  fontSize: 12,
                  color: 'var(--c-text-muted)',
                  margin: 0,
                  lineHeight: 1.6,
                }}
              >
                {description}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
