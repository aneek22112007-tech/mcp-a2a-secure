/**
 * Mock data architecture for MCP-A2A Dashboard
 * Structured to match expected backend API responses
 */

export type ServerStatus = 'operational' | 'warning' | 'critical' | 'offline';
export type AgentStatus = 'active' | 'idle' | 'offline';
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type FindingSeverity = 'low' | 'medium' | 'high' | 'critical';
export type EventType = 'tool_call' | 'policy' | 'scan' | 'a2a_connection' | 'anomaly' | 'auth' | 'block';

export interface MCPServer {
  id: string;
  name: string;
  version: string;
  status: ServerStatus;
  tools: number;
  lastScan: string;
  riskLevel: RiskLevel;
  lastActivity: string;
  description?: string;
  endpoint?: string;
}

export interface Agent {
  id: string;
  name: string;
  status: AgentStatus;
  connections: number;
  toolCalls: number;
  riskLevel: RiskLevel;
  lastActivity: string;
  connectedServers: string[];
}

export interface Tool {
  id: string;
  name: string;
  serverId: string;
  category: string;
  callCount: number;
  riskLevel: RiskLevel;
  lastUsed: string;
}

export interface SecurityEvent {
  id: string;
  timestamp: string;
  type: EventType;
  action: string;
  source: string;
  status: 'allowed' | 'blocked' | 'verified' | 'detected' | 'completed';
  riskLevel?: RiskLevel;
}

export interface SecurityFinding {
  id: string;
  severity: FindingSeverity;
  type: string;
  title: string;
  resource: string;
  details: string;
  detectedAt: string;
  status: 'open' | 'investigating' | 'resolved';
}

export interface Policy {
  id: string;
  name: string;
  type: string;
  status: 'active' | 'inactive';
  rules: number;
  lastModified: string;
}

export interface ActivityMetrics {
  timestamp: string;
  toolCalls: number;
  blockedRequests: number;
  policyViolations: number;
  anomalies: number;
  connections: number;
}

export interface SystemMetrics {
  securityScore: number;
  activeServers: number;
  activeAgents: number;
  activeFindings: number;
  criticalFindings: number;
  highFindings: number;
  mediumFindings: number;
  blockedRequests: number;
  verifiedConnections: number;
  riskLevel: RiskLevel;
  lastScan: string;
  systemStatus: 'operational' | 'warning' | 'critical';
}

// Generate timestamps
const now = new Date();
const getTimeAgo = (minutesAgo: number) => {
  const d = new Date(now.getTime() - minutesAgo * 60000);
  return d.toISOString();
};

const formatTimeAgo = (minutesAgo: number) => {
  if (minutesAgo < 1) return 'Just now';
  if (minutesAgo < 60) return `${Math.floor(minutesAgo)}m ago`;
  if (minutesAgo < 1440) return `${Math.floor(minutesAgo / 60)}h ago`;
  return `${Math.floor(minutesAgo / 1440)}d ago`;
};

// Mock Servers
export const mockServers: MCPServer[] = [
  {
    id: 'srv-001',
    name: 'production-filesystem',
    version: 'v1.4.2',
    status: 'operational',
    tools: 18,
    lastScan: formatTimeAgo(2),
    riskLevel: 'low',
    lastActivity: formatTimeAgo(1),
    description: 'Production filesystem access server',
    endpoint: 'fs://prod.mcp.local:8443',
  },
  {
    id: 'srv-002',
    name: 'database-agent',
    version: 'v2.1.0',
    status: 'operational',
    tools: 31,
    lastScan: formatTimeAgo(5),
    riskLevel: 'medium',
    lastActivity: formatTimeAgo(3),
    description: 'Database query and management',
    endpoint: 'db://postgres.mcp.local:5432',
  },
  {
    id: 'srv-003',
    name: 'external-search',
    version: 'v1.0.8',
    status: 'operational',
    tools: 12,
    lastScan: formatTimeAgo(12),
    riskLevel: 'low',
    lastActivity: formatTimeAgo(8),
    description: 'External API search aggregator',
    endpoint: 'https://search.mcp.local',
  },
  {
    id: 'srv-004',
    name: 'code-analysis',
    version: 'v3.2.1',
    status: 'operational',
    tools: 24,
    lastScan: formatTimeAgo(7),
    riskLevel: 'low',
    lastActivity: formatTimeAgo(4),
    description: 'Static code analysis and security scanning',
    endpoint: 'code://analyzer.mcp.local:9000',
  },
  {
    id: 'srv-005',
    name: 'ml-inference',
    version: 'v2.0.0',
    status: 'warning',
    tools: 15,
    lastScan: formatTimeAgo(15),
    riskLevel: 'medium',
    lastActivity: formatTimeAgo(2),
    description: 'Machine learning model inference',
    endpoint: 'ml://inference.mcp.local:8080',
  },
  {
    id: 'srv-006',
    name: 'auth-service',
    version: 'v4.1.3',
    status: 'operational',
    tools: 8,
    lastScan: formatTimeAgo(3),
    riskLevel: 'low',
    lastActivity: formatTimeAgo(0.5),
    description: 'Authentication and authorization',
    endpoint: 'auth://iam.mcp.local:4433',
  },
  {
    id: 'srv-007',
    name: 'notification-hub',
    version: 'v1.7.0',
    status: 'operational',
    tools: 9,
    lastScan: formatTimeAgo(20),
    riskLevel: 'low',
    lastActivity: formatTimeAgo(6),
    description: 'Multi-channel notification system',
    endpoint: 'notify://hub.mcp.local:3000',
  },
  {
    id: 'srv-008',
    name: 'vector-db',
    version: 'v1.5.4',
    status: 'operational',
    tools: 22,
    lastScan: formatTimeAgo(4),
    riskLevel: 'low',
    lastActivity: formatTimeAgo(1),
    description: 'Vector database for embeddings',
    endpoint: 'vector://db.mcp.local:6333',
  },
];

// Mock Agents
export const mockAgents: Agent[] = [
  {
    id: 'agent-07',
    name: 'Document Processor',
    status: 'active',
    connections: 14,
    toolCalls: 482,
    riskLevel: 'low',
    lastActivity: formatTimeAgo(0.5),
    connectedServers: ['srv-001', 'srv-003', 'srv-008'],
  },
  {
    id: 'agent-12',
    name: 'Data Analyzer',
    status: 'active',
    connections: 8,
    toolCalls: 301,
    riskLevel: 'medium',
    lastActivity: formatTimeAgo(1),
    connectedServers: ['srv-002', 'srv-004'],
  },
  {
    id: 'agent-21',
    name: 'Code Review Bot',
    status: 'idle',
    connections: 2,
    toolCalls: 41,
    riskLevel: 'low',
    lastActivity: formatTimeAgo(45),
    connectedServers: ['srv-004', 'srv-007'],
  },
  {
    id: 'agent-04',
    name: 'Security Scanner',
    status: 'active',
    connections: 11,
    toolCalls: 1284,
    riskLevel: 'low',
    lastActivity: formatTimeAgo(2),
    connectedServers: ['srv-001', 'srv-002', 'srv-004', 'srv-006'],
  },
  {
    id: 'agent-09',
    name: 'API Gateway',
    status: 'active',
    connections: 19,
    toolCalls: 2103,
    riskLevel: 'medium',
    lastActivity: formatTimeAgo(0.2),
    connectedServers: ['srv-003', 'srv-005', 'srv-006'],
  },
  {
    id: 'agent-15',
    name: 'ML Pipeline',
    status: 'active',
    connections: 6,
    toolCalls: 892,
    riskLevel: 'low',
    lastActivity: formatTimeAgo(3),
    connectedServers: ['srv-005', 'srv-008'],
  },
  {
    id: 'agent-18',
    name: 'Query Optimizer',
    status: 'active',
    connections: 4,
    toolCalls: 156,
    riskLevel: 'low',
    lastActivity: formatTimeAgo(12),
    connectedServers: ['srv-002'],
  },
  {
    id: 'agent-23',
    name: 'Content Moderator',
    status: 'idle',
    connections: 3,
    toolCalls: 67,
    riskLevel: 'low',
    lastActivity: formatTimeAgo(120),
    connectedServers: ['srv-003', 'srv-007'],
  },
];

// Mock Security Events (live stream)
export const generateMockEvents = (count: number = 20): SecurityEvent[] => {
  const types: EventType[] = ['tool_call', 'policy', 'scan', 'a2a_connection', 'anomaly', 'auth', 'block'];
  const actions = [
    'filesystem.read',
    'database.query',
    'tool.execute',
    'connection.verify',
    'auth.validate',
    'policy.enforce',
    'scan.complete',
    'unknown-tool',
  ];
  const statuses: SecurityEvent['status'][] = ['allowed', 'blocked', 'verified', 'detected', 'completed'];
  const sources = [...mockAgents.map(a => a.id), ...mockServers.map(s => s.name)];

  return Array.from({ length: count }, (_, i) => ({
    id: `evt-${Date.now()}-${i}`,
    timestamp: formatTimeAgo(i * 0.5),
    type: types[Math.floor(Math.random() * types.length)],
    action: actions[Math.floor(Math.random() * actions.length)],
    source: sources[Math.floor(Math.random() * sources.length)],
    status: statuses[Math.floor(Math.random() * statuses.length)],
    riskLevel: Math.random() > 0.8 ? 'medium' : 'low',
  }));
};

// Mock Security Findings
export const mockFindings: SecurityFinding[] = [
  {
    id: 'find-001',
    severity: 'high',
    type: 'Tool Poisoning',
    title: 'Suspicious tool modification detected',
    resource: 'production-api',
    details: 'Tool: execute_command - Schema hash mismatch detected',
    detectedAt: formatTimeAgo(14),
    status: 'open',
  },
  {
    id: 'find-002',
    severity: 'medium',
    type: 'Unknown Tool',
    title: 'Unregistered tool execution attempt',
    resource: 'external-search',
    details: 'Tool: system.exec - Not in approved tool registry',
    detectedAt: formatTimeAgo(42),
    status: 'investigating',
  },
  {
    id: 'find-003',
    severity: 'medium',
    type: 'Policy Violation',
    title: 'Rate limit exceeded',
    resource: 'database-agent',
    details: 'Agent agent-12 exceeded 500 calls/hour policy',
    detectedAt: formatTimeAgo(128),
    status: 'open',
  },
];

// Mock Policies
export const mockPolicies: Policy[] = [
  {
    id: 'pol-001',
    name: 'OWASP-LLM-01:10 Enforcement',
    type: 'Security Framework',
    status: 'active',
    rules: 24,
    lastModified: formatTimeAgo(1440),
  },
  {
    id: 'pol-002',
    name: 'Tool Call Rate Limiting',
    type: 'Rate Limit',
    status: 'active',
    rules: 8,
    lastModified: formatTimeAgo(2880),
  },
  {
    id: 'pol-003',
    name: 'Zero-Trust Verification',
    type: 'Authentication',
    status: 'active',
    rules: 12,
    lastModified: formatTimeAgo(720),
  },
  {
    id: 'pol-004',
    name: 'Sandbox Isolation',
    type: 'Execution',
    status: 'active',
    rules: 16,
    lastModified: formatTimeAgo(4320),
  },
];

// Mock Activity Metrics (for graphs)
export const generateActivityMetrics = (hours: number = 24): ActivityMetrics[] => {
  const points = hours * 6; // One point every 10 minutes
  const metrics: ActivityMetrics[] = [];
  
  for (let i = points; i >= 0; i--) {
    const minutesAgo = i * 10;
    metrics.push({
      timestamp: getTimeAgo(minutesAgo),
      toolCalls: Math.floor(Math.random() * 50) + 30,
      blockedRequests: Math.floor(Math.random() * 5),
      policyViolations: Math.random() > 0.9 ? Math.floor(Math.random() * 3) : 0,
      anomalies: Math.random() > 0.95 ? 1 : 0,
      connections: Math.floor(Math.random() * 20) + 10,
    });
  }
  
  return metrics;
};

// Mock System Metrics
export const mockSystemMetrics: SystemMetrics = {
  securityScore: 98,
  activeServers: mockServers.filter(s => s.status === 'operational').length,
  activeAgents: mockAgents.filter(a => a.status === 'active').length,
  activeFindings: mockFindings.length,
  criticalFindings: mockFindings.filter(f => f.severity === 'critical').length,
  highFindings: mockFindings.filter(f => f.severity === 'high').length,
  mediumFindings: mockFindings.filter(f => f.severity === 'medium').length,
  blockedRequests: 127,
  verifiedConnections: 1284,
  riskLevel: 'low',
  lastScan: formatTimeAgo(2),
  systemStatus: 'operational',
};

// 3D Topology Node Data
export interface TopologyNode {
  id: string;
  type: 'server' | 'agent' | 'tool';
  name: string;
  status: ServerStatus | AgentStatus;
  riskLevel: RiskLevel;
  position?: [number, number, number];
  connections: string[];
  metadata: {
    toolCount?: number;
    callCount?: number;
    version?: string;
    lastActivity: string;
  };
}

// Generate topology nodes from mock data
export const generateTopologyNodes = (): TopologyNode[] => {
  const nodes: TopologyNode[] = [];
  
  // Add server nodes
  mockServers.forEach(server => {
    nodes.push({
      id: server.id,
      type: 'server',
      name: server.name,
      status: server.status,
      riskLevel: server.riskLevel,
      connections: mockAgents.filter(a => a.connectedServers.includes(server.id)).map(a => a.id),
      metadata: {
        toolCount: server.tools,
        version: server.version,
        lastActivity: server.lastActivity,
      },
    });
  });
  
  // Add agent nodes
  mockAgents.forEach(agent => {
    nodes.push({
      id: agent.id,
      type: 'agent',
      name: agent.name,
      status: agent.status,
      riskLevel: agent.riskLevel,
      connections: agent.connectedServers,
      metadata: {
        callCount: agent.toolCalls,
        lastActivity: agent.lastActivity,
      },
    });
  });
  
  return nodes;
};

// Export all data
export const dashboardData = {
  servers: mockServers,
  agents: mockAgents,
  findings: mockFindings,
  policies: mockPolicies,
  systemMetrics: mockSystemMetrics,
  events: generateMockEvents(20),
  activityMetrics: generateActivityMetrics(24),
  topologyNodes: generateTopologyNodes(),
};
