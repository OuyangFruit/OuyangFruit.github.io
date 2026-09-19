import { GAME_EVENTS as E } from './game-events.js';

const ROLL_VALUES = [2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24, 32, 48, 64];

// Every pool is the set of real payout multipliers for that tier: the number the
// player sees is the number calculateWin() uses.
export const MULTIPLIER_POOLS = Object.freeze({
  none: [2, 3, 4, 5],
  small: [2, 3, 4, 5, 6, 8, 10],
  big: [12, 16, 20, 24, 32],
  jackpot: [32, 48, 64],
  special: [8, 12, 16, 24, 32],
  high: [16, 24, 32, 48]
});

// Total reveal length per tier. Small prizes snap, jackpots take their time.
export const REVEAL_TIMING = Object.freeze({
  none: 380, small: 700, special: 800, medium: 1000, big: 1500, high: 1600, jackpot: 2200
});

export class MultiplierController {
  constructor(element, audio, scale = 1, bus = null) {
    this.element = element;
    this.audio = audio;
    this.scale = scale;
    this.bus = bus;
    this.value = Number(String(element.textContent).replace(/\D/g, '')) || 32;
    this.idleText = element.textContent.trim() || '32';
    this.timer = 0;
    this.busy = false;
  }

  choose(tier = 'small') {
    const pool = MULTIPLIER_POOLS[tier] || MULTIPLIER_POOLS.small;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  timing(tier) { return REVEAL_TIMING[tier] ?? REVEAL_TIMING.small; }

  wait(ms) { return new Promise(resolve => { this.timer = setTimeout(resolve, Math.max(1, ms * this.scale)); }); }

  setText(value) { this.element.textContent = String(value); }

  // Idle display keeps the printed panel look until the first reveal of a round.
  async arm() {
    this.busy = true;
    this.stopTimer();
    this.element.classList.remove('multiplier-reveal');
    this.element.classList.add('multiplier-armed');
    this.element.dataset.label = '';
    this.setText('--');
    this.bus?.emit(E.MULTIPLIER_ARM);
    this.audio?.multiplierArm?.();
  }

  async roll(durationMs = 400) {
    this.element.classList.add('multiplier-rolling');
    this.bus?.emit(E.MULTIPLIER_START, { duration: durationMs });
    const step = Math.max(14, 48 * this.scale);
    const deadline = Date.now() + Math.max(120, durationMs * this.scale);
    let index = Math.floor(Math.random() * ROLL_VALUES.length);
    while (Date.now() < deadline) {
      index = (index + 1 + Math.floor(Math.random() * 3)) % ROLL_VALUES.length;
      this.setText(ROLL_VALUES[index]);
      this.bus?.emit(E.MULTIPLIER_TICK, { value: ROLL_VALUES[index], phase: 'roll' });
      await this.wait(step);
    }
    this.element.classList.remove('multiplier-rolling');
  }

  // Descending ladder that always ends on the real value, never past it.
  ladder(value, steps) {
    const above = ROLL_VALUES.filter(n => n > value);
    if (above.length >= steps - 1) return [...above.slice(above.length - (steps - 1)), value];
    const below = ROLL_VALUES.filter(n => n < value);
    return [...below.slice(Math.max(0, below.length - (steps - 1))), value];
  }

  async land(value, { tier = 'small', label = '' } = {}) {
    const total = this.timing(tier);
    await this.arm();
    await this.roll(total * .42);
    const steps = Math.max(5, Math.round(total / 150));
    const ladder = this.ladder(value, steps);
    for (let i = 0; i < ladder.length; i++) {
      const t = ladder.length === 1 ? 1 : i / (ladder.length - 1);
      this.setText(ladder[i]);
      this.bus?.emit(E.MULTIPLIER_TICK, { value: ladder[i], phase: 'decelerate', final: i === ladder.length - 1 });
      await this.wait(46 + t * t * 300);
    }
    this.reveal(value, label, tier);
    return value;
  }

  // Fast lane for special-event hits: no long roll, but still a real reveal beat.
  async quickReveal(value, label = '', tier = 'special') {
    this.setText('--');
    this.element.classList.add('multiplier-armed');
    await this.wait(120);
    this.reveal(value, label, tier);
    return value;
  }

  reveal(value, label = '', tier = 'small') {
    this.value = value;
    this.busy = false;
    this.stopTimer();
    this.element.classList.remove('multiplier-rolling', 'multiplier-armed');
    this.setText(`×${value}`);
    this.element.dataset.label = label;
    this.element.dataset.tier = tier;
    void this.element.offsetWidth;
    this.element.classList.add('multiplier-reveal');
    this.bus?.emit(E.MULTIPLIER_REVEAL, { value, tier, label });
    clearTimeout(this.revealTimer);
    this.revealTimer = setTimeout(() => this.element.classList.remove('multiplier-reveal'), Math.max(120, 1400 * this.scale));
  }

  stopTimer() { clearInterval(this.timer); clearTimeout(this.timer); this.timer = 0; }

  reset() {
    this.stopTimer();
    this.busy = false;
    this.element.textContent = this.idleText;
    this.element.dataset.label = '';
    delete this.element.dataset.tier;
    this.element.classList.remove('multiplier-reveal', 'multiplier-rolling', 'multiplier-armed');
  }
}
