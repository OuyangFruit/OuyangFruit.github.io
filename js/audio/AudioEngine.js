import { SynthEffects } from './SynthEffects.js';
import { SampleManager } from './SampleManager.js';

export class AudioEngine {
  constructor() {
    try { this.enabled = localStorage.getItem('ouyangfruit.sound') !== 'off'; }
    catch { this.enabled = true; }
    this.context = null;
  }
  async unlock() {
    if (!this.context) {
      const Constructor = window.AudioContext || window.webkitAudioContext;
      if (!Constructor) return;
      this.context = new Constructor();
      this.masterGain = this.context.createGain();
      this.musicGain = this.context.createGain();
      this.sfxGain = this.context.createGain();
      this.compressor = this.context.createDynamicsCompressor();
      this.compressor.threshold.value = -18;
      this.compressor.ratio.value = 7;
      this.masterGain.gain.value = this.enabled ? .35 : 0;
      this.musicGain.gain.value = .45;
      this.sfxGain.gain.value = .75;
      this.musicGain.connect(this.compressor);
      this.sfxGain.connect(this.compressor);
      this.compressor.connect(this.masterGain).connect(this.context.destination);
      this.synth = new SynthEffects(this.context, this.sfxGain);
      this.samples = new SampleManager(this.context, this.sfxGain);
    }
    if (this.context.state === 'suspended') await this.context.resume();
  }
  setEnabled(enabled) {
    this.enabled = enabled;
    try { localStorage.setItem('ouyangfruit.sound', enabled ? 'on' : 'off'); } catch { /* storage may be restricted */ }
    if (this.context) this.masterGain.gain.setTargetAtTime(enabled ? .35 : 0, this.context.currentTime, .025);
  }
  sound(method, ...args) { if (this.enabled && this.synth) this.synth[method](...args); }
  tick(phase, speed) { this.sound('tick', phase === 'SLOW_DOWN', speed); }
  stop() { this.sound('stop'); }
  limit() { this.sound('limit'); }
  lowCredit() { this.sound('lowCredit'); }
  count() { this.sound('count'); }
  chime(step) { this.sound('chime', step); }
  warning() { this.sound('warning'); }
  hit(level) { this.sound('winHit', level); }
  boom(power) { this.sound('boom', power); }
  brake() { this.sound('brake'); }
  fanfare() { this.sound('fanfare'); }
  trainStep(step) {
    this.tick('SPINNING', 50);
    if (step % 2 === 0) this.sound('note', 115 + step * 2, .1, .055, 'sine');
    if (step % 4 === 0) this.chime(step / 4);
  }
}
