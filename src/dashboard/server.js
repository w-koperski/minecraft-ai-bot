/**
 * Dashboard Server - Express + WebSocket server for bot monitoring
 *
 * Runs as a separate process from the main bot for isolation.
 * Provides HTTP API and WebSocket broadcasting for dashboard clients.
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
  connectedClients: 0
};

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

  return app;
}

/**
 * Create HTTP server with Express and WebSocket
 */
function createServer() {
  const app = createApp();

  server = http.createServer(app);

  // Initialize WebSocket server
  wss = new WebSocket.Server({ server });

  // Initialize broadcaster
  broadcaster = new WebSocketBroadcaster({ throttleMs: 100 });

  // Handle WebSocket connections
  wss.on('connection', (ws, req) => {
    const clientIp = req.socket.remoteAddress;
    logger.info('WebSocket client connected', { clientIp });

    // Add client to broadcaster
    broadcaster.addClient(ws);

    // Send initial status
    ws.send(JSON.stringify({
      type: 'status',
      data: botStatus
    }));

    // Update client count
    botStatus.connectedClients = broadcaster.getClientCount();
  });

  // Start periodic status broadcasts
  startStatusBroadcast();

  return server;
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
  }, 1000); // Every second
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

    // Monitor state file for changes
    const statePath = path.join(process.cwd(), 'state', 'state.json');

    try {
      const data = await fs.readFile(statePath, 'utf8');
      const state = JSON.parse(data);

      // Update status based on state file
      if (state.health !== undefined) {
        botStatus.health = state.health;
      }
      if (state.position) {
        botStatus.position = state.position;
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
        `ws://${HOST}:${PORT}`
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

// Export for testing
module.exports = {
  createApp,
  createServer,
  updateBotStatus,
  gracefulShutdown
};