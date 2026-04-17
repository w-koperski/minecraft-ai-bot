### Autonomous Goals
- **Cognitive Controller** - Synthesizes inputs from all modules into unified decisions using priority rules (Danger > Social > Goals)
## 🛡️ Robustness Features
The bot includes enterprise-grade robustness features for long-running autonomous operation:
### Confidence Scoring
Every action gets a confidence score (0.0-1.0) based on tool efficiency, distance, health, and hazards. Multi-step verification catches failures early, and fallback strategies adapt to low-confidence situations.
### Danger Prediction
Learns from deaths and damage to predict dangerous areas. 20-block danger zones decay over 7 days. Strategy layer uses this to avoid risky paths and penalize dangerous goals.
### Failure Pattern Detection
Analyzes action history to detect stuck patterns, tool failures, and pathfinding errors. Triggers interventions after 3 consecutive failures and logs patterns for learning.
### Skill System
10 reusable skills with retry logic: 5 primitives (move, dig, place, craft, collect) and 5 composites (gather wood, mine stone, craft tools, build shelter, hunt food).
### Reflection Module
### Autonomous Goals
When idle, the bot generates its own goals based on personality, danger predictions, and recent conversations. Player goals always take priority.
Five metrics tracked against Project Sid targets: action success rate (94%), items/hour (39), memory usage, reflection latency (6ms), and goal generation latency (1ms).
**Learn more:** [ROBUSTNESS.md](docs/ROBUSTNESS.md) has complete feature documentation and troubleshooting.
- [ROBUSTNESS.md](docs/ROBUSTNESS.md) - Robustness features (confidence scoring, skills, reflection)
---
18
