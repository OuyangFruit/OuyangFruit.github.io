import { EXCITEMENT_TIERS, EXCITEMENT_ORDER, LEGENDARY_COOLDOWN, isSpecial } from './config/special-events.js';

// Pity / excitement curve. Index = quiet rounds since the last surprise.
// Average gap lands around 4 rounds, which is the "often surprising, never
// constant" band the cabinet should sit in.
const PITY_LADDER = [.09, .15, .24, .36, .52, .68, .78];
const GUARANTEED_HEAT = PITY_LADDER.length;

export class FunModeController {
  constructor({ enabled = true, random = Math.random } = {}) {
    this.enabled = enabled;
    this.random = random;
    this.quietRounds = 0;
    this.legendaryCooldown = 0;
    this.rounds = 0;
    this.events = 0;
    this.history = [];
  }

  get heat() { return this.quietRounds; }

  eventChance() {
    if (!this.enabled) return .011;
    return PITY_LADDER[Math.min(this.quietRounds, PITY_LADDER.length - 1)];
  }

  eligible() {
    return EXCITEMENT_ORDER.filter(type => {
      const tier = EXCITEMENT_TIERS[type];
      if (this.quietRounds < tier.minHeat) return false;
      if (tier.rarity === 'legendary' && this.legendaryCooldown > 0) return false;
      return true;
    });
  }

  weightedEvent(pool) {
    const total = pool.reduce((sum, type) => sum + EXCITEMENT_TIERS[type].weight, 0);
    let roll = this.random() * total;
    for (const type of pool) {
      roll -= EXCITEMENT_TIERS[type].weight;
      if (roll < 0) return type;
    }
    return pool[pool.length - 1];
  }

  // Returns '' or an excitement type. Callers branch on isSpecial(type).
  draw() {
    this.rounds++;
    if (this.legendaryCooldown > 0) this.legendaryCooldown--;
    const guaranteed = this.quietRounds >= GUARANTEED_HEAT;
    if (!guaranteed && this.random() >= this.eventChance()) {
      this.quietRounds++;
      return '';
    }
    const type = this.weightedEvent(this.eligible());
    this.noteEvent(type);
    return type;
  }

  noteEvent(type) {
    this.quietRounds = 0;
    this.events++;
    this.history.push(type);
    if (this.history.length > 40) this.history.shift();
    if (EXCITEMENT_TIERS[type]?.rarity === 'legendary') this.legendaryCooldown = LEGENDARY_COOLDOWN;
  }

  // Kept for existing call sites: a high multiplier fruit win is itself a surprise.
  noteMajor(type = 'HIGH_MULTIPLIER') { this.noteEvent(type); }

  stats() {
    return {
      rounds: this.rounds,
      events: this.events,
      heat: this.quietRounds,
      legendaryCooldown: this.legendaryCooldown,
      averageGap: this.events ? +(this.rounds / this.events).toFixed(2) : 0,
      history: [...this.history]
    };
  }
}

export { EXCITEMENT_TIERS, isSpecial };
