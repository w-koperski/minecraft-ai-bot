export type BotStatusEnum = 'idle' | 'active' | 'danger' | 'disconnected';
export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'error';

export interface Position {
  x: number;
  y: number;
  z: number;
}

export interface InventoryItem {
  name: string;
  count: number;
  slot?: number;
}

export interface DriveScore {
  label: string;
  value: number;
}

export interface BotState {
  status: BotStatusEnum;
  health: number;
  position: Position;
  inventory: InventoryItem[];
  goal: string | null;
  connectedClients: number;
  driveScores?: Record<string, number>;
  entities?: unknown[];
  blocks?: unknown[];
  lastUpdate?: number;
  timestamp?: number;
}

export interface WSMessage {
  type: 'state' | 'state_update' | 'status' | 'error';
  data: BotState;
  source?: string;
}

export interface MemoryGraphNode {
  id: string;
  type: string;
  label: string;
  properties: Record<string, unknown>;
  validFrom: number | null;
  validUntil: number | null;
  createdAt: number | null;
}

export interface MemoryGraphEdge {
  source: string;
  target: string;
  type: string;
  metadata: Record<string, unknown>;
  validFrom: number | null;
  validUntil: number | null;
}

export interface MemoryGraphData {
  nodeCount: number;
  edgeCount: number;
  maxNodes: number;
  entitiesAdded: number;
  relationsAdded: number;
  nodesEvicted: number;
  memoryTiers: { stm: number; episodic: number; ltm: number };
  nodes: MemoryGraphNode[];
  edges: MemoryGraphEdge[];
}