import { BOARD_CELLS, indicesFor, pickIndex } from './board-model.js';

const TYPES = Object.freeze({
  SMALL_THREE: '小三元', BIG_THREE: '大三元', BIG_FOUR: '大四喜',
  DOUBLE_CANNON: '双响炮', TRAIN: '开火车', GRAND_SLAM: '大满贯'
});
// Presentation plans contain no outcome selection or payout rules.
export const PRESENTATIONS = Object.freeze({
  SMALL_THREE: {audioSequence:'rising-three',lightSequence:'three-symbols',animationSequence:'center',duration:180,payoutSequence:'three-hits'},
  BIG_THREE: {audioSequence:'bass-three',lightSequence:'three-symbols-and-board',animationSequence:'center',duration:200,payoutSequence:'three-hits'},
  BIG_FOUR: {audioSequence:'four-directions',lightSequence:'four-apple-lamps',animationSequence:'cabinet',duration:200,payoutSequence:'four-hits'},
  DOUBLE_CANNON: {audioSequence:'two-impacts',lightSequence:'two-bursts',animationSequence:'pause-and-burst',duration:210,payoutSequence:'two-hits'},
  TRAIN: {audioSequence:'chug-chug',lightSequence:'24-lamp-chase',animationSequence:'train-trail',duration:220,payoutSequence:'carriages'},
  GRAND_SLAM: {audioSequence:'full-fanfare',lightSequence:'all-lamps',animationSequence:'all-displays',duration:250,payoutSequence:'eight-hits'}
});

export class SpecialEventEngine {
  constructor(runner, effects, audio) {
    this.runner = runner; this.effects = effects; this.audio = audio;
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
      () => this.effects.centerFlash(type), () => {
        this.audio.warning();
        if (!this.audio.specialEvent(type)) this.audio.specialCue(type);
      });
    try { await this.handlers[type](ctx); }
    finally { this.audio.endSpecialEvent(); this.effects.restore(); }
  }
  async hit(symbol, ctx, step, { index = pickIndex(symbol), power = 1, loops = 1, countDuration, tempo = 1, flashes } = {}) {
    ctx.state('SPECIAL_RUNNING', `${TYPES[ctx.event]} · 第 ${step} 次跑灯`);
    await this.runner.spinTo(index, { loops, special: true, tempo });
    this.audio.specialCue(ctx.event, step - 1);
    await this.effects.flashCell(index, flashes ?? 1 + Math.min(2, power), power);
    this.effects.betWindowFlash(symbol);
    this.audio.prize(symbol, BOARD_CELLS[index].multiplier >= 50 ? 'jackpot' : power >= 2 ? 'big' : 'small');
    await ctx.settle(BOARD_CELLS[index], { special: true, countDuration });
    return index;
  }
  async smallThree(ctx) {
    for (const [i, symbol] of ['BELL','GRAPE','ORANGE'].entries()) {
      await this.hit(symbol, ctx, i + 1, { power: i + 1 });
    }
    this.audio.chime(3); await this.effects.allFlash(1);
    await this.effects.flashSymbol('ORANGE', 3);
  }
  async bigThree(ctx) {
    for (const [i, symbol] of ['SEVEN','STAR','WATERMELON'].entries()) {
      await this.hit(symbol, ctx, i + 1, { power: 2 + i });
    }
    const indices = ['SEVEN','STAR','WATERMELON'].flatMap(indicesFor);
    this.effects.show(indices); this.audio.fanfare(); await this.effects.wait(500);
  }
  async bigFour(ctx) {
    const apples = indicesFor('APPLE');
    for (const [i, index] of apples.entries()) {
      await this.hit('APPLE', ctx, i + 1, { index, power: Math.min(3, 1 + i), loops: 1,
        tempo: .7, flashes: i < 2 ? 1 : 2, countDuration: 220 });
      if (i === 2) this.effects.cabinet.classList.add('cabinet-flash');
    }
    await this.effects.allFlash(2); this.effects.cabinet.classList.remove('cabinet-flash');
  }
  async doubleCannon(ctx) {
    const choices = ['APPLE','ORANGE','BELL','WATERMELON','SEVEN','BAR'];
    const first = choices[Math.floor(Math.random() * choices.length)];
    const second = choices[(choices.indexOf(first) + 2 + Math.floor(Math.random() * 3)) % choices.length];
    await this.hit(first, ctx, 1, { power: 2 });
    await this.effects.wait(380);
    await this.hit(second, ctx, 2, { power: 3 });
    this.audio.boom(2); await this.effects.allFlash(2);
  }
  async train(ctx) {
    const direction = Math.random() < .5 ? 1 : -1;
    const carriages = 4 + Math.floor(Math.random() * 4);
    const start = Math.floor(Math.random() * BOARD_CELLS.length);
    this.audio.specialCue('TRAIN');
    await this.runner.spinTo(start, { loops: 1, special: true });
    await this.runner.moveTrain(start, carriages + 24, direction, async (index, step) => {
      if (step < 24 || step >= 24 + carriages) return;
      const cell = BOARD_CELLS[index];
      this.effects.betWindowFlash(cell.symbol);
      this.audio.specialCue('TRAIN', step);
      this.audio.hit(1);
      await ctx.settle(cell, { special: true, countDuration: 180 });
    });
    this.audio.brake(); await this.effects.wait(700);
    this.audio.boom(3); await this.effects.chaseClockwise(1); await this.effects.allFlash(1);
  }
  async grandSlam(ctx) {
    this.effects.show([]);
    await this.effects.wait(250);
    this.audio.boom(3); this.audio.fanfare();
    for (const [i, symbol] of ['APPLE','ORANGE','GRAPE','BELL','WATERMELON','STAR','SEVEN','BAR'].entries()) {
      await this.hit(symbol, ctx, i + 1, { power: i < 4 ? 2 : 3, loops: i === 0 ? 2 : 1,
        countDuration: 180, tempo: .55, flashes: 1 });
      this.effects.holdBetWindow(symbol);
    }
    await this.effects.chaseClockwise(3, 25);
    await this.effects.allFlash(3);
    this.audio.fanfare(); this.audio.boom(3);
  }
}
