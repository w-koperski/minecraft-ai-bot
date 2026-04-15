-- Memory Store Schema
-- SQLite database for persistent bot memory

-- Events table - timestamped events for tracking bot activity
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER NOT NULL,
  type TEXT NOT NULL,
  data TEXT
);

-- Index for efficient event cleanup queries
CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);

-- Goals table - goal tracking for commander layer
CREATE TABLE IF NOT EXISTS goals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  goal TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL,
  completed_at INTEGER
);

-- Index for status queries on goals
CREATE INDEX IF NOT EXISTS idx_goals_status ON goals(status);

-- Learnings table - lessons learned from interactions
CREATE TABLE IF NOT EXISTS learnings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  context TEXT NOT NULL,
  lesson TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

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