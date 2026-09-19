import { GAME_EVENTS as E } from './game-events.js';
import { REVEAL_LENGTH, FAKE_OUT } from './config/balance.js';

const ROLL_VALUES = [2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24, 32, 48, 64, 96, 128, 256];
const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

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
export const REVEAL_TIMING = REVEAL_LENGTH;

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

  // Small caption above the readout: the number is never left ambiguous.
  setCaption(text) {
    if (!this.captionEl) return;
    this.captionEl.textContent = text || 'MULTIPLIER';
    this.captionEl.classList.toggle('caption-alt', Boolean(text) && text !== 'MULTIPLIER');
  }

  clearCentreClasses() {
    this.element.classList.remove('center-symbol', 'formula', 'digit-lock', 'multiplier-fakeout');
  }

  // Settlement step 1: which lamp did we hit?
  showSymbol(label) {
    this.stopTimer();
    this.clearCentreClasses();
    this.element.classList.remove('multiplier-reveal', 'multiplier-rolling', 'multiplier-armed');
    this.element.textContent = label;
    this.element.dataset.label = '';
    delete this.element.dataset.tier;
    this.element.classList.add('center-symbol');
    this.setCaption('命中');
  }

  // Settlement step 3: the arithmetic, so WIN is never a mystery number.
  showFormula(text, caption = '结算') {
    this.element.dataset.label = text;
    this.element.classList.remove('center-symbol');
    this.setCaption(caption);
  }

  // Idle display keeps the printed panel look until the first reveal of a round.
  async arm() {
    this.busy = true;
    this.stopTimer();
    this.clearCentreClasses();
    this.element.classList.remove('multiplier-reveal');
    this.element.classList.add('multiplier-armed');
    this.element.dataset.label = '';
    delete this.element.dataset.tier;
    this.setText('--');
    this.setCaption('MULTIPLIER');
    this.bus?.emit(E.MULTIPLIER_ARM);
    this.audio?.multiplierArm?.();
  }

  async roll(durationMs = 400, pool = ROLL_VALUES) {
    this.element.classList.add('multiplier-rolling');
    this.bus?.emit(E.MULTIPLIER_START, { duration: durationMs });
    const step = Math.max(14, 48 * this.scale);
    const deadline = Date.now() + Math.max(120, durationMs * this.scale);
    let index = Math.floor(Math.random() * pool.length);
    while (Date.now() < deadline) {
      index = (index + 1 + Math.floor(Math.random() * 3)) % pool.length;
      this.setText(pool[index]);
      this.bus?.emit(E.MULTIPLIER_TICK, { value: pool[index], phase: 'roll' });
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

  // Largest display value strictly below the real one: the decoy a fake-out
  // pauses on before the jump.
  decoyFor(value, pool = ROLL_VALUES) {
    const below = pool.filter(n => n < value);
    return below.length ? below[below.length - 1] : value;
  }

  // A range lamp only ever shows values from its own printed window.
  poolLadder(value, pool, steps) {
    const list = [];
    for (let i = 0; i < steps - 1; i++) list.push(pool[Math.floor(Math.random() * pool.length)]);
    list.push(value);
    return list;
  }

  async land(value, { tier = 'small', label = '', pool = null } = {}) {
    const total = this.timing(tier);
    const values = pool && pool.length ? pool : ROLL_VALUES;
    this.setCaption('MULTIPLIER');
    await this.arm();
    await this.roll(total * .42, values);
    const steps = Math.max(5, Math.round(total / 150));
    // Fake-out: only on the big tiers, and only sometimes, so it stays a surprise.
    const fakeOut = FAKE_OUT.tiers.includes(tier) && value > 8 && Math.random() < FAKE_OUT.chance;
    const decoy = fakeOut ? this.decoyFor(value, values) : value;
    const ladder = pool && pool.length ? this.poolLadder(decoy, values, steps) : this.ladder(decoy, steps);
    for (let i = 0; i < ladder.length; i++) {
      const t = ladder.length === 1 ? 1 : i / (ladder.length - 1);
      this.setText(ladder[i]);
      this.bus?.emit(E.MULTIPLIER_TICK, { value: ladder[i], phase: 'decelerate', final: i === ladder.length - 1 });
      await this.wait(46 + t * t * 300);
    }
    if (fakeOut) {
      // Looks finished ... then one more hit.
      this.element.classList.add('multiplier-fakeout');
      this.bus?.emit(E.MULTIPLIER_TICK, { value: decoy, phase: 'fakeout' });
      await this.wait(FAKE_OUT.holdMs);
      this.element.classList.remove('multiplier-fakeout');
      this.setText(value);
      this.bus?.emit(E.MULTIPLIER_TICK, { value, phase: 'jump', final: true });
      await this.wait(140);
    }
    this.reveal(value, label, tier);
    return value;
  }

  // 单双: the centre shows a rolling 1-9 digit instead of a multiplier.
  digitLadder(value, steps) {
    const others = DIGITS.filter(n => n !== value);
    const ladder = [];
    for (let i = 0; i < steps - 1; i++) ladder.push(others[Math.floor(Math.random() * others.length)]);
    ladder.push(value);
    return ladder;
  }

  async rollDigits({ target = 1, duration = 1500, tier = 'high', label = '' } = {}) {
    await this.arm();
    this.setCaption('单双');
    await this.roll(duration * .45, DIGITS);
    const steps = Math.max(6, Math.round(duration / 150));
    const ladder = this.digitLadder(target, steps);
    for (let i = 0; i < ladder.length; i++) {
      const t = ladder.length === 1 ? 1 : i / (ladder.length - 1);
      this.setText(ladder[i]);
      this.bus?.emit(E.MULTIPLIER_TICK, { value: ladder[i], phase: 'decelerate', digit: true, final: i === ladder.length - 1 });
      await this.wait(50 + t * t * 330);
    }
    this.lockDigit(target, label);
    await this.wait(300);
    return target;
  }

  lockDigit(value, label = '') {
    this.busy = false;
    this.stopTimer();
    this.clearCentreClasses();
    this.element.classList.remove('multiplier-rolling', 'multiplier-armed');
    this.setText(String(value));
    this.element.dataset.label = label;
    this.element.dataset.tier = 'digit';
    this.setCaption('单双');
    void this.element.offsetWidth;
    this.element.classList.add('digit-lock');
    this.bus?.emit(E.MULTIPLIER_REVEAL, { value, tier: 'digit', label });
    clearTimeout(this.revealTimer);
    this.revealTimer = setTimeout(() => this.element.classList.remove('digit-lock'), Math.max(120, 1000 * this.scale));
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
    this.clearCentreClasses();
    this.element.classList.remove('multiplier-rolling', 'multiplier-armed');
    this.setText(`×${value}`);
    this.element.dataset.label = label;
    this.element.dataset.tier = tier;
    this.setCaption('MULTIPLIER');
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
    this.clearCentreClasses();
    this.element.textContent = this.idleText;
    this.element.dataset.label = '';
    delete this.element.dataset.tier;
    this.element.classList.remove('multiplier-reveal', 'multiplier-rolling', 'multiplier-armed');
    this.element.classList.remove('multiplier-fakeout', 'digit-lock');
    this.setCaption('MULTIPLIER');
  }
}
