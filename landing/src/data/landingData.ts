// MCP Guard Landing Page — All Data

export interface SecurityMetric {
  label: string
  value: string
  unit?: string
  status: 'green' | 'warn' | 'critical' | 'neutral'
}

export interface Tool {
  name: string
  status: 'allowed' | 'blocked' | 'warning'
  latency: number
  calls: number
}

export interface ScannerFinding {
  id: string
  name: string
  severity: 'PASS' | 'WARNING' | 'CRITICAL'
  description: string
}

export interface A2AEvent {
  timestamp: string
  event: string
  status: 'verified' | 'blocked' | 'pending'
}

export interface SecurityEvent {
  timestamp: string
  tool: string
  action: string
  status: 'allowed' | 'blocked' | 'verified'
  latency?: number
}

export interface PipelineStage {
  id: string
  label: string
  sublabel?: string
  status: 'idle' | 'active' | 'pass' | 'fail'
}

export const HERO_METRICS: SecurityMetric[] = [
  { label: 'Connected Tools', value: '8', status: 'green' },
  { label: 'Security Checks', value: '10/10', status: 'green' },
  { label: 'Critical Findings', value: '0', status: 'green' },
  { label: 'A2A Handoff', value: 'VERIFIED', status: 'green' },
]

export const RUNTIME_METRICS: SecurityMetric[] = [
  { label: 'Connected Tools', value: '8', status: 'green' },
  { label: 'Security Checks', value: '10/10', status: 'green' },
  { label: 'Critical Findings', value: '0', status: 'green' },
  { label: 'Demo RTT', value: '14ms', status: 'green' },
]

export const LATENCY_DATA = [
  { t: '0s',  v: 12 },
  { t: '2s',  v: 14 },
  { t: '4s',  v: 11 },
  { t: '6s',  v: 16 },
  { t: '8s',  v: 13 },
  { t: '10s', v: 15 },
  { t: '12s', v: 12 },
  { t: '14s', v: 14 },
  { t: '16s', v: 11 },
  { t: '18s', v: 13 },
]

export const TOOLS: Tool[] = [
  { name: 'fs.read_file',   status: 'allowed',  latency: 11, calls: 142 },
  { name: 'search_notes',   status: 'allowed',  latency: 8,  calls: 87  },
  { name: 'bash.run',       status: 'blocked',  latency: 3,  calls: 12  },
  { name: 'web.fetch',      status: 'allowed',  latency: 18, calls: 63  },
  { name: 'a2a.handoff',    status: 'allowed',  latency: 14, calls: 34  },
  { name: 'db.query',       status: 'allowed',  latency: 22, calls: 55  },
  { name: 'email.send',     status: 'warning',  latency: 9,  calls: 4   },
  { name: 'sys.exec',       status: 'blocked',  latency: 1,  calls: 3   },
]

export const PIPELINE_STAGES: PipelineStage[] = [
  { id: 'request',   label: 'REQUEST',   sublabel: 'AI Agent',         status: 'idle' },
  { id: 'auth',      label: 'AUTH',      sublabel: 'API-Key Allowlist', status: 'idle' },
  { id: 'schema',    label: 'SCHEMA',    sublabel: 'SHA-256 Verify',    status: 'idle' },
  { id: 'policy',    label: 'POLICY',    sublabel: 'Scope Check',       status: 'idle' },
  { id: 'sandbox',   label: 'SANDBOX',   sublabel: 'Docker Isolate',    status: 'idle' },
  { id: 'execution', label: 'EXECUTION', sublabel: 'Tool Run',          status: 'idle' },
  { id: 'audit',     label: 'AUDIT',     sublabel: 'SQLite + SSE',      status: 'idle' },
]

export const SCANNER_FINDINGS: ScannerFinding[] = [
  { id: 'MCP-01', name: 'Command Injection',   severity: 'PASS',    description: 'Input sanitization validated' },
  { id: 'MCP-02', name: 'Path Traversal',      severity: 'PASS',    description: 'Filesystem boundary enforced' },
  { id: 'MCP-03', name: 'Tool Poisoning',      severity: 'WARNING', description: 'Fingerprint mismatch detected' },
  { id: 'MCP-04', name: 'Authentication',      severity: 'PASS',    description: 'API-key allowlist active' },
  { id: 'MCP-05', name: 'Excessive Privileges',severity: 'PASS',    description: 'Least-privilege enforced' },
  { id: 'MCP-06', name: 'Schema Drift',        severity: 'PASS',    description: 'Hash matches pinned baseline' },
  { id: 'MCP-07', name: 'Network Isolation',   severity: 'PASS',    description: 'No external calls permitted' },
]

export const SECURITY_EVENTS: SecurityEvent[] = [
  { timestamp: '14:32:08', tool: 'fs.read_file',  action: 'tool invoked',     status: 'allowed',  latency: 11 },
  { timestamp: '14:32:09', tool: 'search_notes',  action: 'policy verified',  status: 'allowed',  latency: 8  },
  { timestamp: '14:32:09', tool: 'bash.run',       action: 'policy blocked',   status: 'blocked'              },
  { timestamp: '14:32:10', tool: 'a2a.handoff',   action: 'delegation signed',status: 'verified', latency: 14 },
  { timestamp: '14:32:11', tool: 'web.fetch',      action: 'sandbox created',  status: 'allowed',  latency: 18 },
  { timestamp: '14:32:12', tool: 'db.query',       action: 'audit recorded',   status: 'allowed',  latency: 22 },
]

export const A2A_EVENTS: A2AEvent[] = [
  { timestamp: '14:32:08', event: 'Agent Card received',     status: 'verified' },
  { timestamp: '14:32:09', event: 'Ed25519 signature valid', status: 'verified' },
  { timestamp: '14:32:09', event: 'Delegation scope checked',status: 'verified' },
  { timestamp: '14:32:10', event: 'Task envelope signed',    status: 'verified' },
  { timestamp: '14:32:10', event: 'Sandbox activated',       status: 'verified' },
  { timestamp: '14:32:11', event: 'Result attested',         status: 'verified' },
]

export const CORE_FEATURES = [
  {
    number: '01',
    title: 'SANDBOXED\nEXECUTION',
    description: 'Docker-based isolated tool execution with restricted filesystem, network controls, resource limits, and least-privilege containment.',
    tags: ['Docker', 'Filesystem', 'Network', 'Resources'],
  },
  {
    number: '02',
    title: 'SCHEMA\nINTEGRITY',
    description: 'SHA-256 fingerprints, version verification, schema drift detection, tamper detection, and automatic freeze on mismatch.',
    tags: ['SHA-256', 'Versioning', 'Drift', 'Freeze'],
  },
  {
    number: '03',
    title: 'SECURITY\nSCANNER',
    description: 'OWASP MCP coverage, static analysis, threat detection, evidence-based findings, and security policy enforcement.',
    tags: ['OWASP', 'Static Analysis', 'Threat', 'Policy'],
  },
  {
    number: '04',
    title: 'A2A\nDELEGATION',
    description: 'Agent Cards, Ed25519 signatures, delegation scopes, signed task envelopes, and cryptographic attestation.',
    tags: ['Agent Cards', 'Ed25519', 'Scopes', 'Attestation'],
  },
]

export const ZERO_TRUST_CHECKS = [
  { label: 'SCOPE CHECK',  status: 'PASS',     icon: 'shield' },
  { label: 'SCHEMA HASH',  status: 'MATCH',    icon: 'hash' },
  { label: 'NETWORK',      status: 'ISOLATED', icon: 'wifi-off' },
  { label: 'FILESYSTEM',   status: 'RESTRICTED',icon: 'lock' },
  { label: 'AUDIT',        status: 'RECORDED', icon: 'file-text' },
]
