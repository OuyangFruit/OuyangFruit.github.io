const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

export class LightRunner {
  constructor(cells, tiles, audio, onPhase = () => {}, scale = 1) {
    this.cells = cells;
    this.tiles = tiles;
    this.audio = audio;
    this.onPhase = onPhase;
    this.scale = scale;
    this.index = 0;
    this.phase = 'IDLE';
    this.active = false;
    this.show(0);
  }

  setPhase(phase) { this.phase = phase; this.onPhase(phase); }
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

  async spinTo(target, { loops, special = false, tempo = 1 } = {}) {
    if (this.active) throw new Error('LightRunner is already running');
    if (!this.cells[target]) throw new Error(`Invalid lamp ${target}`);
    this.active = true;
    try {
      const rounds = loops ?? (special ? 2 : 2 + Math.floor(Math.random() * 2));
      const travel = (target - this.index + this.cells.length) % this.cells.length;
      const steps = rounds * this.cells.length + travel;
      const finalSteps = Math.min(special ? 5 : 7, steps);
      const rampSteps = Math.min(10, steps - finalSteps);
      for (let step = 0; step < steps; step++) {
        const left = steps - step;
        let speed;
        if (left <= finalSteps) {
          this.setPhase('SLOW_DOWN');
          const sequence = special ? [70, 85, 110, 140, 180] : [85, 100, 125, 155, 190, 235, 290];
          speed = sequence[finalSteps - left];
        } else if (step < rampSteps) {
          this.setPhase('SPIN_START');
          speed = 82 - step * 4;
        } else {
          this.setPhase('SPINNING');
          speed = special ? 30 : 42 + Math.random() * 18;
        }
        await wait(Math.max(1, speed * this.scale * tempo * (.9 + Math.random() * .2)));
        this.show(this.index + 1);
        this.audio.tick(this.phase, speed);
      }
      this.show(target, false);
      this.setPhase('NORMAL_STOP');
      this.audio.stop();
      return this.cells[target];
    } finally { this.active = false; }
  }

  async moveTrain(start, count, direction, onCarriage) {
    this.setPhase('SPECIAL_RUNNING');
    for (let step = 0; step < count; step++) {
      const speed = Math.max(54, 145 - step * 8);
      await wait(Math.max(1, speed * this.scale));
      const index = (start + direction * step + this.cells.length * 10) % this.cells.length;
      this.show(index, true, true, direction);
      this.audio.trainStep(step, speed);
      if (onCarriage) await onCarriage(index, step);
    }
    this.tiles.forEach(tile => tile.classList.remove('train-trail'));
  }
}
