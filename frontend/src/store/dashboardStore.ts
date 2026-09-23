import { create } from 'zustand';
import {
  type MCPServer,
  type Agent,
  type SecurityEvent,
  type SecurityFinding,
  type Policy,
  type SystemMetrics,
  type ActivityMetrics,
  type TopologyNode,
  dashboardData,
  generateMockEvents,
  generateActivityMetrics,
} from '../data/dashboardMockData';

export type DashboardView = 'overview' | 'servers' | 'agents' | 'tools' | 'scanner' | 'findings' | 'policies' | 'fingerprints' | 'events' | 'architecture' | 'sandbox' | 'settings';

interface DashboardState {
  // Data
  servers: MCPServer[];
  agents: Agent[];
  events: SecurityEvent[];
  findings: SecurityFinding[];
  policies: Policy[];
  systemMetrics: SystemMetrics;
  activityMetrics: ActivityMetrics[];
  topologyNodes: TopologyNode[];
  
  // UI State
  currentView: DashboardView;
  sidebarCollapsed: boolean;
  commandPaletteOpen: boolean;
  selectedNodeId: string | null;
  inspectorOpen: boolean;
  activityTimeRange: '1H' | '6H' | '24H' | '7D';
  
  // Live Updates
  isLiveMode: boolean;
  lastUpdateTime: Date;
  
  // Actions
  setCurrentView: (view: DashboardView) => void;
  toggleSidebar: () => void;
  toggleCommandPalette: () => void;
  selectNode: (nodeId: string | null) => void;
  closeInspector: () => void;
  setActivityTimeRange: (range: '1H' | '6H' | '24H' | '7D') => void;
  toggleLiveMode: () => void;
  
  // Data refresh
  refreshEvents: () => void;
  refreshActivityMetrics: () => void;
  refreshAll: () => void;
  
  // Search
  searchQuery: string;
  setSearchQuery: (query: string) => void;
}

export const useDashboardStore = create<DashboardState>((set, get) => ({
  // Initial data from mock
  servers: dashboardData.servers,
  agents: dashboardData.agents,
  events: dashboardData.events,
  findings: dashboardData.findings,
  policies: dashboardData.policies,
  systemMetrics: dashboardData.systemMetrics,
  activityMetrics: dashboardData.activityMetrics,
  topologyNodes: dashboardData.topologyNodes,
  
  // Initial UI state
  currentView: 'overview',
  sidebarCollapsed: false,
  commandPaletteOpen: false,
  selectedNodeId: null,
  inspectorOpen: false,
  activityTimeRange: '24H',
  
  // Live updates
  isLiveMode: true,
  lastUpdateTime: new Date(),
  
  // Actions
  setCurrentView: (view) => set({ currentView: view }),
  
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  
  toggleCommandPalette: () => set((state) => ({ commandPaletteOpen: !state.commandPaletteOpen })),
  
  selectNode: (nodeId) => set({ 
    selectedNodeId: nodeId, 
    inspectorOpen: nodeId !== null 
  }),
  
  closeInspector: () => set({ 
    selectedNodeId: null, 
    inspectorOpen: false 
  }),
  
  setActivityTimeRange: (range) => {
    const hours = range === '1H' ? 1 : range === '6H' ? 6 : range === '24H' ? 24 : 168;
    set({ 
      activityTimeRange: range,
      activityMetrics: generateActivityMetrics(hours),
    });
  },
  
  toggleLiveMode: () => set((state) => ({ isLiveMode: !state.isLiveMode })),
  
  // Data refresh methods
  refreshEvents: () => set({
    events: generateMockEvents(20),
    lastUpdateTime: new Date(),
  }),
  
  refreshActivityMetrics: () => {
    const state = get();
    const hours = state.activityTimeRange === '1H' ? 1 : 
                  state.activityTimeRange === '6H' ? 6 : 
                  state.activityTimeRange === '24H' ? 24 : 168;
    set({
      activityMetrics: generateActivityMetrics(hours),
      lastUpdateTime: new Date(),
    });
  },
  
  refreshAll: () => {
    const state = get();
    const hours = state.activityTimeRange === '1H' ? 1 : 
                  state.activityTimeRange === '6H' ? 6 : 
                  state.activityTimeRange === '24H' ? 24 : 168;
    set({
      events: generateMockEvents(20),
      activityMetrics: generateActivityMetrics(hours),
      lastUpdateTime: new Date(),
    });
  },
  
  // Search
  searchQuery: '',
  setSearchQuery: (query) => set({ searchQuery: query }),
}));

// Auto-refresh events when live mode is enabled
if (typeof window !== 'undefined') {
  setInterval(() => {
    const state = useDashboardStore.getState();
    if (state.isLiveMode) {
      state.refreshEvents();
    }
  }, 5000); // Refresh events every 5 seconds in live mode
}
