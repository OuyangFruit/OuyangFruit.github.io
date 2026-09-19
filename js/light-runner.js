import { EventTimeline } from './event-timeline.js';
import { GAME_EVENTS as E } from './game-events.js';

// Ending ladder: the last lamps of a spin slow down on this curve. The final
// steps get an extra dwell plus a suspense tick, which is where the "will it
// move one more" feeling comes from.
const ENDING_SPEEDS = [56, 68, 84, 104, 128, 158, 196, 240, 292, 352, 420, 490];

const PROFILES = Object.freeze({
  normal: { loops: [1, 2], accelerate: 8, cruise: [36, 52], finalSteps: 10, suspense: 4, startSpeed: 168, cruiseSpeed: 46 },
  jackpot: { loops: [2, 2], accelerate: 10, cruise: [40, 56], finalSteps: 12, suspense: 5, startSpeed: 176, cruiseSpeed: 48 },
  special: { loops: [1, 1], accelerate: 5, cruise: [26, 34], finalSteps: 7, suspense: 3, startSpeed: 140, cruiseSpeed: 30 }
});

export class LightRunner {
  constructor(cells, tiles, audio, onPhase = () => {}, scale = 1, bus = null) {
    this.cells = cells;
    this.tiles = tiles;
    this.audio = audio;
    this.onPhase = onPhase;
    this.scale = scale;
    this.bus = bus;
    this.timeline = new EventTimeline(scale);
    this.index = 0;
    this.phase = 'IDLE';
    this.active = false;
    this.show(0);
  }

  setPhase(phase) {
    if (this.phase === phase) return;
    this.phase = phase;
    const event = {
      SPIN_START: E.SPIN_ACCELERATE,
      SPINNING: E.SPIN_CRUISE,
      SLOW_DOWN: E.SPIN_DECELERATE,
      SUSPENSE: E.SPIN_SUSPENSE
    }[phase];
    if (event) this.bus?.emit(event, { speed: this.lastSpeed ?? 0 });
    this.onPhase(phase);
  }
  show(index, trail = true, train = false, direction = 1) {
    this.index = ((index % this.cells.length) + this.cells.length) % this.cells.length;
    this.tiles.forEach((tile, i) => {
      const distance = ((this.index - i) * direction + this.cells.length * 2) % this.cells.length;
      tile.classList.toggle('lit', distance === 0);
      tile.classList.toggle('trail-1', trail && distance === 1);
      tile.classList.toggle('trail-2', trail && distance === 2);
      tile.classList.toggle('train-trail', train && distance > 0 && distance < 7);
    });
  }

  async spinTo(target, { loops, special = false, tempo = 1, tier = 'normal' } = {}) {
    if (this.active) throw new Error('LightRunner is already running');
    if (!this.cells[target]) throw new Error(`Invalid lamp ${target}`);
    this.active = true;
    try {
      const profile = PROFILES[special ? 'special' : tier] ?? PROFILES.normal;
      const rounds = loops ?? (profile.loops[0] + Math.floor(Math.random() * (profile.loops[1] - profile.loops[0] + 1)));
      const travel = (target - this.index + this.cells.length) % this.cells.length;
      const steps = rounds * this.cells.length + travel;
      const finalSteps = Math.min(profile.finalSteps, steps);
      const rampSteps = Math.min(profile.accelerate, Math.max(1, steps - finalSteps));
      for (let step = 0; step < steps; step++) {
        const left = steps - step;
        let speed;
        if (left <= finalSteps) {
          const index = finalSteps - left;
          const suspense = index >= finalSteps - profile.suspense;
          this.setPhase(suspense ? 'SUSPENSE' : 'SLOW_DOWN');
          speed = ENDING_SPEEDS[Math.min(index, ENDING_SPEEDS.length - 1)] * (suspense ? 1.45 : 1);
        } else if (step < rampSteps) {
          this.setPhase('SPIN_START');
          const t = step / Math.max(1, rampSteps - 1);
          speed = profile.startSpeed + (profile.cruiseSpeed - profile.startSpeed) * (t * (2 - t));
        } else {
          this.setPhase('SPINNING');
          speed = profile.cruise[0] + Math.random() * (profile.cruise[1] - profile.cruise[0]);
        }
        this.lastSpeed = speed;
        await this.timeline.cue(speed * tempo * (.9 + Math.random() * .2),
          () => this.show(this.index + 1), () => this.tickSound(speed, left));
      }
      this.show(target, false);
      this.setPhase('NORMAL_STOP');
      this.emitSpin(E.SPIN_STOP, { target });
      if (!this.bus) this.audio.stop();
      return this.cells[target];
    } finally { this.active = false; }
  }

  emitSpin(type, payload) { this.bus?.emit(type, { phase: this.phase, ...payload }); }

  // One clock for lamp and sound: every lamp step posts exactly one tick.
  tickSound(speed, remaining) {
    const phase = this.phase === 'SLOW_DOWN' ? 'DECELERATE' : this.phase === 'SUSPENSE' ? 'SUSPENSE'
      : this.phase === 'SPIN_START' ? 'ACCELERATE' : 'CRUISE';
    if (this.bus) this.bus.emit(E.SPIN_TICK, { phase, speed, remaining });
    else this.audio.tick(phase, speed, remaining);
  }

  async moveTrain(start, count, direction, onCarriage) {
    this.setPhase('SPECIAL_RUNNING');
    for (let step = 0; step < count; step++) {
      const speed = Math.max(54, 145 - step * 8);
      const index = (start + direction * step + this.cells.length * 10) % this.cells.length;
      await this.timeline.cue(speed, () => this.show(index, true, true, direction), () => {
        if (this.bus) this.bus.emit(E.SPIN_TICK, { phase: 'TRAIN', speed, step });
        else this.audio.trainStep(step, speed);
      });
      if (onCarriage) await onCarriage(index, step);
    }
    this.tiles.forEach(tile => tile.classList.remove('train-trail'));
  }
}
