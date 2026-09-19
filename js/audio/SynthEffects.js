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
    // Pitch and level follow the lamp speed, so the tick pattern rises during the
    // spin and drops back down as the cabinet slows.
    if (slow) {
      const frequency = Math.max(520, 1180 - speed);
      this.note(frequency, .06, .095, 'square', 0, frequency * .62);
      this.note(150, .05, .05, 'sine', 0, 92);
      return;
    }
    const fast = speed < 45;
    this.note(fast ? 1240 : 1150, .022, fast ? .055 : .042, 'square', 0, fast ? 1520 : 900);
  }
  // Rising sweep into the cruise phase.
  accel(duration = .42, from = 180, to = 1180) {
    const ctx = this.context, at = ctx.currentTime;
    const oscillator = ctx.createOscillator(), gain = ctx.createGain(), filter = ctx.createBiquadFilter();
    oscillator.type = 'sawtooth';
    oscillator.frequency.setValueAtTime(from, at);
    oscillator.frequency.exponentialRampToValueAtTime(to, at + duration);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(600, at);
    filter.frequency.exponentialRampToValueAtTime(3200, at + duration);
    gain.gain.setValueAtTime(.0001, at);
    gain.gain.linearRampToValueAtTime(.085, at + duration * .5);
    gain.gain.exponentialRampToValueAtTime(.0001, at + duration);
    oscillator.connect(filter).connect(gain).connect(this.output);
    oscillator.start(at); oscillator.stop(at + duration + .02);
    this.noise(duration, .05, 1800);
  }
  // Continuous cabinet bed while the lamps are moving. One looping noise voice,
  // its level and centre frequency follow the spin speed.
  motorStart() {
    if (this.motor) return;
    const ctx = this.context;
    const source = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
    source.buffer = this.noiseBuffer;
    source.loop = true;
    filter.type = 'bandpass';
    filter.frequency.value = 220;
    filter.Q.value = 1.1;
    gain.gain.value = 0;
    source.connect(filter).connect(gain).connect(this.output);
    source.start();
    this.motor = { source, filter, gain };
  }
  motorSet(level = 0, frequency = 220) {
    if (!this.motor) return;
    const now = this.context.currentTime;
    this.motor.gain.gain.setTargetAtTime(Math.min(.075, Math.max(0, level)), now, .07);
    this.motor.filter.frequency.setTargetAtTime(frequency, now, .09);
  }
  motorStop(fade = .18) {
    const motor = this.motor;
    if (!motor) return;
    this.motor = null;
    const now = this.context.currentTime;
    motor.gain.gain.cancelScheduledValues(now);
    motor.gain.gain.setValueAtTime(motor.gain.gain.value, now);
    motor.gain.gain.linearRampToValueAtTime(0, now + fade);
    try { motor.source.stop(now + fade + .05); } catch { /* already stopped */ }
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
