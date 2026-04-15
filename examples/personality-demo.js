/**
 * Personality Demo - Example script for customizing bot personality
 *
 * This script demonstrates how to:
 * - Load and inspect personality traits
 * - Temporarily adjust personality dimensions
 * - Generate responses based on personality
 * - Observe trait interactions
 *
 * Usage: node examples/personality-demo.js
 */

const fs = require('fs');
const path = require('path');

// Simulated personality engine for demo purposes
class DemoPersonalityEngine {
  constructor() {
    // Default traits
    this.traits = {
      warmth: 0.8,
      directness: 0.6,
      humor: 0.5,
      curiosity: 0.7,
      loyalty: 0.95,
      bravery: 0.6
    };

    // Load from Soul.md if exists
    this._loadFromSoul();
  }

  _loadFromSoul() {
    const soulPath = path.join(process.cwd(), 'personality', 'Soul.md');
    if (fs.existsSync(soulPath)) {
      try {
        const content = fs.readFileSync(soulPath, 'utf8');

        // Parse trait values from Soul.md
        const traitMatches = content.match(/\*\*warmth\*\*\s*\|\s*([\d.]+)/);
        if (traitMatches) {
          this.traits.warmth = parseFloat(traitMatches[1]);
        }

        // Similar parsing for other traits would go here
        // For demo, we use defaults with potential override

        console.log('✓ Loaded personality from Soul.md');
      } catch (error) {
        console.log('ℹ Using default personality traits');
      }
    }
  }

  getTraits() {
    return { ...this.traits };
  }

  adjustTrait(traitName, value) {
    if (this.traits.hasOwnProperty(traitName)) {
      this.traits[traitName] = Math.max(0, Math.min(1, value));
      console.log(`  Adjusted ${traitName} to ${this.traits[traitName]}`);
      return true;
    }
    return false;
  }

  getPersonalityProfile() {
    const t = this.traits;

    // Determine archetype based on traits
    if (t.loyalty > 0.9 && t.warmth > 0.7) {
      return 'Devoted Companion';
    } else if (t.curiosity > 0.8 && t.bravery > 0.7) {
      return 'Adventurous Explorer';
    } else if (t.directness > 0.8 && t.humor < 0.3) {
      return 'Efficient Assistant';
    } else if (t.warmth < 0.4 && t.loyalty > 0.8) {
      return 'Silent Guardian';
    } else {
      return 'Friendly Helper';
    }
  }

  generateResponse(context) {
    const t = this.traits;
    const { playerMessage, activity } = context;

    // Generate response based on personality
    let responses = [];

    // Warmth affects greeting style
    if (t.warmth > 0.7) {
      responses.push("Hey there!");
    } else if (t.warmth > 0.4) {
      responses.push("Hello.");
    } else {
      responses.push("");
    }

    // Directness affects detail level
    if (activity === 'found_diamonds') {
      if (t.directness > 0.7) {
        responses.push("Diamonds detected.");
      } else if (t.humor > 0.6) {
        responses.push("Jackpot! Sparkly friends ahead!");
      } else {
        responses.push("I see you've found some diamonds. That's great!");
      }
    }

    // Loyalty affects closing
    if (t.loyalty > 0.9) {
      responses.push("I'm here if you need me.");
    }

    return responses.filter(r => r).join(' ');
  }
}

// Demo scenarios
const scenarios = [
  {
    name: "Found Diamonds",
    context: {
      playerMessage: "I found diamonds!",
      activity: 'found_diamonds'
    }
  },
  {
    name: "Combat Help",
    context: {
      playerMessage: "Help! There are zombies!",
      activity: 'combat'
    }
  },
  {
    name: "Building",
    context: {
      playerMessage: "What do you think of my house?",
      activity: 'building'
    }
  }
];

async function runDemo() {
  console.log('='.repeat(60));
  console.log('Personality Demo - Minecraft AI Bot Companion');
  console.log('='.repeat(60));
  console.log();

  // Create personality engine
  const engine = new DemoPersonalityEngine();

  // Show initial traits
  console.log('Current Personality Traits:');
  console.log('-'.repeat(40));
  const traits = engine.getTraits();
  Object.entries(traits).forEach(([name, value]) => {
    const bar = '█'.repeat(Math.round(value * 20)) + '░'.repeat(20 - Math.round(value * 20));
    console.log(`  ${name.padEnd(12)} [${bar}] ${(value * 100).toFixed(0)}%`);
  });
  console.log();

  console.log(`Archetype: ${engine.getPersonalityProfile()}`);
  console.log();

  // Show responses with current personality
  console.log('Sample Responses (Default Personality):');
  console.log('-'.repeat(40));
  scenarios.forEach(scenario => {
    const response = engine.generateResponse(scenario.context);
    console.log(`  ${scenario.name}:`);
    console.log(`    "${response}"`);
    console.log();
  });

  // Demonstrate trait adjustments
  console.log('Adjusting Personality...');
  console.log('-'.repeat(40));

  // Make bot more humorous
  engine.adjustTrait('humor', 0.9);
  // Make bot more direct
  engine.adjustTrait('directness', 0.9);
  // Reduce warmth slightly
  engine.adjustTrait('warmth', 0.5);

  console.log();
  console.log(`New Archetype: ${engine.getPersonalityProfile()}`);
  console.log();

  // Show responses with adjusted personality
  console.log('Sample Responses (Adjusted Personality):');
  console.log('-'.repeat(40));
  scenarios.forEach(scenario => {
    const response = engine.generateResponse(scenario.context);
    console.log(`  ${scenario.name}:`);
    console.log(`    "${response}"`);
    console.log();
  });

  // Show trait combinations
  console.log('Trait Combinations:');
  console.log('-'.repeat(40));

  const combinations = [
    { warmth: 0.9, loyalty: 0.9, name: 'High Warmth + High Loyalty' },
    { directness: 0.9, humor: 0.1, name: 'High Directness + Low Humor' },
    { curiosity: 0.9, bravery: 0.8, name: 'High Curiosity + High Bravery' },
    { warmth: 0.2, loyalty: 0.9, name: 'Low Warmth + High Loyalty' }
  ];

  combinations.forEach(combo => {
    console.log(`  ${combo.name}:`);
    // Reset and apply combo
    const testEngine = new DemoPersonalityEngine();
    Object.entries(combo).forEach(([trait, value]) => {
      if (trait !== 'name') {
        testEngine.adjustTrait(trait, value);
      }
    });
    console.log(`    Result: ${testEngine.getPersonalityProfile()}`);
    console.log();
  });

  // Customization instructions
  console.log('How to Customize Your Bot:');
  console.log('-'.repeat(40));
  console.log('  1. Open personality/Soul.md in a text editor');
  console.log('  2. Find the "Personality Dimensions" section');
  console.log('  3. Edit the values (0.0 to 1.0)');
  console.log('  4. Save the file');
  console.log('  5. Restart the bot');
  console.log();
  console.log('  Example changes:');
  console.log('    warmth: 0.8 → 0.95 (extra friendly)');
  console.log('    humor: 0.5 → 0.8 (more playful)');
  console.log('    bravery: 0.6 → 0.3 (more cautious)');
  console.log();

  console.log('='.repeat(60));
  console.log('Demo Complete!');
  console.log('='.repeat(60));
}

// Run the demo
runDemo().catch(error => {
  console.error('Demo failed:', error);
  process.exit(1);
});
