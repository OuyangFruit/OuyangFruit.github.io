// One clock advances both the lamps and their sound cues. Each cue is deliberately
// independent: overlapping short Web Audio sources are never stopped by the next step.
export class EventTimeline {
  constructor(scale = 1) { this.scale = scale; }
  wait(ms) { return new Promise(resolve => setTimeout(resolve, Math.max(1, ms * this.scale))); }
  async cue(delay, light, sound) {
    await this.wait(delay);
    light?.();
    sound?.();
  }
}
