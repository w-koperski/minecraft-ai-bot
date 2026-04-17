const EventEmitter = require('events');
const logger = require('../utils/logger');

/**
 * WebSocketBroadcaster - Broadcasts state changes to connected WebSocket clients
 * 
 * Features:
 * - Throttles broadcasts to max 10/second
 * - Handles client connect/disconnect
 * - Broadcasts to all connected clients
 */
class WebSocketBroadcaster extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.clients = new Set();
    this.throttleMs = config.throttleMs || 100; // 100ms = max 10/second
    this.lastBroadcast = 0;
    this.pendingBroadcast = null;
    
    logger.debug('WebSocketBroadcaster initialized', { 
      throttleMs: this.throttleMs,
      maxPerSecond: 1000 / this.throttleMs 
    });
  }

  /**
   * Add a WebSocket client
   * @param {WebSocket} ws - WebSocket client
   */
  addClient(ws) {
    this.clients.add(ws);
    logger.debug('WebSocket client connected', { totalClients: this.clients.size });

    // Handle client disconnect
    ws.on('close', () => {
      this.removeClient(ws);
    });

    ws.on('error', (error) => {
      logger.error('WebSocket client error', { error: error.message });
      this.removeClient(ws);
    });
  }

  /**
   * Remove a WebSocket client
   * @param {WebSocket} ws - WebSocket client
   */
  removeClient(ws) {
    this.clients.delete(ws);
    logger.debug('WebSocket client disconnected', { totalClients: this.clients.size });
  }

  /**
   * Broadcast data to all connected clients (throttled)
   * @param {Object} data - Data to broadcast
   */
  broadcast(data) {
    const now = Date.now();
    const timeSinceLastBroadcast = now - this.lastBroadcast;

    // If enough time has passed, broadcast immediately
    if (timeSinceLastBroadcast >= this.throttleMs) {
      this._sendToClients(data);
      this.lastBroadcast = now;
      
      // Clear any pending broadcast
      if (this.pendingBroadcast) {
        clearTimeout(this.pendingBroadcast);
        this.pendingBroadcast = null;
      }
    } else {
      // Schedule broadcast for later (throttled)
      if (!this.pendingBroadcast) {
        const delay = this.throttleMs - timeSinceLastBroadcast;
        this.pendingBroadcast = setTimeout(() => {
          this._sendToClients(data);
          this.lastBroadcast = Date.now();
          this.pendingBroadcast = null;
        }, delay);
      }
      // If already pending, the latest data will be sent when timer fires
    }
  }

  /**
   * Send data to all connected clients
   * @param {Object} data - Data to send
   * @private
   */
  _sendToClients(data) {
    if (this.clients.size === 0) {
      return;
    }

    const message = JSON.stringify(data);
    let successCount = 0;
    let failCount = 0;

    this.clients.forEach((ws) => {
      try {
        if (ws.readyState === 1) { // WebSocket.OPEN
          ws.send(message);
          successCount++;
        } else {
          failCount++;
        }
      } catch (error) {
        logger.error('Failed to send to WebSocket client', { error: error.message });
        failCount++;
      }
    });

    if (successCount > 0) {
      logger.debug('Broadcast sent', { 
        clients: successCount, 
        failed: failCount,
        dataSize: message.length 
      });
    }
  }

  /**
   * Get number of connected clients
   * @returns {number}
   */
  getClientCount() {
    return this.clients.size;
  }

  /**
   * Close all connections and cleanup
   */
  close() {
    if (this.pendingBroadcast) {
      clearTimeout(this.pendingBroadcast);
      this.pendingBroadcast = null;
    }

    this.clients.forEach((ws) => {
      try {
        ws.close();
      } catch (error) {
        logger.error('Error closing WebSocket client', { error: error.message });
      }
    });

    this.clients.clear();
    logger.debug('WebSocketBroadcaster closed');
  }
}

module.exports = WebSocketBroadcaster;
