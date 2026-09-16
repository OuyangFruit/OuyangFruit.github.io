export class LightEngine {
  constructor(tiles, config, onStep, onPhase) {
    this.tiles = tiles;
    this.config = config;
    this.onStep = onStep;
    this.onPhase = onPhase;
    this.lightIndex = 0;
    this.lightSpeed = 0;
    this.targetIndex = 0;
    this.loopCount = 0;
    this.phase = 'IDLE';
    this.timer = null;
    this.render(0);
  }

  setPhase(phase) { this.phase = phase; this.onPhase(phase); }

  render(index, trail = true) {
    const length = this.tiles.length;
    for (let i = 0; i < length; i++) {
      const distance = (index - i + length) % length;
      const tile = this.tiles[i];
      tile.classList.toggle('lit', distance === 0);
      tile.classList.toggle('trail-1', trail && distance === 1 && this.config.TRAIL_LENGTH >= 1);
      tile.classList.toggle('trail-2', trail && distance === 2 && this.config.TRAIL_LENGTH >= 2);
    }
  }

  async spin(targetIndex) {
    if (!['IDLE', 'STOP'].includes(this.phase)) return false;
    const c = this.config, length = this.tiles.length;
    this.targetIndex = targetIndex;
    const loops = c.MIN_LOOPS + Math.floor(Math.random() * (c.MAX_LOOPS - c.MIN_LOOPS + 1));
    const offset = (targetIndex - this.lightIndex + length) % length;
    const total = loops * length + offset;
    this.loopCount = 0;
    this.setPhase('ACCELERATE');
    for (let step = 0; step < total; step++) {
      const left = total - step;
      if (left <= c.DECELERATE_STEPS) this.setPhase('DECELERATE');
      else if (step >= c.ACCELERATE_STEPS) this.setPhase('RUNNING');
      let speed;
      if (this.phase === 'ACCELERATE') {
        const t = step / Math.max(1, c.ACCELERATE_STEPS - 1);
        speed = c.START_SPEED + (c.MAX_SPEED - c.START_SPEED) * t;
      } else if (this.phase === 'DECELERATE') {
        const t = (c.DECELERATE_STEPS - left + 1) / c.DECELERATE_STEPS;
        speed = c.MAX_SPEED + (c.START_SPEED * c.DECELERATION - c.MAX_SPEED) * t * t;
      } else speed = c.MAX_SPEED;
      this.lightSpeed = Math.round(speed);
      await new Promise(resolve => { this.timer = setTimeout(resolve, speed); });
      const old = this.lightIndex;
      this.lightIndex = (old + 1) % length;
      if (this.lightIndex === 0) this.loopCount++;
      this.render(this.lightIndex);
      this.onStep(this.lightIndex, this.phase, this.lightSpeed);
    }
    this.setPhase('STOP');
    this.render(this.lightIndex, false);
    return true;
  }
}
