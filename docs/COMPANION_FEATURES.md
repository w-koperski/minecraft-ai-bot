# Companion Features Documentation

The Minecraft AI Bot includes advanced companion features that transform it from a simple automation tool into a personalized AI companion. These features create meaningful interactions, remember conversations, and adapt to your play style.

---

## Table of Contents

1. [Personality System](#personality-system)
2. [Conversation Memory](#conversation-memory)
3. [Voice Integration](#voice-integration)
4. [Autonomous Goals](#autonomous-goals)
5. [Usage Examples](#usage-examples)

---

## Personality System

The personality system defines how your bot behaves, speaks, and responds to situations. Every bot has a unique "Soul" that shapes its identity.

### Soul.md Configuration

The bot's personality is defined in `personality/Soul.md`. This file controls:

- **Identity** - Name, role, and origin story
- **Personality dimensions** - Numeric traits on a 0.0-1.0 scale
- **Speaking style** - Tone, vocabulary, and patterns
- **Values** - Core principles that guide decisions
- **Goals and motivations** - What drives the bot

### Personality Dimensions

Six core dimensions shape your bot's behavior:

| Dimension | Default | Description |
|-----------|---------|-------------|
| **warmth** | 0.8 | How friendly and welcoming (high = encouraging, low = detached) |
| **directness** | 0.6 | How straightforward (high = blunt, low = diplomatic) |
| **humor** | 0.5 | How playful (high = jokes, low = serious) |
| **curiosity** | 0.7 | How eager to explore (high = asks questions, low = sticks to known paths) |
| **loyalty** | 0.95 | How devoted to player (high = prioritizes player needs) |
| **bravery** | 0.6 | How willing to face danger (high = stands ground, low = cautious) |

### Customizing Personality

To customize your bot's personality:

1. Open `personality/Soul.md`
2. Edit the dimension values (0.0 to 1.0)
3. Restart the bot for changes to take effect

```markdown
## Personality Dimensions

### Core Dimensions

| Dimension | Default Value | Description |
|-----------|---------------|-------------|
| **warmth** | 0.9 | Increased from 0.8 for extra friendliness |
| **directness** | 0.4 | Decreased for more subtle communication |
| **humor** | 0.8 | Increased for more playful interactions |
| **curiosity** | 0.7 | Keep default |
| **loyalty** | 0.95 | Keep default |
| **bravery** | 0.5 | Decreased for more caution |
```

### Dimension Interactions

Traits combine to create unique personality profiles:

- **High warmth + High loyalty** = Devoted companion who celebrates achievements
- **High directness + Low humor** = Task-focused, minimal banter
- **High curiosity + High bravery** = Adventurous explorer taking risks
- **Low warmth + High loyalty** = Silent guardian, protective but distant

### Personality Evolution

Your bot's personality adapts based on interactions:

| Trigger | Dimension Change |
|---------|------------------|
| Player appreciation | warmth +0.02 |
| Task completion | directness +0.01 |
| Shared jokes | humor +0.02 |
| New discoveries | curiosity +0.01 |
| Protective actions | loyalty +0.01 |
| Combat success | bravery +0.01 |

**Decay**: Traits slowly return to defaults at 0.001 per hour (loyalty never decays).

---

## Conversation Memory

The bot remembers every conversation, building a relationship with you over time.

### How It Works

Conversations are stored in SQLite database (`state/memory.db`) with:

- **Message history** - Complete chat history per player
- **Relationship scores** - Trust and familiarity metrics
- **Automatic summarization** - Every 10 messages get compressed to save space
- **30-day retention** - Old conversations auto-cleaned

### Relationship Tracking

The bot tracks two key metrics for each player:

| Metric | Range | Description |
|--------|-------|-------------|
| **Trust** | 0.0-1.0 | How much the bot trusts you (starts at 0.5) |
| **Familiarity** | 0.0-1.0 | How well the bot knows you (starts at 0.0) |

### Interaction Types

Different interactions affect relationship scores:

```javascript
// Positive interactions increase trust
bot.chat("Thanks for helping me!");        // trust +0.02, familiarity +0.01
bot.chat("Great job on that build!");      // trust +0.02, familiarity +0.01

// Helpful actions build strong trust
bot.protectsPlayerFromCreeper();           // trust +0.05, familiarity +0.02

// Negative interactions decrease trust
bot.chat("Stop getting in my way!");       // trust -0.05
bot.attacksBot();                          // trust -0.10
```

### Viewing Conversation History

Access conversation history programmatically:

```javascript
const ConversationStore = require('./src/memory/conversation-store');

const store = new ConversationStore();

// Get recent conversations
const conversations = await store.getRecentConversations('PlayerName', 50);

// Get relationship status
const relationship = await store.getRelationship('PlayerName');
console.log(`Trust: ${relationship.trust_score}`);
console.log(`Familiarity: ${relationship.familiarity}`);

// Close when done
store.close();
```

### Conversation Summarization

Every 10 messages, conversations are summarized:

```
[SUMMARY] 10 messages exchanged (2024-01-15 to 2024-01-15). 
Topics: mining, diamonds, cave
```

Summaries preserve context while keeping storage manageable.

---

## Voice Integration

Control your bot and hear its responses through Discord voice channels.

### Features

- **Speech-to-text** - Speak commands naturally
- **Keyword activation** - Say "Hey bot" to wake it up
- **Text-to-speech** - Bot speaks responses aloud
- **Auto-reconnection** - Handles network interruptions

### Discord Setup

#### 1. Create Discord Bot

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click "New Application" and name it
3. Go to "Bot" section and click "Add Bot"
4. Copy the bot token (you'll need this)

#### 2. Enable Voice Capabilities

In the Bot section:

1. Scroll to "Privileged Gateway Intents"
2. Enable "SERVER MEMBERS INTENT"
3. Enable "MESSAGE CONTENT INTENT"

#### 3. Invite Bot to Server

1. Go to OAuth2 → URL Generator
2. Select scopes: `bot`, `applications.commands`
3. Select bot permissions:
   - Connect
   - Speak
   - Send Messages
   - Read Message History
4. Copy the generated URL and open it
5. Select your server and authorize

#### 4. Get Guild and Channel IDs

Enable Developer Mode in Discord (Settings → Advanced):

1. Right-click your server name → "Copy Server ID" (Guild ID)
2. Right-click voice channel → "Copy Channel ID"

### Configuration

Add to your `.env` file:

```env
# Discord Voice Integration
DISCORD_BOT_TOKEN=your_bot_token_here
DISCORD_GUILD_ID=your_guild_id_here
```

Or configure in `config/bot-config.json`:

```json
{
  "voice": {
    "enabled": true,
    "keyword": "hey bot",
    "keywordThreshold": 0.7,
    "language": "en",
    "voiceId": "en_US-lessac-high",
    "autoReconnect": true,
    "reconnectDelay": 5000
  }
}
```

### Using Voice Commands

1. Join a voice channel
2. The bot will connect automatically
3. Say "Hey bot" followed by your command:
   - "Hey bot, collect some wood"
   - "Hey bot, what's your status?"
   - "Hey bot, follow me"

### Keyword Activation

The bot listens for its wake phrase (default: "Hey bot"):

```javascript
// Change the activation phrase
const voice = new DiscordVoice({
  keyword: 'okay companion',
  keywordThreshold: 0.8  // Higher = more strict matching
});
```

### Voice Status

Check connection status:

```javascript
const status = voice.getStatus();
console.log(status);
// {
//   enabled: true,
//   connected: true,
//   channelId: "123456789",
//   isListening: false,
//   isSpeaking: false,
//   reconnectAttempts: 0
// }
```

---

## Autonomous Goals

When idle and safe, the bot generates its own goals based on personality and memory.

### How It Works

The Commander layer monitors bot state every 10 seconds. When:

- No active goal exists
- No plan is executing
- Environment is safe (no threats)
- Bot is alive
- At least 60 seconds since last autonomous goal

...the bot generates an autonomous goal.

### Autonomy Levels

Configure how independently your bot acts:

| Level | Weight | Allowed Activities |
|-------|--------|-------------------|
| **full** | 1.0 | explore, gather, craft, build, farm, assist |
| **advanced** | 0.7 | explore, gather, craft, assist |
| **basic** | 0.4 | gather, assist |
| **conservative** | 0.2 | assist |

Set in `config/bot-config.json`:

```json
{
  "autonomy": {
    "enabled": true,
    "level": "full"
  }
}
```

### Activity Selection

Activities are scored based on personality traits:

```javascript
// Activity scoring formula
score = (primaryTrait * 2.0) + (secondaryTrait * 1.0) + memoryBoost
score *= autonomyWeight
```

| Activity | Primary Trait | Secondary Trait | Description |
|----------|---------------|-----------------|-------------|
| explore | curiosity | bravery | Explore nearby areas |
| gather | curiosity | warmth | Collect resources |
| craft | directness | warmth | Craft useful items |
| build | directness | warmth | Build structures |
| farm | loyalty | warmth | Tend to farms |
| assist | loyalty | warmth | Help nearby players |

### Memory-Based Goals

The bot considers recent player mentions when generating goals:

```javascript
// Player mentions diamonds
player.chat("I really need some diamonds");

// Bot generates goal:
// "gather useful resources like wood, stone, or DIAMONDS within 50 blocks"
```

### Goal Priority

Goals are prioritized as:

1. **Safety** (priority 100) - Emergency responses
2. **Player requests** (priority 80) - Direct commands
3. **Autonomous** (priority 50) - Self-generated goals
4. **Idle** (priority 10) - Fallback activities

### Example Autonomous Goals

```
High curiosity bot:
- "explore the area within 100 blocks, look for interesting features"
- "explore that cave system to the north"

High loyalty bot:
- "check if any nearby players need assistance"
- "stay close to the player and offer help"

Balanced bot:
- "gather useful resources like wood, stone, or coal"
- "craft useful items from available materials"
```

---

## Usage Examples

### Customizing Personality

```javascript
// File: examples/personality-demo.js

const PersonalityEngine = require('./personality/personality-engine');

async function customizePersonality() {
  const engine = PersonalityEngine.getInstance();
  
  // Get current traits
  const traits = engine.getTraits();
  console.log('Current traits:', traits);
  
  // Temporarily adjust traits (resets on restart)
  await engine.adjustTrait('warmth', 0.95);
  await engine.adjustTrait('humor', 0.8);
  
  // Get bot's response style
  const response = await engine.generateResponse({
    playerMessage: "I found some diamonds!",
    context: { activity: 'mining', foundDiamonds: true }
  });
  
  console.log('Bot says:', response);
}

customizePersonality().catch(console.error);
```

Run with: `node examples/personality-demo.js`

### Viewing Conversation History

```javascript
// File: examples/conversation-history.js

const ConversationStore = require('./src/memory/conversation-store');

async function viewHistory() {
  const store = new ConversationStore();
  
  try {
    // Get last 20 conversations
    const conversations = await store.getRecentConversations('PlayerName', 20);
    
    console.log('\n=== Conversation History ===\n');
    
    conversations.forEach(conv => {
      if (conv.isSummary) {
        console.log(`[SUMMARY] ${conv.botMessage}`);
      } else {
        if (conv.playerMessage) {
          console.log(`Player: ${conv.playerMessage}`);
        }
        if (conv.botMessage) {
          console.log(`Bot: ${conv.botMessage}`);
        }
      }
      console.log('---');
    });
    
    // Get relationship status
    const relationship = await store.getRelationship('PlayerName');
    if (relationship) {
      console.log('\n=== Relationship Status ===');
      console.log(`Trust: ${(relationship.trust_score * 100).toFixed(1)}%`);
      console.log(`Familiarity: ${(relationship.familiarity * 100).toFixed(1)}%`);
      console.log(`Interactions: ${relationship.interaction_count}`);
    }
    
  } finally {
    store.close();
  }
}

viewHistory().catch(console.error);
```

### Voice Integration Setup

```javascript
// File: examples/voice-demo.js

const { DiscordVoice } = require('./src/voice/discord-voice');

async function setupVoice() {
  // Initialize voice integration
  const voice = new DiscordVoice({
    token: process.env.DISCORD_BOT_TOKEN,
    guildId: process.env.DISCORD_GUILD_ID,
    keyword: 'hey bot',
    keywordThreshold: 0.7,
    enabled: true
  });
  
  // Connect to voice channel
  const channelId = 'YOUR_VOICE_CHANNEL_ID';
  await voice.connect(channelId);
  
  console.log('Connected to voice channel!');
  
  // Listen for commands
  voice.on('keyword_detected', async (transcription) => {
    console.log(`Heard: ${transcription}`);
    
    // Process command
    const command = transcription.replace(/hey bot/i, '').trim();
    console.log(`Command: ${command}`);
    
    // Respond via TTS
    await voice.speak(`I understood: ${command}`);
  });
  
  // Start listening
  await voice.listen({ timeout: 30000 });
  
  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\nDisconnecting...');
    await voice.cleanup();
    process.exit(0);
  });
}

setupVoice().catch(console.error);
```

Run with: `DISCORD_BOT_TOKEN=xxx DISCORD_GUILD_ID=yyy node examples/voice-demo.js`

### Configuring Autonomous Goals

```javascript
// File: examples/autonomy-config.js

const fs = require('fs');
const path = require('path');

function configureAutonomy() {
  const configPath = path.join(process.cwd(), 'config', 'bot-config.json');
  
  const config = {
    autonomy: {
      enabled: true,
      level: 'advanced'  // Options: full, advanced, basic, conservative
    },
    voice: {
      enabled: false
    }
  };
  
  // Ensure config directory exists
  const configDir = path.dirname(configPath);
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
  
  // Write configuration
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  
  console.log('Autonomy configured!');
  console.log('Level: advanced');
  console.log('Allowed activities: explore, gather, craft, assist');
}

configureAutonomy();
```

### Complete Companion Bot Setup

```javascript
// File: examples/full-companion-setup.js

// This example shows how to set up a complete companion bot
// with all features enabled

const fs = require('fs');
const path = require('path');

async function setupCompanionBot() {
  console.log('Setting up Companion Bot...\n');
  
  // 1. Configure personality
  console.log('1. Configuring personality...');
  const soulPath = path.join(process.cwd(), 'personality', 'Soul.md');
  if (fs.existsSync(soulPath)) {
    console.log('   ✓ Soul.md exists - customize it to change personality');
  } else {
    console.log('   ✗ Soul.md not found - copy from Soul.example.md');
  }
  
  // 2. Set up conversation memory
  console.log('\n2. Setting up conversation memory...');
  const stateDir = path.join(process.cwd(), 'state');
  if (!fs.existsSync(stateDir)) {
    fs.mkdirSync(stateDir, { recursive: true });
  }
  console.log('   ✓ State directory ready');
  console.log('   Note: Memory database created automatically on first run');
  
  // 3. Configure voice (if Discord token provided)
  console.log('\n3. Checking voice configuration...');
  if (process.env.DISCORD_BOT_TOKEN) {
    console.log('   ✓ Discord token found');
    console.log('   Steps to complete:');
    console.log('   - Create Discord bot at discord.com/developers/applications');
    console.log('   - Invite bot to your server');
    console.log('   - Copy guild ID and channel ID');
    console.log('   - Set DISCORD_GUILD_ID environment variable');
  } else {
    console.log('   ℹ Voice not configured (set DISCORD_BOT_TOKEN to enable)');
  }
  
  // 4. Configure autonomy
  console.log('\n4. Configuring autonomy...');
  const configPath = path.join(process.cwd(), 'config', 'bot-config.json');
  const autonomyConfig = {
    autonomy: {
      enabled: true,
      level: 'full'
    }
  };
  
  if (!fs.existsSync(configPath)) {
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(autonomyConfig, null, 2));
    console.log('   ✓ Autonomy configured (full level)');
  } else {
    console.log('   ✓ Config already exists');
  }
  
  // 5. Summary
  console.log('\n=== Setup Complete ===');
  console.log('Your companion bot is ready!');
  console.log('\nNext steps:');
  console.log('1. Customize personality in personality/Soul.md');
  console.log('2. Start the bot: node src/index.js');
  console.log('3. Chat with your bot in Minecraft');
  console.log('4. Watch it learn and adapt to your play style');
  
  if (process.env.DISCORD_BOT_TOKEN) {
    console.log('5. Join Discord voice channel and say "Hey bot"');
  }
}

setupCompanionBot().catch(console.error);
```

Run with: `node examples/full-companion-setup.js`

---

## Quick Reference

### Environment Variables

```env
# Required for voice
DISCORD_BOT_TOKEN=your_bot_token
DISCORD_GUILD_ID=your_server_id

# Optional voice settings
DISCORD_KEYWORD=hey bot
DISCORD_KEYWORD_THRESHOLD=0.7
```

### File Locations

| File | Purpose |
|------|---------|
| `personality/Soul.md` | Personality configuration |
| `state/memory.db` | Conversation database |
| `config/bot-config.json` | Autonomy and voice settings |

### Chat Commands

Your bot responds to in-game chat:

- `!status` - Show bot status
- `!personality` - Show current traits
- `!memory` - Show conversation count
- `!help` - List available commands

---

## Troubleshooting

### Personality not changing

- Changes to Soul.md require bot restart
- Verify file is valid markdown
- Check logs for parse errors

### Conversations not saving

- Ensure `state/` directory exists and is writable
- Check SQLite is installed: `npm list sqlite3`
- Verify database isn't corrupted

### Voice not connecting

- Check Discord bot token is valid
- Verify bot has Voice Connect/Speak permissions
- Confirm guild ID and channel ID are correct
- Check firewall isn't blocking Discord voice servers

### Autonomous goals not generating

- Verify autonomy is enabled in config
- Check bot is idle (no active goal/plan)
- Ensure environment is safe (no threats)
- Wait at least 60 seconds between autonomous goals

---

**Enjoy your AI companion!**
