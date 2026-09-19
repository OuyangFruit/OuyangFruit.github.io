export class SynthEffects {
  constructor(context, output, noiseBuffer = null) {
    this.context = context;
    this.output = output;
    if (noiseBuffer) { this.noiseBuffer = noiseBuffer; return; }
    const buffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < channel.length; i++) channel[i] = Math.random() * 2 - 1;
    this.noiseBuffer = buffer;
  }

  note(frequency, duration = .08, volume = .12, type = 'triangle', delay = 0, end = frequency) {
    const ctx = this.context, at = ctx.currentTime + delay;
    const oscillator = ctx.createOscillator(), gain = ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, at);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(30, end), at + duration);
    gain.gain.setValueAtTime(.0001, at);
    gain.gain.linearRampToValueAtTime(volume, at + Math.min(.008, duration / 4));
    gain.gain.exponentialRampToValueAtTime(.0001, at + duration);
    oscillator.connect(gain).connect(this.output);
    oscillator.start(at); oscillator.stop(at + duration + .01);
  }

  noise(duration = .25, volume = .08, cutoff = 900, delay = 0) {
    const ctx = this.context, at = ctx.currentTime + delay;
    const source = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
    source.buffer = this.noiseBuffer;
    filter.type = 'lowpass'; filter.frequency.value = cutoff;
    gain.gain.setValueAtTime(.0001, at);
    gain.gain.linearRampToValueAtTime(volume, at + .005);
    gain.gain.exponentialRampToValueAtTime(.0001, at + duration);
    source.connect(filter).connect(gain).connect(this.output);
    source.start(at); source.stop(at + duration + .01);
  }

  tick(slow = false, speed = 60) {
    const frequency = slow ? Math.max(700, 1040 - speed) : 1100;
    this.note(frequency, slow ? .055 : .025, slow ? .08 : .045, 'square', 0, frequency * .72);
    if (slow) this.note(145, .045, .048, 'sine', 0, 95);
  }
  button(repeat = false) {
    this.noise(.035, repeat ? .07 : .05, 2400);
    this.note(repeat ? 840 : 680, .075, .095, 'square', .009, repeat ? 1120 : 830);
  }
  startKick() {
    this.note(125, .38, .23, 'sine', 0, 43);
    this.noise(.13, .085, 950);
    this.note(390, .3, .11, 'sawtooth', .11, 880);
  }
  suspense(level = 1) {
    this.note(90, .18, .085, 'sine', 0, 55);
    this.note(470 + level * 95, .12, .045, 'triangle', .02, 590 + level * 100);
  }
  landing() { this.note(170, .32, .17, 'sine', 0, 52); this.noise(.15, .095, 1200); this.note(760, .19, .09, 'triangle', .025, 410); }
  coin(step = 0) { this.note(1350 + step * 110, .095, .07, 'sine'); this.note(1740 + step * 95, .13, .04, 'triangle', .04); }
  stop() { this.note(900, .15, .10); this.note(1350, .12, .055, 'triangle'); }
  limit() { this.note(740, .09, .08, 'square'); }
  lowCredit() { this.note(190, .15, .10, 'sawtooth', 0, 105); }
  count() { this.note(1060, .03, .026, 'square'); }
  chime(step = 0) { this.note([523,659,784,1047][step % 4], .18, .09); }
  warning() { this.note(530, .12, .08, 'square'); this.note(400, .15, .06, 'square', .14); }
  winHit(level = 1) {
    const power = Math.min(3, Math.max(1, level));
    this.note(600, .38, .09 * power, 'triangle');
    this.note(1200, .22, .045 * power, 'square');
    this.note(150, .32, .07 * power, 'sine', 0, 85);
    this.noise(.20, .035 * power, 1600);
  }
  boom(power = 1) {
    const p = Math.min(3, Math.max(1, power));
    const length = .5 + p * .18;
    this.note(140, length, .12 * p, 'sine', 0, p === 3 ? 45 : 60);
    this.noise(length, .065 * p, 700 + p * 170);
  }
  brake() { this.note(1200, .72, .07, 'sawtooth', 0, 180); }
  fanfare() {
    [262,330,392,523,659,784,1047].forEach((hz, i) => this.note(hz, .22, .08, 'triangle', i * .115));
    [523,659,784,1047].forEach(hz => this.note(hz, .8, .055, 'triangle', .93));
    this.noise(.7, .025, 4500, .95);
  }
}
