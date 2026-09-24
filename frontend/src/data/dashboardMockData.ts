/**
 * Mock data architecture for MCP-A2A Dashboard
 * Structured to match expected backend API responses
 */

export type ServerStatus = 'operational' | 'warning' | 'critical' | 'offline';
export type AgentStatus = 'active' | 'idle' | 'offline';
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type FindingSeverity = 'low' | 'medium' | 'high' | 'critical';
export type EventType = 'tool_call' | 'policy' | 'scan' | 'a2a_connection' | 'anomaly' | 'auth' | 'block';
export type A2ATaskStatus = 'pending' | 'active' | 'completed' | 'failed' | 'delegated';
export type SandboxStatus = 'running' | 'completed' | 'failed' | 'timeout' | 'blocked';
export type AuditAction = 'read' | 'write' | 'execute' | 'delete' | 'delegate' | 'verify' | 'block' | 'policy_update';

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

// A2A Task: Agent-to-Agent delegation task
export interface A2ATask {
  id: string;
  title: string;
  managerAgent: string;
  workerAgent: string;
  status: A2ATaskStatus;
  priority: 'low' | 'medium' | 'high' | 'critical';
  createdAt: string;
  completedAt?: string;
  toolsUsed: string[];
  riskLevel: RiskLevel;
  verificationStatus: 'pending' | 'verified' | 'failed';
}

// A2A Agent Card: Trust card for agent-to-agent auth
export interface A2AAgentCard {
  id: string;
  agentId: string;
  agentName: string;
  issuer: string;
  issuedAt: string;
  expiresAt: string;
  capabilities: string[];
  trustScore: number;
  verified: boolean;
  revoked: boolean;
  usageCount: number;
  lastUsed: string;
}

// Sandbox Execution: Isolated tool execution record
export interface SandboxExecution {
  id: string;
  toolName: string;
  agentId: string;
  status: SandboxStatus;
  startTime: string;
  endTime?: string;
  duration?: number; // milliseconds
  resourceUsage: {
    cpu: number; // percentage
    memory: number; // MB
    network: number; // KB
  };
  exitCode?: number;
  blocked: boolean;
  blockReason?: string;
}

// Audit Event: Comprehensive audit trail
export interface AuditEvent {
  id: string;
  timestamp: string;
  action: AuditAction;
  actor: string; // agent or user ID
  actorType: 'agent' | 'user' | 'system';
  resource: string;
  resourceType: 'server' | 'agent' | 'tool' | 'policy' | 'finding';
  success: boolean;
  riskLevel: RiskLevel;
  details: string;
  ipAddress?: string;
  metadata?: Record<string, unknown>;
}

// AI Security Analysis: LLM-powered security insights
export interface AIAnalysis {
  id: string;
  timestamp: string;
  analysisType: 'threat_detection' | 'pattern_analysis' | 'risk_assessment' | 'anomaly_detection';
  confidence: number; // 0-100
  finding: string;
  recommendation: string;
  affectedResources: string[];
  severity: FindingSeverity;
  modelVersion: string;
  processingTime: number; // milliseconds
}

// Tool Call Trace: Detailed tool execution trace
export interface ToolCallTrace {
  id: string;
  timestamp: string;
  toolName: string;
  serverId: string;
  agentId: string;
  duration: number;
  success: boolean;
  inputHash: string;
  outputHash: string;
  verified: boolean;
  sandboxId?: string;
  riskLevel: RiskLevel;
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

// Generate random hash for demo purposes
const generateHash = () => {
  return Array.from({ length: 8 }, () => 
    Math.floor(Math.random() * 16).toString(16)
  ).join('');
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

// Mock A2A Tasks
export const mockA2ATasks: A2ATask[] = [
  {
    id: 'a2a-001',
    title: 'Process customer support tickets',
    managerAgent: 'agent-07',
    workerAgent: 'agent-12',
    status: 'active',
    priority: 'high',
    createdAt: formatTimeAgo(15),
    toolsUsed: ['database.query', 'nlp.analyze', 'ticket.update'],
    riskLevel: 'medium',
    verificationStatus: 'verified',
  },
  {
    id: 'a2a-002',
    title: 'Security scan delegation',
    managerAgent: 'agent-04',
    workerAgent: 'agent-21',
    status: 'completed',
    priority: 'critical',
    createdAt: formatTimeAgo(120),
    completedAt: formatTimeAgo(45),
    toolsUsed: ['scan.vulnerability', 'code.analyze'],
    riskLevel: 'low',
    verificationStatus: 'verified',
  },
  {
    id: 'a2a-003',
    title: 'ML model training pipeline',
    managerAgent: 'agent-15',
    workerAgent: 'agent-09',
    status: 'active',
    priority: 'medium',
    createdAt: formatTimeAgo(240),
    toolsUsed: ['ml.train', 'data.fetch', 'vector.store'],
    riskLevel: 'low',
    verificationStatus: 'verified',
  },
  {
    id: 'a2a-004',
    title: 'Database optimization task',
    managerAgent: 'agent-18',
    workerAgent: 'agent-12',
    status: 'pending',
    priority: 'low',
    createdAt: formatTimeAgo(5),
    toolsUsed: ['database.analyze', 'query.optimize'],
    riskLevel: 'low',
    verificationStatus: 'pending',
  },
  {
    id: 'a2a-005',
    title: 'Content moderation batch',
    managerAgent: 'agent-23',
    workerAgent: 'agent-07',
    status: 'failed',
    priority: 'medium',
    createdAt: formatTimeAgo(180),
    completedAt: formatTimeAgo(165),
    toolsUsed: ['content.analyze'],
    riskLevel: 'high',
    verificationStatus: 'failed',
  },
];

// Mock A2A Agent Cards
export const mockA2AAgentCards: A2AAgentCard[] = [
  {
    id: 'card-001',
    agentId: 'agent-07',
    agentName: 'Document Processor',
    issuer: 'MCP-A2A-Authority',
    issuedAt: formatTimeAgo(10080), // 7 days
    expiresAt: formatTimeAgo(-43200), // 30 days from now
    capabilities: ['filesystem.read', 'filesystem.write', 'nlp.process', 'vector.search'],
    trustScore: 98,
    verified: true,
    revoked: false,
    usageCount: 1284,
    lastUsed: formatTimeAgo(0.5),
  },
  {
    id: 'card-002',
    agentId: 'agent-12',
    agentName: 'Data Analyzer',
    issuer: 'MCP-A2A-Authority',
    issuedAt: formatTimeAgo(14400), // 10 days
    expiresAt: formatTimeAgo(-28800), // 20 days from now
    capabilities: ['database.query', 'database.write', 'analytics.run'],
    trustScore: 95,
    verified: true,
    revoked: false,
    usageCount: 892,
    lastUsed: formatTimeAgo(1),
  },
  {
    id: 'card-003',
    agentId: 'agent-04',
    agentName: 'Security Scanner',
    issuer: 'MCP-A2A-Authority',
    issuedAt: formatTimeAgo(7200), // 5 days
    expiresAt: formatTimeAgo(-50400), // 35 days from now
    capabilities: ['scan.security', 'audit.read', 'policy.enforce', 'block.request'],
    trustScore: 100,
    verified: true,
    revoked: false,
    usageCount: 2103,
    lastUsed: formatTimeAgo(2),
  },
  {
    id: 'card-004',
    agentId: 'agent-09',
    agentName: 'API Gateway',
    issuer: 'MCP-A2A-Authority',
    issuedAt: formatTimeAgo(20160), // 14 days
    expiresAt: formatTimeAgo(-14400), // 10 days from now
    capabilities: ['api.call', 'auth.verify', 'rate.limit'],
    trustScore: 88,
    verified: true,
    revoked: false,
    usageCount: 4521,
    lastUsed: formatTimeAgo(0.2),
  },
  {
    id: 'card-005',
    agentId: 'agent-21',
    agentName: 'Code Review Bot',
    issuer: 'MCP-A2A-Authority',
    issuedAt: formatTimeAgo(5760), // 4 days
    expiresAt: formatTimeAgo(-36000), // 25 days from now
    capabilities: ['code.read', 'code.analyze', 'notification.send'],
    trustScore: 92,
    verified: true,
    revoked: false,
    usageCount: 156,
    lastUsed: formatTimeAgo(45),
  },
];

// Mock Sandbox Executions
export const mockSandboxExecutions: SandboxExecution[] = [
  {
    id: 'sbx-001',
    toolName: 'filesystem.read',
    agentId: 'agent-07',
    status: 'completed',
    startTime: formatTimeAgo(1),
    endTime: formatTimeAgo(0.9),
    duration: 124,
    resourceUsage: { cpu: 12, memory: 48, network: 0 },
    exitCode: 0,
    blocked: false,
  },
  {
    id: 'sbx-002',
    toolName: 'database.query',
    agentId: 'agent-12',
    status: 'completed',
    startTime: formatTimeAgo(3),
    endTime: formatTimeAgo(2.8),
    duration: 342,
    resourceUsage: { cpu: 28, memory: 124, network: 45 },
    exitCode: 0,
    blocked: false,
  },
  {
    id: 'sbx-003',
    toolName: 'system.exec',
    agentId: 'agent-09',
    status: 'blocked',
    startTime: formatTimeAgo(5),
    endTime: formatTimeAgo(5),
    duration: 8,
    resourceUsage: { cpu: 2, memory: 12, network: 0 },
    blocked: true,
    blockReason: 'Unregistered tool - policy violation',
  },
  {
    id: 'sbx-004',
    toolName: 'ml.inference',
    agentId: 'agent-15',
    status: 'running',
    startTime: formatTimeAgo(0.5),
    resourceUsage: { cpu: 85, memory: 1024, network: 128 },
    blocked: false,
  },
  {
    id: 'sbx-005',
    toolName: 'code.analyze',
    agentId: 'agent-21',
    status: 'completed',
    startTime: formatTimeAgo(15),
    endTime: formatTimeAgo(14.5),
    duration: 1842,
    resourceUsage: { cpu: 45, memory: 256, network: 12 },
    exitCode: 0,
    blocked: false,
  },
  {
    id: 'sbx-006',
    toolName: 'api.external',
    agentId: 'agent-09',
    status: 'timeout',
    startTime: formatTimeAgo(20),
    endTime: formatTimeAgo(18),
    duration: 30000,
    resourceUsage: { cpu: 5, memory: 32, network: 240 },
    blocked: false,
  },
];

// Mock Audit Events
export const mockAuditEvents: AuditEvent[] = [
  {
    id: 'audit-001',
    timestamp: formatTimeAgo(0.5),
    action: 'execute',
    actor: 'agent-07',
    actorType: 'agent',
    resource: 'filesystem.read',
    resourceType: 'tool',
    success: true,
    riskLevel: 'low',
    details: 'Read configuration file /etc/mcp/config.json',
    ipAddress: '10.0.1.42',
  },
  {
    id: 'audit-002',
    timestamp: formatTimeAgo(2),
    action: 'block',
    actor: 'agent-09',
    actorType: 'agent',
    resource: 'system.exec',
    resourceType: 'tool',
    success: true,
    riskLevel: 'high',
    details: 'Blocked unregistered tool execution attempt',
    ipAddress: '10.0.1.89',
  },
  {
    id: 'audit-003',
    timestamp: formatTimeAgo(5),
    action: 'delegate',
    actor: 'agent-07',
    actorType: 'agent',
    resource: 'agent-12',
    resourceType: 'agent',
    success: true,
    riskLevel: 'medium',
    details: 'Delegated task a2a-001 to worker agent',
    ipAddress: '10.0.1.42',
  },
  {
    id: 'audit-004',
    timestamp: formatTimeAgo(8),
    action: 'verify',
    actor: 'system',
    actorType: 'system',
    resource: 'card-001',
    resourceType: 'agent',
    success: true,
    riskLevel: 'low',
    details: 'Agent card verified successfully',
  },
  {
    id: 'audit-005',
    timestamp: formatTimeAgo(12),
    action: 'policy_update',
    actor: 'user-admin',
    actorType: 'user',
    resource: 'pol-002',
    resourceType: 'policy',
    success: true,
    riskLevel: 'medium',
    details: 'Updated rate limit policy rules',
    ipAddress: '10.0.0.5',
    metadata: { oldRules: 8, newRules: 10 },
  },
  {
    id: 'audit-006',
    timestamp: formatTimeAgo(18),
    action: 'write',
    actor: 'agent-12',
    actorType: 'agent',
    resource: 'database-agent',
    resourceType: 'server',
    success: true,
    riskLevel: 'low',
    details: 'Updated customer records in database',
    ipAddress: '10.0.1.56',
  },
  {
    id: 'audit-007',
    timestamp: formatTimeAgo(25),
    action: 'execute',
    actor: 'agent-04',
    actorType: 'agent',
    resource: 'scan.vulnerability',
    resourceType: 'tool',
    success: true,
    riskLevel: 'low',
    details: 'Completed security scan on srv-001',
    ipAddress: '10.0.1.34',
  },
  {
    id: 'audit-008',
    timestamp: formatTimeAgo(32),
    action: 'delete',
    actor: 'user-admin',
    actorType: 'user',
    resource: 'find-002',
    resourceType: 'finding',
    success: true,
    riskLevel: 'low',
    details: 'Resolved and archived security finding',
    ipAddress: '10.0.0.5',
  },
];

// Mock AI Analyses
export const mockAIAnalyses: AIAnalysis[] = [
  {
    id: 'ai-001',
    timestamp: formatTimeAgo(10),
    analysisType: 'threat_detection',
    confidence: 94,
    finding: 'Detected potential tool poisoning attempt on production-api server',
    recommendation: 'Quarantine affected tool and verify schema integrity. Review recent changes to tool definitions.',
    affectedResources: ['srv-001', 'production-api', 'execute_command'],
    severity: 'high',
    modelVersion: 'sentinel-v3.2.1',
    processingTime: 284,
  },
  {
    id: 'ai-002',
    timestamp: formatTimeAgo(45),
    analysisType: 'anomaly_detection',
    confidence: 87,
    finding: 'Unusual spike in database query rate from agent-12',
    recommendation: 'Monitor agent behavior for next 24 hours. Consider adjusting rate limits if pattern continues.',
    affectedResources: ['agent-12', 'srv-002'],
    severity: 'medium',
    modelVersion: 'sentinel-v3.2.1',
    processingTime: 156,
  },
  {
    id: 'ai-003',
    timestamp: formatTimeAgo(120),
    analysisType: 'pattern_analysis',
    confidence: 76,
    finding: 'Recurring failed authentication attempts from external IP range',
    recommendation: 'Add IP range to blocklist. Enable enhanced authentication logging.',
    affectedResources: ['srv-006', 'auth-service'],
    severity: 'medium',
    modelVersion: 'sentinel-v3.2.1',
    processingTime: 892,
  },
  {
    id: 'ai-004',
    timestamp: formatTimeAgo(180),
    analysisType: 'risk_assessment',
    confidence: 92,
    finding: 'Agent trust score degradation detected for agent-09',
    recommendation: 'Investigate recent task failures. Consider agent card renewal with reduced capabilities.',
    affectedResources: ['agent-09', 'card-004'],
    severity: 'medium',
    modelVersion: 'sentinel-v3.2.1',
    processingTime: 445,
  },
  {
    id: 'ai-005',
    timestamp: formatTimeAgo(360),
    analysisType: 'threat_detection',
    confidence: 98,
    finding: 'Critical: Unregistered tool execution attempt blocked',
    recommendation: 'IMMEDIATE ACTION REQUIRED: Review agent permissions for agent-09. Conduct full security audit.',
    affectedResources: ['agent-09', 'system.exec', 'sbx-003'],
    severity: 'critical',
    modelVersion: 'sentinel-v3.2.1',
    processingTime: 124,
  },
];

// Mock Tool Call Traces
export const mockToolCallTraces: ToolCallTrace[] = [
  {
    id: 'trace-001',
    timestamp: formatTimeAgo(1),
    toolName: 'filesystem.read',
    serverId: 'srv-001',
    agentId: 'agent-07',
    duration: 124,
    success: true,
    inputHash: generateHash(),
    outputHash: generateHash(),
    verified: true,
    sandboxId: 'sbx-001',
    riskLevel: 'low',
  },
  {
    id: 'trace-002',
    timestamp: formatTimeAgo(3),
    toolName: 'database.query',
    serverId: 'srv-002',
    agentId: 'agent-12',
    duration: 342,
    success: true,
    inputHash: generateHash(),
    outputHash: generateHash(),
    verified: true,
    sandboxId: 'sbx-002',
    riskLevel: 'low',
  },
  {
    id: 'trace-003',
    timestamp: formatTimeAgo(5),
    toolName: 'system.exec',
    serverId: 'srv-003',
    agentId: 'agent-09',
    duration: 8,
    success: false,
    inputHash: generateHash(),
    outputHash: generateHash(),
    verified: false,
    sandboxId: 'sbx-003',
    riskLevel: 'high',
  },
  {
    id: 'trace-004',
    timestamp: formatTimeAgo(8),
    toolName: 'vector.search',
    serverId: 'srv-008',
    agentId: 'agent-07',
    duration: 89,
    success: true,
    inputHash: generateHash(),
    outputHash: generateHash(),
    verified: true,
    riskLevel: 'low',
  },
  {
    id: 'trace-005',
    timestamp: formatTimeAgo(12),
    toolName: 'ml.inference',
    serverId: 'srv-005',
    agentId: 'agent-15',
    duration: 1456,
    success: true,
    inputHash: generateHash(),
    outputHash: generateHash(),
    verified: true,
    riskLevel: 'low',
  },
  {
    id: 'trace-006',
    timestamp: formatTimeAgo(15),
    toolName: 'code.analyze',
    serverId: 'srv-004',
    agentId: 'agent-21',
    duration: 1842,
    success: true,
    inputHash: generateHash(),
    outputHash: generateHash(),
    verified: true,
    sandboxId: 'sbx-005',
    riskLevel: 'low',
  },
];

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
  // A2A Network data
  a2aTasks: mockA2ATasks,
  a2aAgentCards: mockA2AAgentCards,
  // Execution data
  sandboxExecutions: mockSandboxExecutions,
  toolCallTraces: mockToolCallTraces,
  // Observability data
  auditEvents: mockAuditEvents,
  // AI data
  aiAnalyses: mockAIAnalyses,
};
