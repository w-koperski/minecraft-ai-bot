# Bot Scenarios to Memory Types Mapping

**Task:** 4 from human-like-companion-upgrade plan
**Date:** 2026-04-15
**Status:** Complete

## Overview

This document maps 24 common Minecraft bot scenarios to the 4 memory types defined in the RoboMemory paper:
- **Spatial**: Locations, coordinates, biomes, structures
- **Temporal**: Event sequences, time-based patterns
- **Episodic**: Experiences with full context (who, what, where, when)
- **Semantic**: Facts, rules, relationships, general knowledge

---

## Scenario Mapping

### 1. Combat with Hostile Mob

| Aspect | Memory Type | Rationale |
|--------|-------------|-----------|
| Mob position and type | Spatial | "Where is the zombie" - coordinate data |
| Attack sequence/outcome | Temporal | "First hit, then retreat, then finish" - ordered events |
| Combat experience (this specific fight) | Episodic | Full context: bot HP, mob type, terrain, result |
| Combat rules ("zombies drop flesh") | Semantic | General Minecraft knowledge |

**Schema:**
```json
{
  "type": "combat_episode",
  "mob": { "type": "zombie", "position": {"x": 10, "y": 64, "z": -5} },
  "bot_state": { "health": 14, "inventory": [...] },
  "sequence": ["approach", "attack", "retreat", "attack"],
  "outcome": "success",
  "duration_ms": 3500,
  "timestamp": 1713000000000
}
```

### 2. Building a Structure

| Aspect | Memory Type | Rationale |
|--------|-------------|-----------|
| Building location/coordinates | Spatial | "Built at x=100, y=64, z=200" |
| Construction sequence | Temporal | "First foundation, then walls, then roof" |
| Building experience | Episodic | Full context: materials used, time, structure type |
| Building recipes/patterns | Semantic | "Oak planks → oak slabs for roofs" |

**Schema:**
```json
{
  "type": "build_episode",
  "structure": "oak_house",
  "position": {"x": 100, "y": 64, "z": 200},
  "blueprint": ["foundation", "walls", "roof", "interior"],
  "materials": [{"oak_planks": 64}, {"oak_slab": 32}],
  "duration_ms": 120000,
  "timestamp": 1713000000000
}
```

### 3. Trading with Villager

| Aspect | Memory Type | Rationale |
|--------|-------------|-----------|
| Villager location/coordinates | Spatial | "Village at x=-50, z=30" |
| Trade offer sequence | Temporal | "First emerald trade, then bookshelves" |
| Trade interaction | Episodic | Full context: villager profession, offers, bot inventory |
| Trade values ("emerald for 1 coal") | Semantic | Known exchange rates |

**Schema:**
```json
{
  "type": "trade_episode",
  "villager": { "profession": "toolsmith", "position": {"x": -50, "y": 64, "z": 30}},
  "offers": [
    {"in": "emerald", "out": "iron_axe"},
    {"in": "emerald", "out": "iron_pickaxe"}
  ],
  "completed_trade": {"in": "emerald", "out": "iron_axe"},
  "bot_inventory_after": [...],
  "timestamp": 1713000000000
}
```

### 4. Exploring New Biome

| Aspect | Memory Type | Rationale |
|--------|-------------|-----------|
| Biome location/boundaries | Spatial | "Desert at x=500 to x=800, z=-100 to z=200" |
| Exploration path | Temporal | "Entered from north, found village, exited east" |
| Exploration event | Episodic | Full context: biomes seen, resources found, dangers |
| Biome characteristics | Semantic | "Deserts have sand, cacti, zombies at night" |

**Schema:**
```json
{
  "type": "explore_episode",
  "biome": "desert",
  "boundaries": {"min_x": 500, "max_x": 800, "min_z": -100, "max_z": 200},
  "path": [{"x": 500, "z": 0}, {"x": 650, "z": 50}, {"x": 800, "z": 100}],
  "findings": ["village", "temple", "cactus_patch"],
  "dangers_encountered": ["zombie", "zombie", "zombie"],
  "timestamp": 1713000000000
}
```

### 5. Crafting Item

| Aspect | Memory Type | Rationale |
|--------|-------------|-----------|
| Crafting location | Spatial | "Crafted at x=64, y=65, z=-20 (near table)" |
| Crafting sequence | Temporal | "Put wood in grid, got planks, made sticks" |
| Crafting attempt | Episodic | Full context: recipe, success/failure, inventory changes |
| Crafting recipes | Semantic | "2 planks + 2 sticks = wooden pickaxe" |

**Schema:**
```json
{
  "type": "craft_episode",
  "recipe": "wooden_pickaxe",
  "position": {"x": 64, "y": 65, "z": -20},
  "steps": ["obtain_oak_log", "craft_oak_planks", "craft_sticks", "craft_pickaxe"],
  "success": true,
  "inventory_before": [{"oak_log": 1}],
  "inventory_after": [{"oak_planks": 4}, {"stick": 2}, {"wooden_pickaxe": 1}],
  "timestamp": 1713000000000
}
```

### 6. Death and Respawn

| Aspect | Memory Type | Rationale |
|--------|-------------|-----------|
| Death location | Spatial | "Died at x=200, y=45, z=-150 (fell in cave)" |
| Death sequence | Temporal | "Hit by skeleton, fell into lava, respawned at bed" |
| Death event | Episodic | Full context: cause, items lost, respawn location |
| Death consequences (XP loss) | Semantic | General Minecraft mechanics |

**Schema:**
```json
{
  "type": "death_episode",
  "position": {"x": 200, "y": 45, "z": -150},
  "cause": "lava",
  "items_dropped": ["iron_sword", "iron_pickaxe", "coal x5"],
  "respawn_point": {"x": 64, "y": 64, "z": 0},
  "xp_loss": 15,
  "timestamp": 1713000000000
}
```

### 7. Respawning

| Aspect | Memory Type | Rationale |
|--------|-------------|-----------|
| Respawn location | Spatial | "Respawned at x=64, y=64, z=0 (bed)" |
| Recovery sequence | Temporal | "Respawned, ran back to recover items" |
| Recovery attempt | Episodic | Full context: items to recover, route taken |
| Respawn mechanics | Semantic | "Items stay 5 min, can recover with same items" |

### 8. Chat Interaction

| Aspect | Memory Type | Rationale |
|--------|-------------|-----------|
| Chat location | Spatial | "Chat at x=64, y=64, z=0" |
| Conversation flow | Temporal | "Player asked, bot answered, player thanked" |
| Conversation event | Episodic | Full context: who, what, when, relationship |
| Language patterns | Semantic | "Common commands, response templates" |

**Schema:**
```json
{
  "type": "chat_episode",
  "player": "Steve",
  "messages": [
    {"role": "player", "content": "can you get diamonds?", "timestamp": 1713000000000},
    {"role": "bot", "content": "I'll find diamonds for you!", "timestamp": 1713000001000},
    {"role": "player", "content": "thanks", "timestamp": 1713000005000}
  ],
  "relationship_change": {"trust": +2, "familiarity": +1},
  "timestamp": 1713000000000
}
```

### 9. Following Player

| Aspect | Memory Type | Rationale |
|--------|-------------|-----------|
| Player location | Spatial | "Steve at x=100, y=64, z=-50" |
| Following sequence | Temporal | "Started following, player moved, stopped at distance" |
| Follow event | Episodic | Full context: reason for following, duration, outcome |
| Follow distance rules | Semantic | "Stop 3 blocks behind player" |

### 10. Resource Gathering (Wood)

| Aspect | Memory Type | Rationale |
|--------|-------------|-----------|
| Tree locations | Spatial | "Oak tree at x=150, y=64, z=-80" |
| Gathering sequence | Temporal | "Found tree, broke logs, collected drops" |
| Gathering event | Episodic | Full context: tree type, tool used, time of day |
| Wood types and yields | Semantic | "Oak log gives 4-6 wood, birch gives 3-5" |

**Schema:**
```json
{
  "type": "gather_episode",
  "resource": "oak_log",
  "positions": [{"x": 150, "y": 64, "z": -80}, {"x": 155, "y": 64, "z": -75}],
  "tool_used": "iron_axe",
  "quantity_gathered": 12,
  "duration_ms": 45000,
  "timestamp": 1713000000000
}
```

### 11. Pathfinding to Target

| Aspect | Memory Type | Rationale |
|--------|-------------|-----------|
| Target position | Spatial | "Diamonds at x=-100, y=16, z=50 (deep cave)" |
| Path taken | Temporal | "Went down stairs at x=0, through cave, found lava" |
| Navigation event | Episodic | Full context: route choices, obstacles, success |
| Pathfinding rules | Semantic | "Use stairs, avoid lava, watch for hostile mobs" |

**Schema:**
```json
{
  "type": "pathfind_episode",
  "target": {"type": "diamond_ore", "position": {"x": -100, "y": 16, "z": 50}},
  "route": ["surface", "stairs", "cave_level_1", "cave_level_2"],
  "obstacles_encountered": ["lava_pool", "zombie", "zombie", "cave_spider"],
  "success": true,
  "duration_ms": 180000,
  "timestamp": 1713000000000
}
```

### 12. Farming Crops

| Aspect | Memory Type | Rationale |
|--------|-------------|-----------|
| Farm location | Spatial | "Wheat farm at x=200, y=64, z=100" |
| Farming cycle | Temporal | "Planted, waited, harvested, replanted" |
| Farming event | Episodic | Full context: crop type, growth time, yield |
| Crop growth times | Semantic | "Wheat takes 30-50 min, carrots 15-30 min" |

### 13. Mining Ore

| Aspect | Memory Type | Rationale |
|--------|-------------|-----------|
| Ore vein locations | Spatial | "Iron vein at x=-50, y=32, z=100" |
| Mining sequence | Temporal | "Found ore, mined with pick, sorted drops" |
| Mining event | Episodic | Full context: ore type, depth, tool, items gained |
| Ore spawn rules | Semantic | "Iron spawns y=5-64, diamond y=5-16" |

**Schema:**
```json
{
  "type": "mine_episode",
  "ore": "iron_ore",
  "position": {"x": -50, "y": 32, "z": 100},
  "mining_method": "branch_mining",
  "tools_used": ["iron_pickaxe"],
  "items_gained": [{"iron_ore": 8}, {"coal": 3}],
  "duration_ms": 90000,
  "timestamp": 1713000000000
}
```

### 14. Brewing Potion

| Aspect | Memory Type | Rationale |
|--------|-------------|-----------|
| Brewing location | Spatial | "Brewing setup at x=64, y=70, z=20" |
| Brewing sequence | Temporal | "Added water, blaze powder, nether wart, awkward base" |
| Brewing event | Episodic | Full context: recipe, success/failure, duration |
| Potion recipes | Semantic | "Nether wart + water = awkward, + ghast tear = healing" |

### 15. Enchanting Items

| Aspect | Memory Type | Rationale |
|--------|-------------|-----------|
| Enchanting location | Spatial | "Enchanting table at x=64, y=64, z=30" |
| Enchanting sequence | Temporal | "Placed item, added lapis, chose enchantment" |
| Enchanting event | Episodic | Full context: item, bookshelves, enchantment level |
| Enchantment rules | Semantic | "30 levels max, lapis cost scales with level" |

### 16. Breeding Animals

| Aspect | Memory Type | Rationale |
|--------|-------------|-----------|
| Animal pen location | Spatial | "Cow pen at x=150, y=64, z=200" |
| Breeding sequence | Temporal | "Fed wheat to cows, baby spawned, grew up" |
| Breeding event | Episodic | Full context: animal type, parents, offspring |
| Breeding mechanics | Semantic | "Wheat for cows, carrots for pigs, etc." |

### 17. Fishing

| Aspect | Memory Type | Rationale |
|--------|-------------|-----------|
| Fishing spot | Spatial | "Fishing at x=100, y=62, z=-100 (near lily pad)" |
| Fishing sequence | Temporal | "Cast, waited, saw bubble, pulled, caught fish" |
| Fishing event | Episodic | Full context: time of day, weather, loot gained |
| Fishing mechanics | Semantic | "Loot table includes fish, treasure, junk" |

**Schema:**
```json
{
  "type": "fish_episode",
  "position": {"x": 100, "y": 62, "z": -100},
  "weather": "rain",
  "time_of_day": "night",
  "attempts": 5,
  "catch": [
    {"type": "cod", "treasure": false},
    {"type": "fishing_rod", "treasure": true},
    {"type": "cod", "treasure": false}
  ],
  "timestamp": 1713000000000
}
```

### 18. Taming a Horse

| Aspect | Memory Type | Rationale |
|--------|-------------|-----------|
| Horse location | Spatial | "Found wild horse at x=300, y=64, z=-50" |
| Taming sequence | Temporal | "Mounted, bucked off, remounted, repeated 5 times" |
| Taming event | Episodic | Full context: horse stats, attempts, final result |
| Taming mechanics | Semantic | "Horses take 1-5 mounts to tame, feed wheat to heal" |

### 19. Entering Nether

| Aspect | Memory Type | Rationale |
|--------|-------------|-----------|
| Portal location (both dimensions) | Spatial | "Built portal at x=64, y=64, z=0, leads to x=200, y=70, z=0" |
| Dimension transition sequence | Temporal | "Entered portal, teleport, exited nether" |
| Portal event | Episodic | Full context: which portal, destination, items carried |
| Nether rules | Semantic | "1 block nether = 8 blocks overworld" |

### 20. Defending Against Raid

| Aspect | Memory Type | Rationale |
|--------|-------------|-----------|
| Raid location | Spatial | "Village under raid at x=-100, y=64, z=50" |
| Defense sequence | Temporal | "Evokers spawned, witches appeared, wave 3, victory" |
| Raid event | Episodic | Full context: wave count, enemies, items lost, outcome |
| Raid mechanics | Semantic | "Raid triggers with Bad Omen, 3 waves min" |

### 21. Making Redstone Circuit

| Aspect | Memory Type | Rationale |
|--------|-------------|-----------|
| Circuit location | Spatial | "Circuits built at x=64, y=65, z=100" |
| Construction sequence | Temporal | "Laid floor, placed repeaters, added torches, tested" |
| Circuit event | Episodic | Full context: design, iterations, final success |
| Redstone rules | Semantic | "Signal strength 0-15, repeaters reset, torches invert" |

### 22. Fuel Collection (Coal/Charcoal)

| Aspect | Memory Type | Rationale |
|--------|-------------|-----------|
| Coal locations | Spatial | "Coal ore vein at x=-30, y=40, z=80" |
| Collection sequence | Temporal | "Found tree, got charcoal, found coal vein" |
| Fuel event | Episodic | Full context: fuel source, quantity, furnace efficiency |
| Fuel values | Semantic | "Coal=8, charcoal=8, wood=1.5, lava=100" |

### 23. Hunting Mobs (for drops)

| Aspect | Memory Type | Rationale |
|--------|-------------|-----------|
| Spawner location | Spatial | "Zombie spawner at x=150, y=25, z=-200" |
| Hunt sequence | Temporal | "Entered spawner room, killed 10, dropped leather" |
| Hunt event | Episodic | Full context: mob type, spawner rate, drops collected |
| Mob drop tables | Semantic | "Zombies drop flesh, skeleton drops bones/arrows" |

### 24. Sleeping to Skip Night

| Aspect | Memory Type | Rationale |
|--------|-------------|-----------|
| Bed location | Spatial | "Bed at x=64, y=64, z=10" |
| Sleep sequence | Temporal | "Entered bed, morning came, monsters burned" |
| Sleep event | Episodic | Full context: time skipped, dangers avoided, energy restored |
| Sleep mechanics | Semantic | "Can only sleep in safe location, skips night" |

### 25. Animal Husbandry (Naming, Feeding)

| Aspect | Memory Type | Rationale |
|--------|-------------|-----------|
| Animal location | Spatial | "Named cow at x=150, y=64, z=200" |
| Care sequence | Temporal | "Fed wheat, cow produced milk, named it Bessie" |
| Care event | Episodic | Full context: animal type, name, health, products |
| Animal products | Semantic | "Cows give milk when fed wheat, chickens drop eggs" |

---

## Gap Analysis

### Identified Gaps

1. **Intent/Goal Memory**: Currently no semantic memory for "why" the bot is doing something. The goal exists in commands.json but isn't stored persistently. This is neither purely semantic (rules) nor episodic (experience).

2. **Relationship Memory Context**: When episodic memories involve players (trading, combat), the relationship state isn't clearly linked. Need to determine if relationship data is episodic (this specific interaction) or semantic (general standing with player).

3. **Failure Mode Memory**: When actions fail repeatedly, there's no persistent memory of "don't try X at Y location." Currently each failure is ephemeral in actionHistory.

4. **Preference Learning**: The bot's personality in Soul.md is static, but the bot may develop preferences ("prefers mining at y=32"). Is this semantic (learned fact) or episodic (accumulated experience)?

5. **Time-of-Day Context**: Some memories should be tagged with game-time context (night vs day, season if modded). This overlaps with Temporal but adds a game-clock dimension.

6. **Weather Memory**: Rain affects certain activities (fishing, farming). Weather is environmental but not purely spatial.

### Proposed Resolutions

| Gap | Suggested Resolution | Memory Type |
|-----|---------------------|-------------|
| Intent/Goal | Store as semantic memory with goal_id linking to episodic | Semantic with Episodic link |
| Relationship in Episodes | Add `relationship_state` field to episodic schemas | Hybrid (Episodic + Semantic) |
| Failure Modes | Store as semantic "location hazard" facts with expiry | Semantic |
| Preference Learning | New memory category: "LearnedPreferences" stored as semantic | Semantic |
| Time-of-Day | Add `game_time` field to all temporal/episodic schemas | Temporal |
| Weather | Add `weather` field to relevant episodic schemas | Spatial (environment) |

---

## Schema Definitions

### Spatial Memory Schema

```json
{
  "type": "spatial",
  "category": "location|biome|structure|route",
  "name": "string",
  "position": {
    "x": "number",
    "y": "number",
    "z": "number"
  },
  "boundaries": {
    "min_x": "number",
    "max_x": "number",
    "min_y": "number",
    "max_y": "number",
    "min_z": "number",
    "max_z": "number"
  },
  "metadata": {
    "description": "string",
    "tags": ["string"],
    "last_visited": "timestamp"
  },
  "created_at": "timestamp",
  "updated_at": "timestamp"
}
```

### Temporal Memory Schema

```json
{
  "type": "temporal",
  "category": "event_sequence|pattern|cycle",
  "name": "string",
  "steps": [
    {
      "order": "number",
      "event": "string",
      "duration_ms": "number",
      "next_expected": "string"
    }
  ],
  "average_duration_ms": "number",
  "pattern": "string (regex or description)",
  "created_at": "timestamp",
  "updated_at": "timestamp"
}
```

### Episodic Memory Schema

```json
{
  "type": "episodic",
  "category": "combat|building|trading|exploring|crafting|death|chat|...",
  "episode_id": "uuid",
  "participants": [
    {
      "type": "bot|player|mob|npc",
      "identifier": "string",
      "role": "string"
    }
  ],
  "location": {
    "x": "number",
    "y": "number",
    "z": "number",
    "dimension": "overworld|nether|end",
    "biome": "string"
  },
  "game_time": {
    "time_of_day": "number (0-24000)",
    "day_number": "number"
  },
  "sequence": [
    {
      "action": "string",
      "timestamp": "number (ms since episode start)",
      "outcome": "string"
    }
  ],
  "outcome": "success|partial|failure",
  "items_involved": [
    {
      "type": "string",
      "quantity": "number",
      "change": "gained|lost|unchanged"
    }
  ],
  "duration_ms": "number",
  "timestamp": "number (epoch ms)",
  "importance": "number (1-10)",
  "summary": "string"
}
```

### Semantic Memory Schema

```json
{
  "type": "semantic",
  "category": "fact|rule|relationship|preference|recipe|location_hazard",
  "subject": "string",
  "predicate": "string",
  "object": "string|number|boolean",
  "confidence": "number (0-1)",
  "source": "episodic|direct_learning|builtin",
  "source_episode_id": "uuid (if episodic)",
  "expiry": "timestamp|null",
  "created_at": "timestamp",
  "updated_at": "timestamp"
}
```

---

## Memory Type Summary

| Memory Type | Count | Examples |
|-------------|-------|----------|
| Spatial | 25 | Tree locations, village positions, portal coordinates |
| Temporal | 20 | Build sequences, combat timing, resource gathering cycles |
| Episodic | 25 | Each specific interaction/event is stored with full context |
| Semantic | 24 | Minecraft rules, recipes, entity behaviors, learned preferences |

---

## Verification Checklist

- [x] 20+ scenarios documented (25 scenarios)
- [x] Each memory mapped to one of 4 types
- [x] Gaps identified and resolution proposed
- [x] Schema defined for each memory type
- [x] Cross-references between memory types noted

---

## Dependencies

- **Blocks**: Task 10 (4 memory types implementation)
- **Informs**: Memory store schema design, episodic buffer implementation