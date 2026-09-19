import { GAME_EVENTS as E } from './game-events.js';
import { LightShowEngine } from './LightShowEngine.js';
import { indicesFor } from './board-model.js';

// Unified Jackpot / Celebration Lighting System.
//
// Each celebration level is a named, ordered plan of lamp phases. The system
// emits jackpot:start / phase1 / phase2 / finale / end on the shared event bus
// while it runs, which is how the music and SFX stay glued to the animation
// instead of racing it.
//
// Eight distinct choreographies, from LEVEL 1 to LEVEL 8:
//   1 SMALL_WIN / MEDIUM_WIN   single lamp, then a short local chase
//   2 (same plans, longer)     centre flash + neighbourhood spread
//   3 SMALL_THREE / BIG_THREE  three lamp groups fire together
//   4 DOUBLE_CANNON            left burst -> pause -> right burst -> all
//   5 BIG_FOUR                 four corner lamps in turn -> centre blast
//   6 TRAIN                    two accelerating laps -> sudden stop
//   7 GRAND_SLAM               eight fruit groups in turn -> whole board
//   8 FAIRY                    天女散花, driven by the full 9.4s clip
export const CELEBRATION_PLANS = Object.freeze({
  MYSTERY_INTRO: { phases: ['dimHold', 'question'], duration: 1100 },
  LOSE: { phases: ['dimFlicker'], duration: 620 },
  SMALL_WIN: { phases: ['hit3'], duration: 720 },
  MEDIUM_WIN: { phases: ['hit3', 'spread', 'localChase'], duration: 1700 },
  BIG_WIN: { phases: ['lap', 'focus', 'burst4', 'alternate', 'allflash'], duration: 2900 },
  HIGH_MULTIPLIER: { phases: ['lap', 'collapse', 'focus'], duration: 2400 },
  SPECIAL_EVENT: { phases: ['lap', 'focus', 'alternate', 'allflash'], duration: 2600 },
  JACKPOT: { phases: ['blackout', 'center', 'burst2', 'wave', 'ring', 'sync', 'finale'], duration: 4200 },

  SMALL_THREE: { phases: ['hit3', 'syncSymbols'], duration: 1300 },
  BIG_THREE: { phases: ['syncSymbols', 'allflash'], duration: 1800 },
  DOUBLE_CANNON: { phases: ['burstLeft', 'pause', 'burstRight', 'allBoom'], duration: 2100 },
  BIG_FOUR: { phases: ['fourStep', 'centerBlast', 'allflash'], duration: 2600 },
  TRAIN: { phases: ['accelLaps', 'hardStop', 'allflash'], duration: 2600 },
  GRAND_SLAM: { phases: ['blackout', 'fruitGroups', 'wave', 'ring', 'sync', 'finale'], duration: 5200 },
  FAIRY: { phases: [], duration: 16000, custom: 'fairy' }
});

const PHASES = {
  dimHold: (s, ctx) => s.dimHold(ctx),
  question: (s, ctx) => s.question(ctx),
  dimFlicker: s => s.dimFlicker(),
  hit3: (s, ctx) => s.shows.burst(ctx.target, 3, 1),
  spread: (s, ctx) => s.spreadRings(ctx),
  localChase: (s, ctx) => s.localChase(ctx),
  lap: s => s.shows.chase(1, 34),
  collapse: (s, ctx) => s.shows.collapse(ctx.target, 5, 78),
  focus: (s, ctx) => s.shows.focus(ctx.target, 4),
  burst: (s, ctx) => s.shows.burst(ctx.target, 3, 2),
  burstLeft: (s, ctx) => s.sideBurst(ctx, 'left'),
  burstRight: (s, ctx) => s.sideBurst(ctx, 'right'),
  allBoom: s => s.shows.allFlash(2, 3),
  burst2: s => s.shows.allFlash(2, 2),
  burst4: (s, ctx) => s.shows.burst(ctx.target, 4, 2),
  pause: (s, ctx) => s.pause(ctx),
  syncSymbols: (s, ctx) => s.syncSymbols(ctx),
  fourStep: (s, ctx) => s.fourStep(ctx),
  centerBlast: (s, ctx) => s.centerBlast(ctx),
  accelLaps: (s, ctx) => s.accelLaps(ctx),
  hardStop: (s, ctx) => s.hardStop(ctx),
  fruitGroups: (s, ctx) => s.fruitGroups(ctx),
  alternate: s => s.shows.alternate(4),
  allflash: (s, ctx) => s.allFlashPhase(ctx),
  blackout: (s, ctx) => s.blackoutPhase(ctx),
  center: (s, ctx) => s.centerPhase(ctx),
  wave: (s, ctx) => s.wavePhase(ctx),
  ring: (s, ctx) => s.ringPhase(ctx),
  sync: (s, ctx) => s.syncPhase(ctx),
  finale: (s, ctx) => s.finalePhase(ctx)
};

const FRUIT_GROUP_ORDER = ['APPLE', 'ORANGE', 'GRAPE', 'BELL', 'WATERMELON', 'STAR', 'SEVEN', 'BAR'];

export class JackpotLightingSystem {
  constructor(effects, { bus = null, scale = 1 } = {}) {
    this.fx = effects;
    this.shows = new LightShowEngine(effects);
    this.bus = bus;
    this.scale = scale;
    this.running = false;
    this.level = '';
  }

  plan(level) { return CELEBRATION_PLANS[level] ?? CELEBRATION_PLANS.SMALL_WIN; }

  static isMajor(level) {
    return ['BIG_WIN', 'JACKPOT', 'HIGH_MULTIPLIER', 'SPECIAL_EVENT', 'GRAND_SLAM', 'FAIRY'].includes(level);
  }

  async play(level, options = {}) {
    const ctx = {
      level,
      target: options.target ?? this.fx.runner.index,
      indices: options.indices ?? [],
      symbols: options.symbols ?? [],
      direction: options.direction ?? 1,
      type: options.type ?? '',
      label: options.label ?? '',
      onRoll: options.onRoll ?? null,
      onStart: options.onStart ?? null
    };
    const plan = this.plan(level);
    this.running = true;
    this.level = level;
    this.ctx = ctx;
    const announce = options.announce !== false;
    const major = JackpotLightingSystem.isMajor(level) || Boolean(options.type);
    if (major && announce) this.bus?.emit(E.JACKPOT_START, { level, target: ctx.target, duration: plan.duration, type: ctx.type });
    this.fx.setPower(1);
    try {
      if (plan.custom === 'fairy') await this.playFairy(ctx);
      else for (const phase of plan.phases) {
        const run = PHASES[phase];
        if (run) await run(this, ctx);
      }
    } finally {
      if (major && announce) this.bus?.emit(E.JACKPOT_END, { level, type: ctx.type });
      this.fx.setPower(0);
      this.fx.dim(false);
      this.fx.centerText('');
      this.running = false;
    }
    return ctx;
  }

  wait(ms) { return this.fx.wait(ms); }

  // ------------------------------------------------------------------ LEVEL 1-2
  async dimFlicker() {
    this.fx.dim(true);
    await this.wait(240);
    this.fx.dim(false);
    await this.wait(160);
  }

  // The 未中奖 cell opens a mystery beat instead of ending the round flat.
  async dimHold(ctx) {
    this.fx.dim(true);
    this.fx.blackout();
    this.fx.centerText('--');
    await this.wait(420);
  }

  async question(ctx) {
    this.fx.centerText('???');
    this.fx.audio.warning?.();
    await this.wait(520);
    this.fx.dim(false);
  }

  async spreadRings(ctx) {
    await this.shows.rings(ctx.target, 2, 95);
    await this.shows.collapse(ctx.target, 2, 95);
  }

  async localChase(ctx) {
    const length = this.fx.tiles.length;
    for (let step = 1; step <= 6; step++) {
      const index = (ctx.target + step) % length;
      await this.fx.timeline.cue(step === 1 ? 60 : 78, () => this.fx.only(index), () => this.fx.audio.tick('SPINNING', 70));
    }
    await this.shows.burst(ctx.target, 2, 1);
  }

  // ------------------------------------------------------------------- LEVEL 4
  // 双响炮: left side, pause, right side, then the whole cabinet.
  sideIndices(side) {
    const length = this.fx.tiles.length;
    const start = side === 'left' ? Math.floor(length / 4) : Math.floor(length / 2) + Math.floor(length / 4);
    return Array.from({ length: 6 }, (_, i) => (start + i) % length);
  }

  async sideBurst(ctx, side) {
    const indices = this.sideIndices(side);
    this.fx.setPower(2);
    for (let i = 0; i < 3; i++) {
      await this.fx.timeline.cue(i ? 80 : 1, () => this.fx.show(indices), () => this.fx.audio.boom(2));
      await this.wait(120);
      this.fx.show([]);
      await this.wait(60);
    }
    this.fx.show(indices);
  }

  async pause(ctx) { await this.wait(ctx.level === 'DOUBLE_CANNON' ? 340 : 240); }

  // ------------------------------------------------------------------- LEVEL 5
  // 大四喜: the four corner apple lamps fire one by one, then the centre blows.
  async fourStep(ctx) {
    const lamps = (ctx.indices.length ? ctx.indices : indicesFor('APPLE')).slice(0, 4);
    for (let step = 0; step < lamps.length; step++) {
      await this.fx.timeline.cue(step ? 150 : 1,
        () => { this.fx.setPower(Math.min(3, step + 1)); this.fx.show(lamps.slice(0, step + 1)); },
        () => this.fx.audio.boom(Math.min(3, step + 1)));
      await this.wait(150 + step * 70);
    }
    this.fx.cabinet.classList.add('cabinet-flash');
    await this.wait(180);
    this.fx.cabinet.classList.remove('cabinet-flash');
  }

  async centerBlast(ctx) {
    this.fx.setPower(3);
    this.fx.centerFlash(ctx.type || 'BIG_FOUR');
    await this.shows.rings(ctx.target, 6, 52);
    await this.wait(180);
  }

  // ------------------------------------------------------------------- LEVEL 6
  // 开火车: the perimeter runs faster every lap and stops dead.
  async accelLaps(ctx) {
    const laps = 3;
    let speed = 62;
    for (let lap = 0; lap < laps; lap++) {
      await this.shows.chase(1, Math.max(20, speed));
      speed -= 15;
    }
    this.fx.setPower(3);
    await this.wait(120);
  }

  // Sudden stop: everything off, a beat of nothing, then the board slams back on.
  async hardStop(ctx) {
    this.fx.blackout();
    this.fx.dim(true);
    this.fx.audio.brake?.();
    await this.wait(260);
    this.fx.dim(false);
    this.fx.audio.boom?.(3);
  }

  // ------------------------------------------------------------------- LEVEL 7
  // 大满贯: each fruit group lights in turn, then the whole board.
  async fruitGroups(ctx) {
    for (const symbol of FRUIT_GROUP_ORDER) {
      const indices = indicesFor(symbol);
      await this.fx.timeline.cue(70,
        () => { this.fx.setPower(2); this.fx.show(indices); },
        () => this.fx.audio.hit(2));
      await this.wait(120);
    }
  }

  async syncSymbols(ctx) {
    const indices = ctx.indices.length ? ctx.indices : [ctx.target];
    this.fx.centerFlash(ctx.type || '');
    await this.shows.sync(indices, 4, 2);
    this.fx.centerFlash('');
  }

  async allFlashPhase(ctx) {
    const power = ctx.level === 'GRAND_SLAM' || ctx.level === 'TRAIN' ? 3 : 2;
    await this.shows.allFlash(3, power);
  }

  async blackoutPhase(ctx) {
    this.fx.dim(true);
    await this.shows.blackout(ctx.level === 'GRAND_SLAM' ? 200 : 120);
    this.bus?.emit(E.JACKPOT_PHASE1, { level: ctx.level, phase: 'blackout' });
  }

  async centerPhase(ctx) {
    this.fx.dim(false);
    this.fx.centerFlash(ctx.type || ctx.level);
    this.fx.audio.boom?.(3);
    this.fx.audio.fanfare?.();
    await this.wait(260);
  }

  async wavePhase(ctx) {
    this.bus?.emit(E.JACKPOT_PHASE2, { level: ctx.level, phase: 'wave' });
    await this.shows.wave(30);
    await this.shows.waveBack(26);
  }

  async ringPhase(ctx) { await this.shows.rings(ctx.target, 11, 58); }

  async syncPhase(ctx) {
    this.bus?.emit(E.JACKPOT_FINALE, { level: ctx.level, phase: 'sync' });
    await this.shows.allFlash(4, 3);
  }

  async finalePhase(ctx) {
    this.fx.setPower(3);
    this.fx.show(this.shows.all);
    await this.wait(ctx.level === 'GRAND_SLAM' ? 520 : 320);
    this.fx.show([]);
    this.fx.only(ctx.target);
  }

  // ------------------------------------------------------------------- LEVEL 8
  // 天女散花: omen, then the full 9.4s clip drives ten lamp beats, the multiplier
  // lands mid-show, and the finale is a 300ms blackout followed by the full board.
  async playFairy(ctx) {
    const shows = this.shows;
    // 1. omen: everything dark, centre shows ???
    this.fx.dim(true);
    this.fx.blackout();
    this.fx.centerFlash('FAIRY');
    this.fx.centerText('???');
    this.fx.audio.warning?.();
    await this.wait(800);

    // 2. the 天女散花 music starts and the banner appears
    this.fx.dim(false);
    ctx.onStart?.();
    await this.wait(260);

    // 3. lamp choreography, one beat per musical phrase
    const beats = [
      () => shows.rings(ctx.target, 10, 52),
      () => this.mirrorPairs(0, 11, 84),
      () => shows.alternate(8, 82),
      () => this.cornerBursts(0, 3),
      () => this.fruitGroups(ctx),
      () => shows.chase(1, 34),
      () => shows.reverseChase(1, 38),
      () => this.centerOut(52),
      () => this.mirrorPairs(1, 11, 74),
      () => shows.wave(26)
    ];
    for (const beat of beats) {
      if (!this.running) return;
      await beat();
    }

    // 4-5. centre rolls the multiplier: fast, then decelerating "哒" hits
    this.fx.centerText('???');
    await this.wait(160);
    if (ctx.onRoll) await ctx.onRoll();

    // 6. the whole cabinet goes dark for a beat
    this.fx.blackout();
    this.fx.dim(true);
    this.fx.centerText('');
    await this.wait(320);

    // 7. final hit: the board slams on and holds while WIN rolls up
    this.fx.dim(false);
    this.fx.setPower(3);
    this.fx.centerFlash('FAIRY');
    await this.shows.allFlash(3, 3);
    this.fx.setPower(3);
    this.fx.show(shows.all);
    this.bus?.emit(E.JACKPOT_FINALE, { level: 'FAIRY', phase: 'finale' });
    await this.wait(760);
  }

  // Mirrored left/right pairs light together.
  async mirrorPairs(offset = 0, steps = 11, speed = 80) {
    const length = this.fx.tiles.length;
    for (let step = 0; step < steps; step++) {
      const index = (offset + step) % length;
      const mirror = (length - index) % length;
      await this.fx.timeline.cue(step ? speed : 1,
        () => this.fx.show([index, mirror]), () => this.fx.audio.tick('SPINNING', speed));
    }
  }

  async cornerBursts(offset = 0, flashes = 3) {
    const corners = indicesFor('APPLE');
    for (const index of corners) {
      for (let i = 0; i < flashes; i++) {
        await this.fx.timeline.cue(i ? 70 : 1, () => this.fx.only(index), () => this.fx.audio.hit(2));
        await this.wait(80);
      }
    }
  }

  async centerOut(speed = 55) {
    const length = this.fx.tiles.length;
    for (let step = 0; step < 12; step++) {
      const left = step, right = (length - step) % length;
      await this.fx.timeline.cue(step ? speed : 1,
        () => this.fx.show([left, right, (left + 6) % length, (right + 6) % length]),
        () => this.fx.audio.tick('SPINNING', speed));
    }
  }
}
