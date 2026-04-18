# Decisions Log - Task 4: Memory Type Mapping

## Date: 2026-04-15

## D1: Episodic is the Catch-All for Context-Rich Events
**Decision:** Any event with full context (who, what, where, when) goes in Episodic, not Semantic.
**Rationale:** Semantic stores rules/facts; Episodic stores experiences. Combat, trading, crafting - all are experiences.
**Alternatives considered:** Creating a hybrid "episodic-semantic" type - rejected to keep 4 types pure.

## D2: Schema Includes Game-Time and Weather
**Decision:** Episodic and Temporal schemas include `game_time` and `weather` fields.
**Rationale:** Minecraft has in-game time affecting behavior. Fishing at night vs day matters.
**Impact:** Increases episodic storage but enables better temporal reasoning.

## D3: Gap - Intent Memory Requires Linking
**Decision:** Goals stored in Semantic with `goal_id` linking to Episodic episodes.
**Rationale:** "Why" is semantic (the goal type), but each attempt is episodic.
**Implementation:** Add `goal_context` to semantic memory, `episode_links` array.

## D4: Gap - Failure Modes as Expiring Semantic Memory
**Decision:** Repeated failures at location stored as Semantic with `expiry` timestamp.
**Rationale:** "Don't try X at Y" is a learned fact, but should expire if situation changes.
**Schema:** `location_hazard` category in semantic with `expiry` field.

## D5: Schema Field Naming Convention
**Decision:** Use snake_case for all field names, `camelCase` only for position coordinates (x, y, z).
**Rationale:** Consistency with existing codebase (state.json uses x, y, z).

## D6: Importance Score on Episodic
**Decision:** Add `importance` field (1-10) to episodic schema.
**Rationale:** Not all episodes equal. Death matters more than idle chat.
**Effect:** Enables priority eviction and selective retention.

## D7: Participant Tracking
**Decision:** Episodic memories track all participants (bot, players, mobs) with roles.
**Rationale:** Social memory matters. "Steve trading with me" vs "Stranger attacked me" have different implications.
**Schema:** `participants` array with type, identifier, role.

## D8: Spatial Memory as Separate from Episodic
**Decision:** Locations stored in dedicated Spatial memory, referenced by episodic.
**Rationale:** Same village visited multiple times = one spatial record, multiple episodic visits.
**Implementation:** Episodic stores `location` object with reference to Spatial memory ID.

## D9: Relationship State Hybrid
**Decision:** Relationship changes recorded in both Episodic (this interaction) and Semantic (cumulative).
**Rationale:** Episodic captures what happened; Semantic captures what it means for the relationship.
**Schema:** `relationship_change` object in episodic, `player_relationship` category in semantic.

## D10: Temporal as Pattern-Focused
**Decision:** Temporal stores sequences as patterns, not raw events.
**Rationale:** "Mining follows: find ore -> mine with pick -> sort inventory" is a reusable pattern.
**Schema:** `steps` array with `next_expected` field for sequence prediction.
