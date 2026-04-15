# Decisions - Companion Bot Transformation

## [2026-04-15T06:55:01Z] Architectural Decisions
- Keep 3-layer architecture (Pilot/Strategy/Commander)
- OpenAI-compatible API replaces Omniroute
- Personality system: template-based (NO ML models)
- Voice: Discord integration, configurable, text default
- Memory: SQLite with 30-day retention
