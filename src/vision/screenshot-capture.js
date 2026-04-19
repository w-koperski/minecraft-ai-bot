/**
 * ScreenshotCapture - Headless screenshot capture from Mineflayer bot perspective
 *
 * Renders a first-person view of the bot's surroundings using node-canvas.
 * Works without X11/display - purely headless rendering.
 *
 * Rendering approach:
 * - Sky gradient (blue to light blue)
 * - Block-based rendering of visible blocks within range
 * - Entity markers (hostile=red, passive=green, player=blue)
 * - Optional crosshair overlay
 *
 * Graceful degradation:
 * - If canvas module is unavailable, returns null data (no crash)
 * - If bot is not spawned/connected, returns structured null response
 * - All rendering is async and non-blocking
 *
 * Configuration via environment variables:
 * - SCREENSHOT_WIDTH: Image width in pixels (default: 640)
 * - SCREENSHOT_HEIGHT: Image height in pixels (default: 480)
 * - SCREENSHOT_RENDER_DISTANCE: Block render distance (default: 32)
 *
 * @module vision/screenshot-capture
 */

const logger = require('../utils/logger');

// Default configuration
const DEFAULTS = {
  WIDTH: 640,
  HEIGHT: 480,
  RENDER_DISTANCE: 32,
  // Block colors for simplified rendering
  SKY_TOP: '#1a1a2e',
  SKY_BOTTOM: '#16213e',
  GROUND: '#523b2a',
  WATER: '#3f8efc',
  LAVA: '#fc4a03',
  AIR: null, // Transparent / skip
  CROSSHAIR_COLOR: '#ffffff'
};

// Simple block color map for common Minecraft blocks
const BLOCK_COLORS = {
  // Natural blocks
  grass: '#4a7c3f',
  grass_block: '#4a7c3f',
  dirt: '#6b4c33',
  stone: '#7c7c7c',
  cobblestone: '#6b6b6b',
  sand: '#d4c5a0',
  gravel: '#7a6e5d',
  oak_log: '#6b4930',
  oak_planks: '#b88a5e',
  birch_log: '#d4c9b0',
  birch_planks: '#c4b68e',
  spruce_log: '#4a3728',
  spruce_planks: '#7a5c38',
  dark_oak_log: '#3a2819',
  dark_oak_planks: '#5a3e28',
  acacia_log: '#6b4930',
  acacia_planks: '#c48a3f',
  jungle_log: '#5a4030',
  jungle_planks: '#8a7040',

  // Ores
  coal_ore: '#4a4a4a',
  iron_ore: '#b8a48c',
  gold_ore: '#fcd34d',
  diamond_ore: '#4ee8c4',
  emerald_ore: '#34d399',
  redstone_ore: '#c0392b',
  lapis_ore: '#3b82f6',
  copper_ore: '#d97706',

  // Building blocks
  glass: '#d1e8ff80',
  white_concrete: '#c8c8c8',
  red_concrete: '#8b2020',
  brick: '#8b4513',

  // Ground covers
  snow: '#f0f0f0',
  ice: '#a0c8e8',
  clay: '#9ea4a8',

  // Danger blocks
  lava: '#fc4a03',
  flowing_lava: '#fc4a03',
  fire: '#ff6600',
  cactus: '#2d6a2d',
  tnt: '#c0392b',

  // Useful blocks
  crafting_table: '#8b6914',
  furnace: '#6b6b6b',
  chest: '#a0724a',
  bed: '#c0392b',

  // Redstone
  redstone_wire: '#c0392b',
  redstone_torch: '#c0392b',
  redstone_block: '#8b2020',
  repeater: '#6b3a3a',

  // Rail
  rail: '#6b6b6b',
  powered_rail: '#d4a020',
  detector_rail: '#c0392b',
  activator_rail: '#c0392b'
};

// Entity marker colors
const ENTITY_COLORS = {
  hostile: '#ff4444',
  passive: '#44ff44',
  player: '#4488ff',
  neutral: '#ffff44'
};

// Hostile mob names (aligned with VisionProcessor)
const HOSTILE_MOBS = new Set([
  'zombie', 'skeleton', 'creeper', 'spider', 'enderman',
  'witch', 'slime', 'phantom', 'drowned', 'husk', 'stray',
  'cave_spider', 'silverfish', 'blaze', 'ghast', 'magma_cube',
  'wither_skeleton', 'guardian', 'elder_guardian', 'shulker',
  'evoker', 'vindicator', 'pillager', 'ravager', 'hoglin',
  'zoglin', 'warden'
]);

class ScreenshotCapture {
  /**
   * @param {Object} bot - Mineflayer bot instance
   * @param {Object} [options] - Configuration options
   * @param {number} [options.width] - Screenshot width (default: 640 or SCREENSHOT_WIDTH env)
   * @param {number} [options.height] - Screenshot height (default: 480 or SCREENSHOT_HEIGHT env)
   * @param {number} [options.renderDistance] - Block render distance (default: 32 or SCREENSHOT_RENDER_DISTANCE env)
   * @param {Object} [options.canvasImpl] - Custom canvas implementation (for testing)
   */
  constructor(bot, options = {}) {
    this.bot = bot;
    this.width = parseInt(process.env.SCREENSHOT_WIDTH, 10) || options.width || DEFAULTS.WIDTH;
    this.height = parseInt(process.env.SCREENSHOT_HEIGHT, 10) || options.height || DEFAULTS.HEIGHT;
    this.renderDistance = parseInt(process.env.SCREENSHOT_RENDER_DISTANCE, 10) || options.renderDistance || DEFAULTS.RENDER_DISTANCE;

    // Validate dimensions
    this.width = Math.max(16, Math.min(4096, this.width));
    this.height = Math.max(16, Math.min(4096, this.height));
    this.renderDistance = Math.max(4, Math.min(64, this.renderDistance));

    // Canvas implementation (injected for testing, or loaded dynamically)
    this._canvasImpl = options.canvasImpl || null;
    this._canvasAvailable = null; // Lazy detection

    // FOV settings for raycasting
    this.fovHorizontal = 70; // degrees
    this.fovVertical = this.fovHorizontal * (this.height / this.width);

    logger.info('ScreenshotCapture: Initialized', {
      width: this.width,
      height: this.height,
      renderDistance: this.renderDistance
    });
  }

  /**
   * Check if canvas module is available for rendering
   * @returns {boolean}
   */
  isCanvasAvailable() {
    if (this._canvasAvailable === null) {
      try {
        if (this._canvasImpl) {
          this._canvasAvailable = true;
        } else {
          require('canvas');
          this._canvasAvailable = true;
        }
      } catch (_e) {
        this._canvasAvailable = false;
        logger.warn('ScreenshotCapture: Canvas module not available, screenshots will be placeholder-only');
      }
    }
    return this._canvasAvailable;
  }

  /**
   * Capture a screenshot from the bot's perspective
   * Returns base64-encoded PNG data.
   *
   * @returns {Promise<Object>} Screenshot data object:
   *   - timestamp: capture time (ms)
   *   - width: image width
   *   - height: image height
   *   - data: base64-encoded PNG string (null if unavailable)
   *   - position: {x, y, z} bot position (null if not spawned)
   *   - format: 'png'
   *   - source: 'canvas' | 'placeholder'
   */
  async capture() {
    const timestamp = Date.now();
    const position = this._getBotPosition();

    // Handle bot not spawned/connected
    if (!this._isBotReady()) {
      logger.debug('ScreenshotCapture: Bot not ready, returning placeholder');
      return {
        timestamp,
        width: this.width,
        height: this.height,
        data: null,
        position: null,
        format: 'png',
        source: 'placeholder'
      };
    }

    // Handle canvas not available
    if (!this.isCanvasAvailable()) {
      logger.debug('ScreenshotCapture: No canvas, returning coordinates-only');
      return {
        timestamp,
        width: this.width,
        height: this.height,
        data: null,
        position,
        format: 'png',
        source: 'placeholder'
      };
    }

    try {
      const base64Data = await this._renderScreenshot();
      return {
        timestamp,
        width: this.width,
        height: this.height,
        data: base64Data,
        position,
        format: 'png',
        source: 'canvas'
      };
    } catch (error) {
      logger.error('ScreenshotCapture: Render failed', {
        error: error.message,
        stack: error.stack
      });

      return {
        timestamp,
        width: this.width,
        height: this.height,
        data: null,
        position,
        format: 'png',
        source: 'error'
      };
    }
  }

  /**
   * Check if the bot is ready for screenshot capture
   * @returns {boolean}
   */
  _isBotReady() {
    return !!(this.bot && this.bot.entity && this.bot.entity.position);
  }

  /**
   * Get the bot's position as integer coordinates
   * @returns {Object|null} {x, y, z} or null
   */
  _getBotPosition() {
    if (!this._isBotReady()) {
      return null;
    }
    const pos = this.bot.entity.position;
    return {
      x: Math.floor(pos.x),
      y: Math.floor(pos.y),
      z: Math.floor(pos.z)
    };
  }

  /**
   * Render the bot's view to a canvas and return base64 PNG
   * @returns {Promise<string>} Base64-encoded PNG data
   */
  async _renderScreenshot() {
    const { createCanvas } = this._canvasImpl || require('canvas');
    const canvas = createCanvas(this.width, this.height);
    const ctx = canvas.getContext('2d');

    // Step 1: Draw sky gradient
    this._drawSky(ctx);

    // Step 2: Draw ground plane
    this._drawGround(ctx);

    // Step 3: Draw visible blocks using raycasting
    this._drawBlocks(ctx);

    // Step 4: Draw entity markers
    this._drawEntities(ctx);

    // Step 5: Draw HUD overlay
    this._drawHUD(ctx);

    // Convert to base64 PNG (non-blocking)
    const base64 = await new Promise((resolve, reject) => {
      setImmediate(() => {
        try {
          const buffer = canvas.toBuffer('image/png');
          resolve(buffer.toString('base64'));
        } catch (error) {
          reject(error);
        }
      });
    });

    return base64;
  }

  /**
   * Draw sky gradient (top of image)
   * @param {CanvasRenderingContext2D} ctx
   */
  _drawSky(ctx) {
    const gradient = ctx.createLinearGradient(0, 0, 0, this.height / 2);
    gradient.addColorStop(0, DEFAULTS.SKY_TOP);
    gradient.addColorStop(1, DEFAULTS.SKY_BOTTOM);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, this.width, this.height / 2);
  }

  /**
   * Draw ground plane (bottom half)
   * @param {CanvasRenderingContext2D} ctx
   */
  _drawGround(ctx) {
    const horizonY = this.height * 0.45; // Horizon slightly above center

    // Ground color with distance fog effect
    const gradient = ctx.createLinearGradient(0, horizonY, 0, this.height);
    gradient.addColorStop(0, '#5a6e3a'); // Far ground (fogged)
    gradient.addColorStop(1, DEFAULTS.GROUND); // Near ground
    ctx.fillStyle = gradient;
    ctx.fillRect(0, horizonY, this.width, this.height - horizonY);

    // Draw horizon line
    ctx.strokeStyle = '#4a5a3030';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, horizonY);
    ctx.lineTo(this.width, horizonY);
    ctx.stroke();
  }

  /**
   * Draw visible blocks from bot's perspective using simplified raycasting
   * Casts rays across the viewport and renders blocks at each hit point
   * @param {CanvasRenderingContext2D} ctx
   */
  _drawBlocks(ctx) {
    if (!this._isBotReady() || !this.bot.blockAt) {
      return;
    }

    const botPos = this.bot.entity.position;
    const botY = Math.floor(botPos.y);
    const botX = Math.floor(botPos.x);
    const botZ = Math.floor(botPos.z);
    const horizonY = this.height * 0.45;

    // Get bot's yaw (horizontal rotation) for direction
    const yaw = this.bot.entity.yaw || 0;

    // Cast rays across viewport
    const rayCount = Math.min(this.width, 160); // Limit rays for performance
    const stepX = this.width / rayCount;

    for (let i = 0; i < rayCount; i++) {
      const screenX = i * stepX;
      const angle = yaw + ((i / rayCount - 0.5) * this.fovHorizontal * Math.PI / 180);

      // Cast ray at multiple vertical levels
      for (let vLevel = 0; vLevel < 3; vLevel++) {
        const verticalOffset = vLevel === 0 ? 0 : (vLevel === 1 ? -1 : 1);
        const levelY = botY + verticalOffset;

        // Step along ray
        for (let dist = 1; dist <= this.renderDistance; dist++) {
          const checkX = Math.floor(botX + Math.sin(angle) * dist);
          const checkZ = Math.floor(botZ - Math.cos(angle) * dist);

          try {
            const block = this.bot.blockAt(
              this._makeVec3(checkX, levelY, checkZ)
            );

            if (block && block.name !== 'air' && block.name !== 'cave_air') {
              // Project 3D position to 2D screen coordinates
              const screenY = this._projectToScreen(
                dist, verticalOffset, horizonY
              );

              if (screenY < 0 || screenY > this.height) break;

              // Calculate block size based on distance (perspective)
              const blockSize = Math.max(2, Math.floor(40 / dist));

              // Get block color
              const color = BLOCK_COLORS[block.name] || this._getBlockFallbackColor(block.name);

              if (color) {
                ctx.fillStyle = color;
                ctx.globalAlpha = Math.max(0.3, 1 - (dist / this.renderDistance) * 0.6);
                ctx.fillRect(
                  screenX - blockSize / 2,
                  screenY - blockSize / 2,
                  blockSize,
                  blockSize
                );
                ctx.globalAlpha = 1;
              }

              // Stop ray at first solid block at this level
              break;
            }
          } catch (_e) {
            // Block data may not be available for distant chunks
            break;
          }
        }
      }
    }
  }

  /**
   * Draw entity markers near the bot
   * @param {CanvasRenderingContext2D} ctx
   */
  _drawEntities(ctx) {
    if (!this._isBotReady() || !this.bot.entities) {
      return;
    }

    const botPos = this.bot.entity.position;
    const horizonY = this.height * 0.45;
    const yaw = this.bot.entity.yaw || 0;
    const maxEntityDist = 32;

    for (const entity of Object.values(this.bot.entities)) {
      if (!entity.position || entity === this.bot.entity) continue;

      const dist = entity.position.distanceTo(botPos);
      if (dist > maxEntityDist) continue;

      // Calculate screen position
      const dx = entity.position.x - botPos.x;
      const dz = entity.position.z - botPos.z;
      const angle = Math.atan2(dx, -dz) - yaw;
      const screenX = this.width / 2 + (angle / (Math.PI * 2)) * this.width * 2;

      // Reject entities outside viewport
      if (screenX < 0 || screenX > this.width) continue;

      const screenY = horizonY + (10 / Math.max(1, dist)) * 50;

      // Determine entity type and color
      const color = this._getEntityColor(entity);

      // Draw entity marker
      const markerSize = Math.max(4, Math.min(16, 120 / dist));

      ctx.fillStyle = color;
      ctx.globalAlpha = Math.max(0.4, 1 - (dist / maxEntityDist) * 0.5);

      // Diamond marker shape for entities
      ctx.beginPath();
      ctx.moveTo(screenX, screenY - markerSize / 2);
      ctx.lineTo(screenX + markerSize / 2, screenY);
      ctx.lineTo(screenX, screenY + markerSize / 2);
      ctx.lineTo(screenX - markerSize / 2, screenY);
      ctx.closePath();
      ctx.fill();

      // Add border for hostile entities
      if (HOSTILE_MOBS.has(entity.name?.toLowerCase())) {
        ctx.strokeStyle = '#ff0000';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      ctx.globalAlpha = 1;
    }
  }

  /**
   * Draw HUD overlay (crosshair, coordinates, health)
   * @param {CanvasRenderingContext2D} ctx
   */
  _drawHUD(ctx) {
    if (!this._isBotReady()) return;

    // Crosshair at center
    ctx.strokeStyle = DEFAULTS.CROSSHAIR_COLOR;
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = 1.5;
    const cx = this.width / 2;
    const cy = this.height / 2;
    const size = 8;

    ctx.beginPath();
    ctx.moveTo(cx - size, cy);
    ctx.lineTo(cx + size, cy);
    ctx.moveTo(cx, cy - size);
    ctx.lineTo(cx, cy + size);
    ctx.stroke();

    // Semi-transparent background for text
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#000000';
    ctx.fillRect(4, this.height - 40, 160, 36);
    ctx.globalAlpha = 1;

    // Position text
    ctx.fillStyle = '#ffffff';
    ctx.font = '12px monospace';
    const pos = this._getBotPosition();
    if (pos) {
      ctx.fillText(`X:${pos.x} Y:${pos.y} Z:${pos.z}`, 8, this.height - 22);
    }

    // Health bar
    if (this.bot.health !== undefined) {
      const health = this.bot.health || 0;
      const maxHealth = 20;
      const barWidth = 100;
      const barHeight = 6;
      const barX = 8;
      const barY = this.height - 12;

      // Background
      ctx.fillStyle = '#333333';
      ctx.fillRect(barX, barY, barWidth, barHeight);

      // Health fill
      const healthPct = health / maxHealth;
      ctx.fillStyle = healthPct > 0.5 ? '#44ff44' : healthPct > 0.25 ? '#ffff44' : '#ff4444';
      ctx.fillRect(barX, barY, barWidth * healthPct, barHeight);
    }

    ctx.globalAlpha = 1;
  }

  /**
   * Project a 3D block position to 2D screen Y coordinate
   * @param {number} distance - Distance from bot
   * @param {number} yOffset - Vertical offset (-1, 0, 1)
   * @param {number} horizonY - Y position of horizon line
   * @returns {number} Screen Y coordinate
   */
  _projectToScreen(distance, yOffset, horizonY) {
    const perspective = Math.max(0.1, distance);
    const verticalShift = yOffset * (30 / perspective);
    return horizonY + verticalShift;
  }

  /**
   * Get color for an entity based on its type
   * @param {Object} entity - Mineflayer entity
   * @returns {string} Hex color string
   */
  _getEntityColor(entity) {
    const name = entity.name?.toLowerCase();

    // Check if hostile
    if (HOSTILE_MOBS.has(name) || entity.kind === 'Hostile mobs') {
      return ENTITY_COLORS.hostile;
    }

    // Check if player
    if (entity.type === 'player' || entity.username) {
      return ENTITY_COLORS.player;
    }

    // Default to neutral/passive
    return ENTITY_COLORS.passive;
  }

  /**
   * Get fallback color for blocks not in the color map
   * Uses a hash-based approach for consistent colors
   * @param {string} blockName - Minecraft block name
   * @returns {string} Hex color string
   */
  _getBlockFallbackColor(blockName) {
    if (!blockName) return null;

    // Water blocks
    if (blockName.includes('water')) return DEFAULTS.WATER;

    // Lava blocks
    if (blockName.includes('lava')) return DEFAULTS.LAVA;

    // Leaves (green-ish)
    if (blockName.includes('leaves')) return '#2d5a1e';

    // Wool/concrete (use generic gray)
    if (blockName.includes('wool') || blockName.includes('concrete') || blockName.includes('terracotta')) {
      return '#888888';
    }

    // Hash-based derived color for unknown blocks
    let hash = 0;
    for (let i = 0; i < blockName.length; i++) {
      hash = blockName.charCodeAt(i) + ((hash << 5) - hash);
    }
    const r = (hash & 0xff0000) >> 16;
    const g = (hash & 0x00ff00) >> 8;
    const b = hash & 0x0000ff;

    // Ensure decent brightness so blocks are visible
    const brightness = (r + g + b) / 3;
    if (brightness < 40) {
      return `#${Math.min(255, r + 80).toString(16).padStart(2, '0')}${Math.min(255, g + 80).toString(16).padStart(2, '0')}${Math.min(255, b + 80).toString(16).padStart(2, '0')}`;
    }

    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }

  /**
   * Create a Vec3 instance (lazy-loaded to avoid dependency issues)
   * @param {number} x
   * @param {number} y
   * @param {number} z
   * @returns {Object} Vec3 instance
   */
  _makeVec3(x, y, z) {
    // Use bot's Vec3 if available, otherwise require directly
    if (this.bot && this.bot.vec3) {
      return this.bot.vec3(x, y, z);
    }

    try {
      const { Vec3 } = require('vec3');
      return new Vec3(x, y, z);
    } catch (_e) {
      // Fallback: simple object (blockAt may accept plain objects)
      return { x, y, z };
    }
  }

  /**
   * Get capture status/metadata without actually capturing
   * @returns {Object} Status object
   */
  getStatus() {
    return {
      canvasAvailable: this.isCanvasAvailable(),
      botReady: this._isBotReady(),
      width: this.width,
      height: this.height,
      renderDistance: this.renderDistance,
      position: this._getBotPosition()
    };
  }
}

module.exports = ScreenshotCapture;