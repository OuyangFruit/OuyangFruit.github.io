import { BOARD_CELLS, indicesFor, pickIndex } from './board-model.js';
import { PRIZES } from './prize-table.js';
import { GAME_EVENTS as E } from './game-events.js';

const TYPES = Object.freeze({
  SMALL_THREE: '小三元', BIG_THREE: '大三元', BIG_FOUR: '大四喜',
  DOUBLE_CANNON: '双响炮', TRAIN: '开火车', GRAND_SLAM: '大满贯'
});

// Presentation plans contain no outcome selection or payout rules. Each entry
// names the celebration lighting plan it hands off to, so the lamp choreography
// stays in one place (js/jackpot-lighting.js).
export const PRESENTATIONS = Object.freeze({
  SMALL_THREE: { audioSequence: 'rising-three', lightSequence: 'SMALL_THREE', animationSequence: 'center', duration: 180, payoutSequence: 'three-hits' },
  BIG_THREE: { audioSequence: 'bass-three', lightSequence: 'BIG_THREE', animationSequence: 'center', duration: 200, payoutSequence: 'three-hits' },
  BIG_FOUR: { audioSequence: 'four-directions', lightSequence: 'BIG_FOUR', animationSequence: 'cabinet', duration: 200, payoutSequence: 'four-hits' },
  DOUBLE_CANNON: { audioSequence: 'two-impacts', lightSequence: 'DOUBLE_CANNON', animationSequence: 'pause-and-burst', duration: 210, payoutSequence: 'two-hits' },
  TRAIN: { audioSequence: 'chug-chug', lightSequence: 'TRAIN', animationSequence: 'train-trail', duration: 220, payoutSequence: 'carriages' },
  GRAND_SLAM: { audioSequence: 'full-fanfare', lightSequence: 'GRAND_SLAM', animationSequence: 'all-displays', duration: 250, payoutSequence: 'eight-hits' }
});

export class SpecialEventEngine {
  constructor(runner, effects, audio) {
    this.runner = runner;
    this.effects = effects;
    this.audio = audio;
    this.handlers = {
      SMALL_THREE: ctx => this.smallThree(ctx),
      BIG_THREE: ctx => this.bigThree(ctx),
      BIG_FOUR: ctx => this.bigFour(ctx),
      DOUBLE_CANNON: ctx => this.doubleCannon(ctx),
      TRAIN: ctx => this.train(ctx),
      GRAND_SLAM: ctx => this.grandSlam(ctx)
    };
    this.presentations = PRESENTATIONS;
  }

  async run(type, ctx) {
    if (!this.handlers[type]) throw new Error(`Unknown special event ${type}`);
    ctx.state('SPECIAL_INTRO', `${TYPES[type]} · 准备开始`);
    await this.effects.timeline.cue(this.presentations[type].duration,
      () => this.effects.centerFlash(type), () => this.audio.warning());
    // Music for the whole event is started once, here, so it swells across
    // every hit instead of restarting on each one.
    ctx.emit?.(E.JACKPOT_START, { level: 'SPECIAL_EVENT', type, duration: this.presentations[type].duration });
    try { await this.handlers[type](ctx); }
    finally { this.audio.endSpecialEvent(); this.effects.restore(); }
  }

  // One lamp run + one real multiplier reveal + one payout. The multiplier the
  // player sees is the same value calculateWin() receives in ctx.settle().
  async hit(symbol, ctx, step, {
    index, power = 1, loops = 1, countDuration, tempo = 1, flashes, multiplierTier = 'special'
  } = {}) {
    ctx.state('SPECIAL_RUNNING', `${TYPES[ctx.event]} · 第 ${step} 次跑灯`);
    const target = index ?? pickIndex(symbol);
    const cell = BOARD_CELLS[target];
    await ctx.spin(target, { loops, special: true, tempo });
    const tier = cell.multiplier >= 50 ? 'jackpot' : power >= 2 ? 'big' : 'small';
    const wagered = ctx.betFor(cell.betType) > 0 && cell.multiplier > 0;
    ctx.emit?.(E.FRUIT_HIT, { symbol, tier, index: target, wagered });
    this.effects.betWindowFlash(symbol);
    let multiplier = cell.multiplier;
    if (wagered) {
      multiplier = ctx.multiplier.choose(ctx.forcedTier || multiplierTier);
      if (flashes !== 0) await this.effects.flashCell(target, flashes ?? 2, power);
      await ctx.multiplier.quickReveal(multiplier, '', 'special');
    }
    await ctx.settle(BOARD_CELLS[target], { multiplier, countDuration });
    return target;
  }

  async smallThree(ctx) {
    const symbols = ['BELL', 'GRAPE', 'ORANGE'];
    const indices = [];
    for (const [i, symbol] of symbols.entries()) indices.push(await this.hit(symbol, ctx, i + 1, { power: i + 1 }));
    await ctx.celebrate('SMALL_THREE', { indices, target: indices[indices.length - 1], label: '小三元', type: 'SMALL_THREE' });
  }

  async bigThree(ctx) {
    const symbols = ['SEVEN', 'STAR', 'WATERMELON'];
    const indices = [];
    for (const [i, symbol] of symbols.entries()) indices.push(await this.hit(symbol, ctx, i + 1, { power: 2 + i }));
    const all = symbols.flatMap(indicesFor);
    await ctx.celebrate('BIG_THREE', { indices: all, target: indices[indices.length - 1], label: '大三元', type: 'BIG_THREE' });
  }

  async bigFour(ctx) {
    const apples = indicesFor('APPLE');
    const hit = [];
    for (const [i, index] of apples.entries()) {
      hit.push(await this.hit('APPLE', ctx, i + 1, {
        index, power: Math.min(3, 1 + i), loops: 1, tempo: .7,
        flashes: i < 2 ? 1 : 2, countDuration: 220
      }));
      this.effects.holdBetWindow('APPLE');
    }
    await ctx.celebrate('BIG_FOUR', { indices: apples, target: hit[hit.length - 1], label: '大四喜', type: 'BIG_FOUR' });
  }

  async doubleCannon(ctx) {
    const choices = ['APPLE', 'ORANGE', 'BELL', 'WATERMELON', 'SEVEN', 'BAR'];
    const first = choices[Math.floor(Math.random() * choices.length)];
    const second = choices[(choices.indexOf(first) + 2 + Math.floor(Math.random() * 3)) % choices.length];
    const firstIndex = await this.hit(first, ctx, 1, { power: 2 });
    await this.effects.wait(380);
    const secondIndex = await this.hit(second, ctx, 2, { power: 3 });
    await ctx.celebrate('DOUBLE_CANNON', { indices: [firstIndex, secondIndex], target: secondIndex, label: '双响炮', type: 'DOUBLE_CANNON' });
  }

  async train(ctx) {
    const direction = Math.random() < .5 ? 1 : -1;
    const carriages = 4 + Math.floor(Math.random() * 4);
    const start = Math.floor(Math.random() * BOARD_CELLS.length);
    this.audio.specialCue('TRAIN');
    await ctx.spin(start, { loops: 1, special: true });
    let last = start;
    await this.runner.moveTrain(start, carriages + 24, direction, async (index, step) => {
      if (step < 24 || step >= 24 + carriages) return;
      last = index;
      const cell = BOARD_CELLS[index];
      this.effects.betWindowFlash(cell.symbol);
      ctx.emit?.(E.FRUIT_HIT, { symbol: cell.symbol, tier: 'big', index, wagered: ctx.betFor(cell.betType) > 0 });
      this.audio.hit(1);
      await ctx.settle(cell, { countDuration: 180 });
    });
    ctx.emit?.(E.JACKPOT_PHASE2, { level: 'TRAIN', type: 'TRAIN' });
    await ctx.celebrate('TRAIN', { target: last, direction, label: '开火车', type: 'TRAIN' });
  }

  async grandSlam(ctx) {
    this.effects.show([]);
    await this.effects.wait(200);
    for (const [i, symbol] of ['APPLE', 'ORANGE', 'GRAPE', 'BELL', 'WATERMELON', 'STAR', 'SEVEN', 'BAR'].entries()) {
      await this.hit(symbol, ctx, i + 1, {
        power: i < 4 ? 2 : 3, loops: i === 0 ? 2 : 1,
        countDuration: 180, tempo: .55, flashes: 1
      });
      this.effects.holdBetWindow(symbol);
    }
    await ctx.celebrate('GRAND_SLAM', { target: this.runner.index, label: '大满贯', type: 'GRAND_SLAM' });
  }
}
