/**
 * Dashboard Server - Express + WebSocket server for bot monitoring
 *
 * Runs as a separate process from the main bot for isolation.
 * Provides HTTP API and WebSocket broadcasting for dashboard clients.
 *
 * WebSocket features:
 * - Heartbeat/ping-pong for dead connection detection (30s ping, 5s pong timeout)
 * - Sends current state immediately on client connect
 * - Subscribes clients to broadcaster for state updates
 * - Graceful client disconnect handling (removes from broadcaster, cleans up timers)
 *
 * @module dashboard/server
 */

'use strict';

require('dotenv').config();

const express = require('express');
const http = require('http');
const cors = require('cors');
const WebSocket = require('ws');
const logger = require('../utils/logger');
const WebSocketBroadcaster = require('./broadcaster');

// Server configuration
const PORT = parseInt(process.env.DASHBOARD_PORT) || 3001;
const HOST = process.env.DASHBOARD_HOST || 'localhost';

const HEARTBEAT_INTERVAL_MS = parseInt(process.env.WS_HEARTBEAT_INTERVAL_MS) || 30000;

// Track server state
let server = null;
let wss = null;
let broadcaster = null;
let isShuttingDown = false;

// Bot status (will be updated by WebSocket messages from main bot)
let botStatus = {
  status: 'disconnected', // idle, active, danger, disconnected
  health: 0,
  position: { x: 0, y: 0, z: 0 },
  goal: null,
  connectedClients: 0,
  driveScores: null
};

/**
 * Set up heartbeat/ping-pong for a WebSocket client
 * Sends ping every HEARTBEAT_INTERVAL_MS, terminates if no pong within HEARTBEAT_TIMEOUT_MS
 * @param {WebSocket} ws - WebSocket client
 */
function setupHeartbeat(ws) {
  let isAlive = true;
  let heartbeatTimer = null;

  ws.on('pong', () => {
    isAlive = true;
  });

  heartbeatTimer = setInterval(() => {
    if (ws.readyState !== WebSocket.OPEN) {
      clearInterval(heartbeatTimer);
      return;
    }

    if (!isAlive) {
      logger.warn('WebSocket client heartbeat timeout, terminating', {
        readyState: ws.readyState
      });
      clearInterval(heartbeatTimer);
      ws.terminate();
      return;
    }

    isAlive = false;
    ws.ping();
  }, HEARTBEAT_INTERVAL_MS);

  ws.on('close', () => {
    isAlive = false;
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  });

  ws.on('error', () => {
    isAlive = false;
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  });
}

/**
 * Create and configure Express app
 */
function createApp() {
  const app = express();

  // CORS configuration - allow localhost only
  app.use(cors({
    origin: ['http://localhost', 'http://127.0.0.1'],
    methods: ['GET'],
    optionsSuccessStatus: 200
  }));

  // Parse JSON bodies
  app.use(express.json());

  // Request logging middleware
  app.use((req, res, next) => {
    logger.debug('HTTP request', { method: req.method, path: req.path });
    next();
  });

  // GET /api/health - Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: Date.now() });
  });

  // GET /api/status - Bot status endpoint
  app.get('/api/status', (req, res) => {
    res.json({
      ...botStatus,
      uptime: process.uptime(),
      timestamp: Date.now()
    });
  });

  // GET /api/broadcaster/stats - WebSocket broadcaster stats
  app.get('/api/broadcaster/stats', (req, res) => {
    res.json({
      connectedClients: wss ? wss.clients.size : 0,
      broadcasterClients: broadcaster ? broadcaster.getClientCount() : 0
    });
  });

  // GET /api/drives - Drive scores endpoint
  app.get('/api/drives', async (req, res) => {
    try {
      const StateManager = require('../utils/state-manager');
      const stateManager = new StateManager();
      const driveScores = await stateManager.getDriveScores();

      if (!driveScores) {
        return res.status(200).json({
          survival: 50,
          curiosity: 50,
          competence: 50,
          social: 50,
          goalOriented: 50,
          _note: 'No drive data available, returning defaults'
        });
      }

      res.json(driveScores);
    } catch (error) {
      logger.error('Failed to get drive scores', { error: error.message });
      res.status(500).json({ error: 'Failed to retrieve drive scores' });
    }
  });

  // GET /api/goals - Current and recent goals endpoint
  app.get('/api/goals', async (req, res) => {
    try {
      const StateManager = require('../utils/state-manager');
      const stateManager = new StateManager();
      const state = await stateManager.read('state');
      const commands = await stateManager.read('commands').catch(() => null);

      const response = {
        current: state?.goal || null,
        recent: []
      };

      // Try to get recent goals from commands history
      if (commands && commands.history) {
        response.recent = commands.history.slice(-10).map(h => ({
          goal: h.goal,
          timestamp: h.timestamp
        }));
      }

      res.json(response);
    } catch (error) {
      logger.error('Failed to get goals', { error: error.message });
      res.status(500).json({ error: 'Failed to retrieve goals' });
    }
  });

  // GET /api/memory - Knowledge graph stats and visualization endpoint
  app.get('/api/memory', async (req, res) => {
    try {
      const KnowledgeGraph = require('../memory/knowledge-graph');
      const kg = new KnowledgeGraph();

      // Try to load persisted graph
      await kg.load();

      const stats = kg.getStats();

      // Get memory tier distribution
      const tierStats = kg.getMemoryTierStats
        ? kg.getMemoryTierStats()
        : { stm: 0, episodic: 0, ltm: 0 };

      const nodes = [];
      const edges = [];

      kg.graph.forEachNode((nodeId, attrs) => {
        nodes.push({
          id: nodeId,
          type: attrs.type || 'unknown',
          label: attrs.properties?.name || attrs.properties?.experience || attrs.properties?.subject || nodeId,
          properties: attrs.properties || {},
          validFrom: attrs.validFrom || null,
          validUntil: attrs.validUntil || null,
          createdAt: attrs.createdAt || null
        });
      });

      kg.graph.forEachEdge((edge, attrs, source, target) => {
        edges.push({
          source,
          target,
          type: attrs.relationType || 'related_to',
          metadata: attrs.metadata || {},
          validFrom: attrs.validFrom || null,
          validUntil: attrs.validUntil || null
        });
      });

      res.json({
        nodeCount: stats.nodeCount || 0,
        edgeCount: stats.edgeCount || 0,
        maxNodes: stats.maxNodes || 10000,
        entitiesAdded: stats.entitiesAdded || 0,
        relationsAdded: stats.relationsAdded || 0,
        nodesEvicted: stats.nodesEvicted || 0,
        memoryTiers: tierStats,
        nodes,
        edges
      });
    } catch (error) {
      logger.error('Failed to get memory stats', { error: error.message });
      res.status(500).json({ error: 'Failed to retrieve memory stats' });
    }
  });

  // GET /api/metrics - Performance metrics endpoint
  app.get('/api/metrics', async (req, res) => {
    try {
      const StateManager = require('../utils/state-manager');
      const ItemTracker = require('../metrics/item-tracker');
      const stateManager = new StateManager();
      const state = await stateManager.read('state');

      // Create ItemTracker and restore from state if available
      const itemTracker = new ItemTracker();
      if (state && state.itemTracking) {
        // Restore item tracking from state
        for (const [itemName, timestamp] of Object.entries(state.itemTracking)) {
          itemTracker.track(itemName, timestamp);
        }
      }

      const itemStats = itemTracker.getStats();

      // Get action success rate from state if available
      const actionSuccessRate = state?.metrics?.actionSuccessRate ?? null;
      const itemsPerHour = itemStats.itemsPerHour || 0;

      res.json({
        actionSuccessRate: actionSuccessRate,
        itemsPerHour: itemsPerHour,
        uniqueItemsCollected: itemStats.uniqueItems || 0,
        techTreeLevel: itemStats.techTreeLevel || 'wood_age',
        sessionDuration: itemStats.sessionDuration || 0,
        milestones: itemTracker.getMilestones ? itemTracker.getMilestones() : []
      });
    } catch (error) {
      logger.error('Failed to get metrics', { error: error.message });
      res.status(500).json({ error: 'Failed to retrieve metrics' });
    }
  });

  return app;
}

/**
 * Create HTTP server with Express and WebSocket
 */
function createServer() {
  const app = createApp();

  server = http.createServer(app);

  // Initialize WebSocket server
  wss = new WebSocket.Server({ server, path: '/ws' });

  // Initialize broadcaster
  broadcaster = new WebSocketBroadcaster({ throttleMs: 100 });

  // Handle WebSocket connections
  wss.on('connection', (ws, req) => {
    const clientIp = req.socket.remoteAddress;
    logger.info('WebSocket client connected', { clientIp });

    setupHeartbeat(ws);

    broadcaster.addClient(ws);

    sendCurrentState(ws);

    ws.on('close', (code, reason) => {
      logger.info('WebSocket client disconnected', {
        clientIp,
        code,
        reason: reason.toString()
      });
      broadcaster.removeClient(ws);
      botStatus.connectedClients = broadcaster.getClientCount();
    });

    ws.on('error', (error) => {
      logger.error('WebSocket client error', {
        clientIp,
        error: error.message
      });
      broadcaster.removeClient(ws);
      botStatus.connectedClients = broadcaster.getClientCount();
    });

    botStatus.connectedClients = broadcaster.getClientCount();
  });

  // Start periodic status broadcasts
  startStatusBroadcast();

  return server;
}

/**
 * Send current state to a newly connected client
 * Reads from state file and sends both state and botStatus
 * @param {WebSocket} ws - WebSocket client
 */
async function sendCurrentState(ws) {
  if (ws.readyState !== WebSocket.OPEN) {
    return;
  }

  const initialState = {
    type: 'state',
    data: {
      ...botStatus,
      connectedClients: broadcaster ? broadcaster.getClientCount() : 0,
      timestamp: Date.now()
    },
    source: 'initial'
  };

  try {
    const StateManager = require('../utils/state-manager');
    const stateManager = new StateManager();
    const stateData = await stateManager.read('state');

    if (stateData) {
      initialState.data = {
        ...initialState.data,
        position: stateData.position || botStatus.position,
        health: stateData.health ?? botStatus.health,
        inventory: stateData.inventory || [],
        entities: stateData.entities || [],
        blocks: stateData.blocks || [],
        goal: stateData.goal || botStatus.goal,
        driveScores: stateData.driveScores || botStatus.driveScores
      };
    }
  } catch (error) {
    logger.debug('Could not read state file for initial state', { error: error.message });
  }

  try {
    ws.send(JSON.stringify(initialState));
  } catch (error) {
    logger.error('Failed to send initial state to WebSocket client', { error: error.message });
  }
}

/**
 * Broadcast status to all WebSocket clients periodically
 */
function startStatusBroadcast() {
  setInterval(() => {
    if (broadcaster && broadcaster.getClientCount() > 0) {
      broadcaster.broadcast({
        type: 'status',
        data: {
          ...botStatus,
          connectedClients: broadcaster.getClientCount(),
          timestamp: Date.now()
        }
      });
    }
  }, 1000);
}

/**
 * Update bot status (called by main bot process via state file monitoring)
 */
function updateBotStatus(newStatus) {
  botStatus = {
    ...botStatus,
    ...newStatus,
    lastUpdate: Date.now()
  };
}

/**
 * Load bot status from state file (for integration with main bot)
 */
async function loadBotStatusFromFile() {
  try {
    const fs = require('fs').promises;
    const path = require('path');

    const statePath = path.join(process.cwd(), 'state', 'state.json');

    try {
      const data = await fs.readFile(statePath, 'utf8');
      const state = JSON.parse(data);

      let changed = false;

      if (state.health !== undefined && state.health !== botStatus.health) {
        botStatus.health = state.health;
        changed = true;
      }
      if (state.position && JSON.stringify(state.position) !== JSON.stringify(botStatus.position)) {
        botStatus.position = state.position;
        changed = true;
      }
      if (state.inventory) {
        botStatus.inventory = state.inventory;
        changed = true;
      }
      if (state.goal !== undefined) {
        botStatus.goal = state.goal;
        changed = true;
      }

      if (state.driveScores) {
        botStatus.driveScores = state.driveScores;
        changed = true;
      }

      if (changed && broadcaster && broadcaster.getClientCount() > 0) {
        broadcaster.broadcast({
          type: 'state_update',
          data: {
            ...botStatus,
            connectedClients: broadcaster.getClientCount(),
            timestamp: Date.now()
          }
        });
      }
    } catch (err) {
      // State file may not exist yet, ignore
    }
  } catch (error) {
    logger.debug('Could not load bot status from file', { error: error.message });
  }
}

/**
 * Start monitoring state file for bot status updates
 */
function startStateFileMonitor() {
  const fs = require('fs');
  const path = require('path');
  const statePath = path.join(process.cwd(), 'state', 'state.json');

  // Check file periodically
  setInterval(async () => {
    await loadBotStatusFromFile();
  }, 2000);
}

/**
 * Graceful shutdown handler
 */
async function gracefulShutdown(signal) {
  if (isShuttingDown) {
    logger.warn('Dashboard server shutdown already in progress', { signal });
    return;
  }

  isShuttingDown = true;
  logger.info('Shutting down dashboard server...', { signal });

  const shutdownTimeout = setTimeout(() => {
    logger.error('Dashboard shutdown timeout exceeded, forcing exit');
    process.exit(1);
  }, 5000);

  try {
    // Stop accepting new connections
    if (server) {
      await new Promise((resolve) => {
        server.close(() => {
          logger.info('HTTP server closed');
          resolve();
        });
      });
    }

    // Close WebSocket connections
    if (broadcaster) {
      broadcaster.close();
    }

    if (wss) {
      wss.close(() => {
        logger.info('WebSocket server closed');
      });
    }

    clearTimeout(shutdownTimeout);
    logger.info('Dashboard server shutdown complete');
    process.exit(0);
  } catch (error) {
    logger.error('Error during dashboard shutdown', { error: error.message });
    clearTimeout(shutdownTimeout);
    process.exit(1);
  }
}

/**
 * Main entry point
 */
async function main() {
  logger.info('Dashboard server starting...', {
    nodeVersion: process.version,
    platform: process.platform,
    port: PORT,
    host: HOST
  });

  try {
    // Create server
    server = createServer();

    // Start HTTP server
    await new Promise((resolve, reject) => {
      server.listen(PORT, HOST, () => {
        logger.info('Dashboard server listening', { host: HOST, port: PORT });
        resolve();
      });

      server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          logger.error(`Port ${PORT} is already in use`);
        } else {
          logger.error('Server error', { error: err.message });
        }
        reject(err);
      });
    });

    // Start state file monitor (for bot status updates)
    startStateFileMonitor();

    // Set up shutdown handlers
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

    logger.info('Dashboard server ready', {
      endpoints: [
        `http://${HOST}:${PORT}/api/health`,
        `http://${HOST}:${PORT}/api/status`,
        `ws://${HOST}:${PORT}/ws`
      ]
    });

  } catch (error) {
    logger.error('Failed to start dashboard server', { error: error.message, stack: error.stack });
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch((error) => {
    logger.error('Unhandled error in main', { error: error.message, stack: error.stack });
    process.exit(1);
  });
}

module.exports = {
  createApp,
  createServer,
  updateBotStatus,
  gracefulShutdown,
  setupHeartbeat,
  sendCurrentState,
  HEARTBEAT_INTERVAL_MS
};