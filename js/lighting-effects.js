import { EventTimeline } from './event-timeline.js';

export class LightingEffects {
  constructor(tiles, cabinet, runner, audio, scale = 1) {
    this.tiles = tiles;
    this.cabinet = cabinet;
    this.runner = runner;
    this.audio = audio;
    this.scale = scale;
    this.timeline = new EventTimeline(scale);
    this.featureValue = document.getElementById('feature-value');
  }
  wait(ms) { return this.timeline.wait(ms); }
  show(indices) {
    const lit = new Set(indices);
    this.tiles.forEach((tile, i) => {
      tile.classList.toggle('lit', lit.has(i));
      tile.classList.remove('trail-1', 'trail-2', 'train-trail');
    });
  }
  // Distance ring used by the spread / focus effects.
  ring(target, distance) {
    const length = this.tiles.length;
    return this.show([(target + distance) % length, (target - distance + length) % length]);
  }
  only(index) { this.show([index]); }
  blackout() {
    this.tiles.forEach(tile => tile.classList.remove('lit', 'trail-1', 'trail-2', 'train-trail', 'final'));
  }
  dim(on) { this.cabinet.classList.toggle('board-dim', Boolean(on)); }
  setPower(power = 0) {
    if (power) this.cabinet.dataset.power = String(power);
    else delete this.cabinet.dataset.power;
  }
  // Walk an explicit lamp order once. Used for wave sweeps.
  async cascade(order, speed = 34, { tick = true } = {}) {
    for (const index of order) {
      await this.timeline.cue(speed, () => this.show([index]), tick ? () => this.audio.tick('SPINNING', speed) : null);
    }
  }
  centerFlash(event) {
    this.cabinet.dataset.special = event || '';
    this.cabinet.classList.toggle('special-active', Boolean(event));
    const names = {SMALL_THREE:'小三元',BIG_THREE:'大三元',BIG_FOUR:'大四喜',
      DOUBLE_CANNON:'双响炮',TRAIN:'开火车',GRAND_SLAM:'大满贯'};
    // The centre element is owned by MultiplierController, so the event name is
    // published as data instead of overwriting the live multiplier readout.
    if (event) this.featureValue.dataset.event = names[event] || event;
    else delete this.featureValue.dataset.event;
    this.featureValue.classList.toggle('special-display', Boolean(event));
    this.featureValue.setAttribute('aria-label', event ? `${names[event]} 中央功能灯` : '中央功能盘数值');
  }
  betWindowFlash(symbol) {
    const lane = document.querySelector(`.bet-lane[data-channel="${symbol}"]`);
    if (!lane) return;
    lane.classList.add('special-hit');
    const button = document.querySelector(`.bet-key[data-channel="${symbol}"]`);
    button?.classList.add('winner');
    setTimeout(() => { lane.classList.remove('special-hit'); button?.classList.remove('winner'); }, Math.max(80, 450 * this.scale));
  }
  holdBetWindow(symbol) {
    document.querySelector(`.bet-lane[data-channel="${symbol}"]`)?.classList.add('special-complete');
    document.querySelector(`.bet-key[data-channel="${symbol}"]`)?.classList.add('special-complete');
  }
  clearBetWindows() { document.querySelectorAll('.bet-lane,.bet-key').forEach(item => item.classList.remove('special-hit', 'special-complete', 'winner')); }
  vibrate(pattern) { if (typeof navigator.vibrate === 'function') navigator.vibrate(pattern); }
  async flashCell(index, count = 2, power = 1) {
    for (let i = 0; i < count; i++) {
      await this.timeline.cue(i ? 85 : 1, () => { this.show([index]); this.betWindowFlash(this.runner.cells[index].symbol); this.vibrate(power > 1 ? [30,30,50] : 20); }, () => this.audio.hit(power));
      await this.wait(115);
      this.show([]);
    }
    this.show([index]);
  }
  async flashSymbol(symbol, count = 2) {
    const indices = this.runner.cells.filter(cell => cell.symbol === symbol).map(cell => cell.index);
    for (let i = 0; i < count; i++) { this.show(indices); await this.wait(160); this.show([]); await this.wait(85); }
    this.show(indices);
  }
  async chaseClockwise(rounds = 1, speed = 45) { for (let i = 0; i < rounds * this.tiles.length; i++) await this.timeline.cue(speed, () => this.runner.show(this.runner.index + 1), () => this.audio.tick('SPINNING', speed)); }
  async chaseCounterClockwise(rounds = 1) { for (let i = 0; i < rounds * this.tiles.length; i++) await this.timeline.cue(45, () => this.runner.show(this.runner.index - 1), () => this.audio.tick('SPINNING', 50)); }
  async allFlash(times = 3) {
    const all = this.tiles.map((_, index) => index);
    for (let i = 0; i < times; i++) { await this.timeline.cue(i ? 95 : 1, () => this.show(all), () => this.audio.boom(1)); await this.wait(140); this.show([]); }
    this.show(all);
  }
  async jackpotCelebration() { this.audio.boom(3); await this.allFlash(3); await this.chaseClockwise(1); }
  restore(index = this.runner.index) {
    this.setPower(0); this.dim(false); this.centerFlash(''); this.clearBetWindows(); this.runner.show(index, false);
  }
}
