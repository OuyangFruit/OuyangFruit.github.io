import { GAME_EVENTS as E } from './game-events.js';
import { LightShowEngine } from './LightShowEngine.js';

// Unified Jackpot / Celebration Lighting System.
//
// Each celebration level is a named, ordered plan of lamp phases. The system
// emits jackpot:start / phase1 / phase2 / finale / end on the shared event bus
// while it runs, which is how the music and SFX stay glued to the animation
// instead of racing it.
export const CELEBRATION_PLANS = Object.freeze({
  LOSE: { phases: ['dimFlicker'], duration: 620 },
  SMALL_WIN: { phases: ['hit3'], duration: 720 },
  MEDIUM_WIN: { phases: ['hit3', 'spread'], duration: 1500 },
  BIG_WIN: { phases: ['lap', 'focus', 'burst4', 'alternate', 'allflash'], duration: 2900 },
  HIGH_MULTIPLIER: { phases: ['lap', 'collapse', 'focus'], duration: 2400 },
  SPECIAL_EVENT: { phases: ['lap', 'focus', 'alternate', 'allflash'], duration: 2600 },
  JACKPOT: { phases: ['blackout', 'center', 'burst2', 'wave', 'ring', 'sync', 'finale'], duration: 4200 },

  SMALL_THREE: { phases: ['hit3', 'syncSymbols'], duration: 1300 },
  BIG_THREE: { phases: ['syncSymbols', 'allflash'], duration: 1800 },
  BIG_FOUR: { phases: ['fourStep', 'allflash'], duration: 2400 },
  DOUBLE_CANNON: { phases: ['burst', 'pause', 'burstStrong'], duration: 1700 },
  TRAIN: { phases: ['chaseLaps', 'brake', 'allflash'], duration: 1800 },
  GRAND_SLAM: { phases: ['blackout', 'center', 'burst2', 'wave', 'ring', 'sync', 'finale'], duration: 4800 }
});

const PHASES = {
  dimFlicker: s => s.dimFlicker(),
  hit3: (s, ctx) => s.shows.burst(ctx.target, 3, 1),
  spread: (s, ctx) => s.spreadRings(ctx),
  lap: s => s.shows.chase(1, 34),
  collapse: (s, ctx) => s.shows.collapse(ctx.target, 5, 78),
  focus: (s, ctx) => s.shows.focus(ctx.target, 4),
  burst: (s, ctx) => s.shows.burst(ctx.target, 3, 2),
  burst2: s => s.shows.allFlash(2, 2),
  burst4: (s, ctx) => s.shows.burst(ctx.target, 4, 2),
  pause: (s, ctx) => s.pause(ctx),
  burstStrong: (s, ctx) => s.strongBurst(ctx),
  syncSymbols: (s, ctx) => s.syncSymbols(ctx),
  fourStep: (s, ctx) => s.fourStep(ctx),
  chaseLaps: (s, ctx) => s.chaseLaps(ctx),
  brake: (s, ctx) => s.brake(ctx),
  alternate: s => s.shows.alternate(4),
  allflash: (s, ctx) => s.allFlashPhase(ctx),
  blackout: (s, ctx) => s.blackoutPhase(ctx),
  center: (s, ctx) => s.centerPhase(ctx),
  wave: (s, ctx) => s.wavePhase(ctx),
  ring: (s, ctx) => s.ringPhase(ctx),
  sync: (s, ctx) => s.syncPhase(ctx),
  finale: (s, ctx) => s.finalePhase(ctx)
};

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

  // Whether this level is loud enough to own the music bus and the big phases.
  static isMajor(level) { return ['BIG_WIN', 'JACKPOT', 'HIGH_MULTIPLIER', 'SPECIAL_EVENT', 'GRAND_SLAM'].includes(level); }

  async play(level, options = {}) {
    const ctx = {
      level,
      target: options.target ?? this.fx.runner.index,
      indices: options.indices ?? [],
      symbols: options.symbols ?? [],
      direction: options.direction ?? 1,
      type: options.type ?? '',
      label: options.label ?? ''
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
      for (const phase of plan.phases) {
        const run = PHASES[phase];
        if (run) await run(this, ctx);
      }
    } finally {
      if (major && announce) this.bus?.emit(E.JACKPOT_END, { level, type: ctx.type });
      this.fx.setPower(0);
      this.fx.dim(false);
      this.running = false;
    }
    return ctx;
  }

  wait(ms) { return this.fx.wait(ms); }

  // Losing round: one short dip of the whole panel, no fanfare.
  async dimFlicker() {
    this.fx.dim(true);
    await this.wait(240);
    this.fx.dim(false);
    await this.wait(160);
  }

  async spreadRings(ctx) {
    await this.shows.rings(ctx.target, 2, 95);
    await this.shows.collapse(ctx.target, 2, 95);
  }

  async pause(ctx) { await this.wait(ctx.level === 'DOUBLE_CANNON' ? 360 : 240); }

  async strongBurst(ctx) {
    const second = ctx.indices[1] ?? ctx.target;
    await this.shows.allFlash(2, 3);
    await this.shows.burst(second, 3, 3);
    this.fx.setPower(3);
  }

  async syncSymbols(ctx) {
    const indices = ctx.indices.length ? ctx.indices : [ctx.target];
    this.fx.centerFlash(ctx.type || '');
    await this.shows.sync(indices, 4, 2);
    this.fx.centerFlash('');
  }

  // 大四喜: four escalating rounds, each lighting one more apple lamp.
  async fourStep(ctx) {
    const lamps = ctx.indices.length ? ctx.indices : [ctx.target];
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

  async chaseLaps(ctx) {
    if (ctx.direction >= 0) await this.shows.chase(1, 30);
    else await this.shows.reverseChase(1, 30);
    await this.shows.chase(1, 26);
  }

  async brake(ctx) {
    this.fx.audio.brake?.();
    await this.wait(320);
  }

  async allFlashPhase(ctx) {
    const power = ctx.level === 'GRAND_SLAM' ? 3 : 2;
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

  async ringPhase(ctx) {
    await this.shows.rings(ctx.target, 11, 58);
  }

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
}
