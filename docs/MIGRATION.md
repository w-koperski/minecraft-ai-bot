# Migration Guide: MVP to Companion Bot

This guide walks you through upgrading your Minecraft AI bot from the MVP version to the companion bot version with enhanced personality, voice integration, and persistent memory.

**Estimated time:** 30-45 minutes  
**Difficulty:** Medium  
**Downtime:** Expect 5-10 minutes for restart and database migration

---

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Breaking Changes](#breaking-changes)
4. [New Dependencies](#new-dependencies)
5. [Configuration Changes](#configuration-changes)
6. [Database Migration](#database-migration)
7. [Step-by-Step Upgrade Instructions](#step-by-step-upgrade-instructions)
8. [Rollback Instructions](#rollback-instructions)
9. [Troubleshooting](#troubleshooting)

---

## Overview

The companion bot upgrade adds:

- **Discord integration** for voice commands and chat bridge
- **Personality system** with configurable traits and behavior
- **Persistent memory** for conversations, relationships, and player history
- **Enhanced voice support** via Discord voice channels
- **OpenAI-compatible API client** (replaces Omniroute-specific client)

---

## Prerequisites

Before starting:

- [ ] Backup your current bot installation
- [ ] Ensure Node.js v18+ is installed
- [ ] Have database access (SQLite)
- [ ] Verify Minecraft server connection works
- [ ] Optional: Discord bot token (if using voice features)

---

## Breaking Changes

### API Client Migration: omniroute.js to openai-client.js

The most significant breaking change is the replacement of the Omniroute-specific client with a generic OpenAI-compatible client.

#### Import Changes

**Before (MVP):**
```javascript
const OmnirouteClient = require('./utils/omniroute');
const client = new OmnirouteClient();
```

**After (Companion):**
```javascript
const OpenAIClient = require('./utils/openai-client');
const client = new OpenAIClient();
```

#### API Differences

| Feature | omniroute.js | openai-client.js |
|---------|--------------|------------------|
| Constructor | `new OmnirouteClient(config)` | `new OpenAIClient(config)` |
| Chat method | `client.chat(messages, options)` | `client.chat(messages, layer, options)` |
| Layer parameter | In `options.model` | Separate `layer` parameter (2nd arg) |
| Response format | Full API response | `{ content, role, finishReason, model, usage }` |
| Health check endpoint | `/api/rate-limits` | `/models` |
| Model resolution | Layer names auto-resolved | Environment variables or explicit model IDs |

#### Breaking API Change: Chat Method Signature

**Before:**
```javascript
const response = await client.chat(messages, {
  model: 'pilot',
  temperature: 0.7
});
// response.choices[0].message.content
```

**After:**
```javascript
const response = await client.chat(messages, 'pilot', {
  temperature: 0.7
});
// response.content (already extracted)
```

#### Environment Variables

The new client supports backward-compatible environment variables:

- `OMNIROUTE_URL` → Falls back to `OPENAI_API_URL`
- `OMNIROUTE_API_KEY` → Falls back to `OPENAI_API_KEY`

**Recommendation:** Update to the new variable names:

```bash
# Old (still works)
OMNIROUTE_URL=http://127.0.0.1:20128/v1
OMNIROUTE_API_KEY=your-key

# New (recommended)
OPENAI_API_URL=http://127.0.0.1:20128/v1
OPENAI_API_KEY=your-key
```

#### Model Configuration

**Before:** Models defined in `omniroute.js` constants

**After:** Models defined in `config/bot-config.json`:

```json
{
  "models": {
    "pilot": {
      "id": "nvidia/meta/llama-3.2-1b-instruct",
      "name": "Pilot",
      "latencyTarget": 210
    },
    "strategy": {
      "id": "nvidia/qwen/qwen2.5-7b-instruct",
      "name": "Strategy",
      "latencyTarget": 410
    },
    "commander": {
      "id": "claude-sonnet-4.5",
      "name": "Commander",
      "latencyTarget": 1000
    }
  }
}
```

---

## New Dependencies

Install these additional packages:

```bash
npm install discord.js@^14.26.3 @discordjs/voice@^0.19.2 @discordjs/opus@^0.10.0 ffmpeg-static@^5.3.0 sodium-native@^5.1.0
```

### Dependency Overview

| Package | Purpose | Size |
|---------|---------|------|
| `discord.js` | Discord bot framework | ~15MB |
| `@discordjs/voice` | Voice channel support | ~5MB |
| `@discordjs/opus` | Opus audio encoding | ~3MB |
| `ffmpeg-static` | Audio processing | ~40MB |
| `sodium-native` | Voice encryption | ~2MB |

**Total additional size:** ~65MB

### Native Dependencies Note

`@discordjs/opus` and `sodium-native` require compilation. Ensure you have:

- Python 3.x
- C++ build tools (Visual Studio Build Tools on Windows, build-essential on Linux)
- Node.js headers (npm usually handles this)

---

## Configuration Changes

### New Configuration Files

#### 1. bot-config.json

Create `config/bot-config.json`:

```json
{
  "api": {
    "url": "http://127.0.0.1:20128/v1/chat/completions",
    "key": "sk-local",
    "timeout": 30000,
    "maxConcurrent": 10
  },
  "models": {
    "pilot": {
      "id": "nvidia/meta/llama-3.2-1b-instruct",
      "name": "Pilot",
      "latencyTarget": 210
    },
    "strategy": {
      "id": "nvidia/qwen/qwen2.5-7b-instruct",
      "name": "Strategy",
      "latencyTarget": 410
    },
    "commander": {
      "id": "claude-sonnet-4.5",
      "name": "Commander",
      "latencyTarget": 1000
    }
  },
  "personality": {
    "name": "AIBot",
    "greeting": "Hello! I'm your Minecraft companion.",
    "temperature": 0.7,
    "maxTokens": 2048,
    "responseStyle": "helpful",
    "traits": ["curious", "helpful", "cautious"]
  },
  "autonomy": {
    "enabled": true,
    "maxActionsPerMinute": 30,
    "confirmDangerousActions": true,
    "allowPlayerInteraction": false,
    "autoReconnect": true,
    "restartOnError": false
  },
  "voice": {
    "enabled": false,
    "inputEnabled": false,
    "outputEnabled": false,
    "volume": 0.8,
    "voiceId": "en_US-lessac-high",
    "language": "en",
    "pushToTalk": false
  },
  "memory": {
    "enabled": true,
    "retentionDays": 30,
    "maxEntries": 10000,
    "compressOldEntries": true,
    "persistConversation": true
  }
}
```

#### 2. Soul.md

Create `personality/Soul.md` for bot personality configuration.

See `personality/Soul.md` in the repository for the full template. Key sections:

- **Identity:** Name, role, archetype
- **Personality Dimensions:** warmth, directness, humor, curiosity, loyalty, bravery (0.0-1.0 scale)
- **Speaking Style:** Tone, vocabulary, patterns
- **Values:** Core principles and priorities
- **Goals:** Primary and secondary motivations
- **Anti-Patterns:** Behaviors to avoid
- **Evolution Rules:** How personality adapts over time

### Environment Variables

Add to `.env`:

```bash
# Discord (optional, for voice features)
DISCORD_TOKEN=your-discord-bot-token
DISCORD_GUILD_ID=your-server-id
DISCORD_VOICE_CHANNEL_ID=your-voice-channel-id

# Updated API variables (backward compatible with OMNIROUTE_*)
OPENAI_API_URL=http://127.0.0.1:20128/v1
OPENAI_API_KEY=your-api-key
```

---

## Database Migration

### New Tables

Run this SQL against your SQLite database:

```sql
-- Conversations table - bot-player conversation history
CREATE TABLE IF NOT EXISTS conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id TEXT NOT NULL,
  bot_message TEXT,
  player_message TEXT,
  timestamp INTEGER NOT NULL,
  context TEXT
);

-- Index for efficient player conversation lookups
CREATE INDEX IF NOT EXISTS idx_conversations_player_id ON conversations(player_id);

-- Index for timestamp-based queries (recent conversations)
CREATE INDEX IF NOT EXISTS idx_conversations_timestamp ON conversations(timestamp);

-- Relationships table - tracks bot's relationship with each player
CREATE TABLE IF NOT EXISTS relationships (
  player_id TEXT PRIMARY KEY,
  trust_score REAL NOT NULL DEFAULT 0.5,
  familiarity REAL NOT NULL DEFAULT 0.0,
  interaction_count INTEGER NOT NULL DEFAULT 0,
  last_seen INTEGER
);

-- Index for sorting by trust (for delegation decisions)
CREATE INDEX IF NOT EXISTS idx_relationships_trust ON relationships(trust_score);

-- Personality state table - tracks bot personality traits
CREATE TABLE IF NOT EXISTS personality_state (
  trait_name TEXT PRIMARY KEY,
  current_value REAL NOT NULL DEFAULT 0.5,
  base_value REAL NOT NULL DEFAULT 0.5,
  last_updated INTEGER NOT NULL
);
```

### Migration Script

Save as `scripts/migrate-db.js`:

```javascript
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = process.env.DB_PATH || './data/memory.db';

const db = new sqlite3.Database(DB_PATH);

const migrations = [
  {
    name: 'create_conversations_table',
    sql: `
      CREATE TABLE IF NOT EXISTS conversations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        player_id TEXT NOT NULL,
        bot_message TEXT,
        player_message TEXT,
        timestamp INTEGER NOT NULL,
        context TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_conversations_player_id ON conversations(player_id);
      CREATE INDEX IF NOT EXISTS idx_conversations_timestamp ON conversations(timestamp);
    `
  },
  {
    name: 'create_relationships_table',
    sql: `
      CREATE TABLE IF NOT EXISTS relationships (
        player_id TEXT PRIMARY KEY,
        trust_score REAL NOT NULL DEFAULT 0.5,
        familiarity REAL NOT NULL DEFAULT 0.0,
        interaction_count INTEGER NOT NULL DEFAULT 0,
        last_seen INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_relationships_trust ON relationships(trust_score);
    `
  },
  {
    name: 'create_personality_state_table',
    sql: `
      CREATE TABLE IF NOT EXISTS personality_state (
        trait_name TEXT PRIMARY KEY,
        current_value REAL NOT NULL DEFAULT 0.5,
        base_value REAL NOT NULL DEFAULT 0.5,
        last_updated INTEGER NOT NULL
      );
    `
  }
];

console.log('Running database migrations...');

db.serialize(() => {
  migrations.forEach(migration => {
    console.log(`Applying: ${migration.name}`);
    db.exec(migration.sql, (err) => {
      if (err) {
        console.error(`Error in ${migration.name}:`, err.message);
      } else {
        console.log(`✓ ${migration.name}`);
      }
    });
  });
});

db.close(() => {
  console.log('Database migration complete');
});
```

Run with: `node scripts/migrate-db.js`

---

## Step-by-Step Upgrade Instructions

### Step 1: Backup Current Installation

```bash
# Create backup directory
cp -r minecraft-ai-bot minecraft-ai-bot-backup-$(date +%Y%m%d)

# Backup database
cp data/memory.db data/memory.db.backup-$(date +%Y%m%d)
```

### Step 2: Stop Running Bot

```bash
# If running in background
pkill -f "node src/bot.js"

# Or stop via your process manager
# pm2 stop minecraft-bot
```

### Step 3: Install New Dependencies

```bash
cd minecraft-ai-bot
npm install discord.js@^14.26.3 @discordjs/voice@^0.19.2 @discordjs/opus@^0.10.0 ffmpeg-static@^5.3.0 sodium-native@^5.1.0
```

### Step 4: Create New Directories

```bash
mkdir -p config
mkdir -p personality
mkdir -p scripts
```

### Step 5: Copy New Configuration Files

```bash
# Copy bot-config.json to config/
cp /path/to/new/config/bot-config.json config/

# Copy Soul.md to personality/
cp /path/to/new/personality/Soul.md personality/
```

### Step 6: Update Environment Variables

Edit `.env` and add:

```bash
# New API variables (recommended)
OPENAI_API_URL=http://127.0.0.1:20128/v1
OPENAI_API_KEY=your-api-key

# Discord (optional)
DISCORD_TOKEN=your-discord-bot-token
DISCORD_GUILD_ID=your-server-id
DISCORD_VOICE_CHANNEL_ID=your-voice-channel-id
```

### Step 7: Run Database Migration

```bash
node scripts/migrate-db.js
```

Verify tables were created:

```bash
sqlite3 data/memory.db ".tables"
```

Expected output includes: `conversations`, `relationships`, `personality_state`

### Step 8: Update Code References

Replace in all files:

1. **Import statements:**
   ```javascript
   // Before
   const OmnirouteClient = require('./utils/omniroute');

   // After
   const OpenAIClient = require('./utils/openai-client');
   ```

2. **Client instantiation:**
   ```javascript
   // Before
   const client = new OmnirouteClient();

   // After
   const client = new OpenAIClient();
   ```

3. **Chat calls:**
   ```javascript
   // Before
   const response = await client.chat(messages, { model: 'pilot' });
   const content = response.choices[0].message.content;

   // After
   const response = await client.chat(messages, 'pilot');
   const content = response.content; // Already extracted
   ```

### Step 9: Verify File Structure

```
minecraft-ai-bot/
├── config/
│   └── bot-config.json       # NEW
├── personality/
│   └── Soul.md               # NEW
├── src/
│   └── utils/
│       ├── omniroute.js      # OLD (keep for reference)
│       └── openai-client.js  # NEW
├── scripts/
│   └── migrate-db.js         # NEW
└── data/
    └── memory.db             # MIGRATED
```

### Step 10: Start Bot

```bash
node src/bot.js
```

### Step 11: Verify Upgrade

Check logs for:
- ✓ OpenAI client initialized
- ✓ Database tables verified
- ✓ Personality loaded from Soul.md
- ✓ Configuration loaded from bot-config.json

Test basic functionality:
1. Bot connects to Minecraft server
2. Bot responds to chat commands
3. Discord integration works (if enabled)

---

## Rollback Instructions

If the upgrade fails, follow these steps to revert to MVP:

### Step 1: Stop Bot

```bash
pkill -f "node src/bot.js"
```

### Step 2: Restore Files from Backup

```bash
# Restore source code
cp -r minecraft-ai-bot-backup-*/src .

# Restore configuration
cp minecraft-ai-bot-backup-*/.env .
```

### Step 3: Restore Database (if needed)

```bash
cp data/memory.db.backup-* data/memory.db
```

**Note:** New tables (`conversations`, `relationships`, `personality_state`) will remain but won't cause issues with MVP code.

### Step 4: Remove New Dependencies (optional)

```bash
npm uninstall discord.js @discordjs/voice @discordjs/opus ffmpeg-static sodium-native
```

### Step 5: Start MVP Bot

```bash
node src/bot.js
```

### Rollback Verification

Check that:
- Bot connects without errors
- Omniroute client initializes
- No references to `openai-client.js` in logs

---

## Troubleshooting

### Issue: "Cannot find module 'openai-client'"

**Cause:** Import path not updated

**Solution:**
```javascript
// Wrong
const OpenAIClient = require('./utils/openai-client');

// Correct
const OpenAIClient = require('../utils/openai-client'); // Adjust based on file location
```

### Issue: "response.choices is undefined"

**Cause:** Using old response extraction pattern

**Solution:** Update response handling:
```javascript
// Wrong (old API)
const content = response.choices[0].message.content;

// Correct (new API)
const content = response.content; // Already extracted by client
```

### Issue: Discord voice not working

**Cause:** Missing native dependencies

**Solution:**
```bash
# Rebuild native modules
npm rebuild @discordjs/opus sodium-native

# Verify ffmpeg
npx ffmpeg-static --version
```

### Issue: Database "table already exists" errors

**Cause:** Migration ran twice

**Solution:** The migration script uses `CREATE TABLE IF NOT EXISTS`, so this is harmless. To verify:

```bash
sqlite3 data/memory.db ".schema conversations"
```

### Issue: Config not loading

**Cause:** `config/bot-config.json` missing or malformed

**Solution:**
```bash
# Validate JSON
node -e "JSON.parse(require('fs').readFileSync('config/bot-config.json'))"

# Should print nothing if valid, error if invalid
```

### Issue: Personality not applied

**Cause:** `personality/Soul.md` missing

**Solution:** Verify file exists and is readable:
```bash
ls -la personality/Soul.md
head -20 personality/Soul.md
```

### Issue: Environment variables not recognized

**Cause:** `.env` file not loaded

**Solution:** Ensure `dotenv` is imported at the top of your entry file:
```javascript
require('dotenv').config();
```

### Issue: Rate limit errors after upgrade

**Cause:** New client uses different rate limiting defaults

**Solution:** Check `bot-config.json`:
```json
{
  "api": {
    "maxConcurrent": 10
  }
}
```

Compare with old `omniroute.js` settings:
```javascript
// Old defaults
reservoir: 448,
reservoirRefreshAmount: 448,
reservoirRefreshInterval: 60000,
```

### Issue: Model not found errors

**Cause:** Model IDs changed or not configured

**Solution:** Verify `config/bot-config.json`:
```json
{
  "models": {
    "pilot": {
      "id": "nvidia/meta/llama-3.2-1b-instruct"
    }
  }
}
```

Check that model ID matches what your API endpoint expects.

### Issue: Bot starts but doesn't respond

**Cause:** Layer parameter missing in chat calls

**Solution:** Ensure all `chat()` calls include layer:
```javascript
// Wrong
const response = await client.chat(messages, { temperature: 0.7 });

// Correct
const response = await client.chat(messages, 'pilot', { temperature: 0.7 });
```

### Issue: Memory tables not queried

**Cause:** Code not updated to use new tables

**Solution:** Verify your code uses new table names:
```javascript
// New tables available
const conversations = await db.all('SELECT * FROM conversations WHERE player_id = ?', [playerId]);
const relationship = await db.get('SELECT * FROM relationships WHERE player_id = ?', [playerId]);
const traits = await db.all('SELECT * FROM personality_state');
```

---

## Post-Migration Checklist

- [ ] Bot connects to Minecraft server without errors
- [ ] All three AI layers initialize successfully
- [ ] Bot responds to chat commands
- [ ] Database queries execute without errors
- [ ] Configuration loads from `bot-config.json`
- [ ] Personality loads from `Soul.md`
- [ ] Discord integration works (if enabled)
- [ ] Voice commands work (if enabled)
- [ ] Logs show no migration-related warnings
- [ ] All tests pass (if applicable)

---

## Support

For migration issues:

1. Check logs in `logs/` directory
2. Review this troubleshooting section
3. Compare your config with working examples
4. Verify database schema: `sqlite3 data/memory.db ".schema"`
5. Test API connectivity: `curl $OPENAI_API_URL/models`

---

**Migration complete!** Your bot now has enhanced companion features.
