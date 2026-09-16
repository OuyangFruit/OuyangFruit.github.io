const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

export class LightingEffects {
  constructor(tiles, cabinet, runner, audio, scale = 1) {
    this.tiles = tiles;
    this.cabinet = cabinet;
    this.runner = runner;
    this.audio = audio;
    this.scale = scale;
    this.featureValue = document.getElementById('feature-value');
  }
  wait(ms) { return pause(Math.max(1, ms * this.scale)); }
  show(indices) {
    const lit = new Set(indices);
    this.tiles.forEach((tile, i) => {
      tile.classList.toggle('lit', lit.has(i));
      tile.classList.remove('trail-1', 'trail-2', 'train-trail');
    });
  }
  centerFlash(event) {
    this.cabinet.dataset.special = event || '';
    this.cabinet.classList.toggle('special-active', Boolean(event));
    const names = {SMALL_THREE:'小三元',BIG_THREE:'大三元',BIG_FOUR:'大四喜',
      DOUBLE_CANNON:'双响炮',TRAIN:'开火车',GRAND_SLAM:'大满贯'};
    this.featureValue.textContent = names[event] || '32';
    this.featureValue.classList.toggle('special-display', Boolean(event));
    this.featureValue.setAttribute('aria-label', event ? `${names[event]} 中央功能灯` : '中央功能盘数值');
  }
  betWindowFlash(symbol) {
    const lane = document.querySelector(`.bet-lane[data-channel="${symbol}"]`);
    if (!lane) return;
    lane.classList.add('special-hit');
    setTimeout(() => lane.classList.remove('special-hit'), Math.max(80, 450 * this.scale));
  }
  holdBetWindow(symbol) {
    document.querySelector(`.bet-lane[data-channel="${symbol}"]`)?.classList.add('special-complete');
  }
  clearBetWindows() { document.querySelectorAll('.bet-lane').forEach(lane => lane.classList.remove('special-hit', 'special-complete')); }
  vibrate(pattern) { if (typeof navigator.vibrate === 'function') navigator.vibrate(pattern); }
  async flashCell(index, count = 2, power = 1) {
    for (let i = 0; i < count; i++) {
      this.show([index]); this.audio.hit(power); this.vibrate(power > 1 ? [30,30,50] : 20);
      await this.wait(115);
      this.show([]);
      await this.wait(85);
    }
    this.show([index]);
  }
  async flashSymbol(symbol, count = 2) {
    const indices = this.runner.cells.filter(cell => cell.symbol === symbol).map(cell => cell.index);
    for (let i = 0; i < count; i++) { this.show(indices); await this.wait(160); this.show([]); await this.wait(85); }
    this.show(indices);
  }
  async chaseClockwise(rounds = 1, speed = 45) { for (let i = 0; i < rounds * this.tiles.length; i++) { this.runner.show(this.runner.index + 1); this.audio.tick('SPINNING', speed); await this.wait(speed); } }
  async chaseCounterClockwise(rounds = 1) { for (let i = 0; i < rounds * this.tiles.length; i++) { this.runner.show(this.runner.index - 1); this.audio.tick('SPINNING', 50); await this.wait(45); } }
  async allFlash(times = 3) {
    const all = this.tiles.map((_, index) => index);
    for (let i = 0; i < times; i++) { this.show(all); await this.wait(140); this.show([]); await this.wait(95); }
    this.show(all);
  }
  async jackpotCelebration() { this.audio.boom(3); await this.allFlash(3); await this.chaseClockwise(1); }
  restore(index = this.runner.index) {
    this.centerFlash(''); this.clearBetWindows(); this.runner.show(index, false);
  }
}
