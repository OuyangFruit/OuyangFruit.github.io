const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export class WinAnimationEngine {
  constructor(tiles, cabinet, lightEngine) {
    this.tiles = tiles;
    this.cabinet = cabinet;
    this.lightEngine = lightEngine;
  }

  show(indices) {
    const lit = new Set(indices);
    this.tiles.forEach((tile, index) => {
      tile.classList.toggle('lit', lit.has(index));
      tile.classList.remove('trail-1', 'trail-2');
    });
  }

  async flash(target, count, large = false) {
    for (let n = 0; n < count; n++) {
      this.show(large ? this.tiles.map((_, i) => i).filter(i => i % 2 === n % 2 || i === target) : [target]);
      await sleep(170);
      this.show([]);
      await sleep(140);
    }
  }

  async jackpot(target) {
    const all = this.tiles.map((_, i) => i);
    for (const indices of [all, [], all.filter(i => i % 2), all.filter(i => i % 2 === 0)]) {
      this.show(indices); await sleep(230);
    }
    for (let i = 0; i < all.length; i++) { this.show([i]); await sleep(43); }
    for (let i = 0; i < 3; i++) { this.show(all); await sleep(115); this.show([]); await sleep(100); }
    this.show([target]);
  }

  async play(tier, target) {
    if (tier === 'none') return;
    this.lightEngine.setPhase('WIN_ANIMATION');
    this.cabinet.classList.add(`win-${tier}`);
    if (tier === 'jackpot') await this.jackpot(target);
    else await this.flash(target, tier === 'big' ? 5 : 4, tier === 'big');
    this.show([target]);
    this.tiles[target].classList.add('final');
    await sleep(500);
    this.cabinet.classList.remove(`win-${tier}`);
    this.lightEngine.setPhase('STOP');
  }
}
