import { SynthEffects } from './SynthEffects.js';
import { SampleManager } from './SampleManager.js';

const NATIVE_SAMPLES = Object.freeze({
  start: './assets/audio/native/arcade-start.mp3',
  creditStart: './assets/audio/native/arcade-credit-start.mp3',
  orange: './assets/audio/native/arcade-orange.mp3',
  lemon: './assets/audio/native/arcade-lemon.mp3',
  doubleSeven: './assets/audio/native/arcade-double-seven.mp3',
  bigWinChase: './assets/audio/native/arcade-big-win-chase.mp3',
  doubleCannon: './assets/audio/native/arcade-double-cannon.mp3',
  randomMultiplier: './assets/audio/native/arcade-random-multiplier.mp3',
  jackpotSong: './assets/audio/native/arcade-jackpot-3.mp3'
});

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
      this.mechanicalGain = this.context.createGain();
      this.jackpotGain = this.context.createGain();
      this.compressor = this.context.createDynamicsCompressor();
      this.compressor.threshold.value = -18;
      this.compressor.ratio.value = 7;
      this.compressor.attack.value = .003;
      this.compressor.release.value = .22;
      this.masterGain.gain.value = this.enabled ? .48 : 0;
      this.musicGain.gain.value = .35;
      this.sfxGain.gain.value = .72;
      this.mechanicalGain.gain.value = .68;
      this.jackpotGain.gain.value = .65;
      this.musicGain.connect(this.compressor);
      this.sfxGain.connect(this.compressor);
      this.mechanicalGain.connect(this.compressor);
      this.jackpotGain.connect(this.compressor);
      this.compressor.connect(this.masterGain).connect(this.context.destination);
      this.synth = new SynthEffects(this.context, this.sfxGain);
      this.mechanical = new SynthEffects(this.context, this.mechanicalGain, this.synth.noiseBuffer);
      this.jackpot = new SynthEffects(this.context, this.jackpotGain, this.synth.noiseBuffer);
      this.samples = new SampleManager(this.context, this.sfxGain);
      // Decode once and reuse AudioBuffers. Playback never creates HTMLAudioElement nodes.
      this.sampleReady = this.samples.preload(NATIVE_SAMPLES);
    }
    if (this.context.state === 'suspended') await this.context.resume();
  }
  setEnabled(enabled) {
    this.enabled = enabled;
    try { localStorage.setItem('ouyangfruit.sound', enabled ? 'on' : 'off'); } catch { /* storage may be restricted */ }
    if (this.context) this.masterGain.gain.setTargetAtTime(enabled ? .48 : 0, this.context.currentTime, .025);
  }
  sound(method, ...args) { if (this.enabled && this.synth) this.synth[method](...args); }
  routed(bus, method, ...args) { if (this.enabled && this[bus]) this[bus][method](...args); }
  button(repeat = false) { this.routed('mechanical', 'button', repeat); }
  sample(key, options) { return Boolean(this.enabled && this.samples?.play(key, options)); }
  startKick() {
    if (!this.sample('start', { volume: .38, group: 'start', replace: true })) this.routed('mechanical', 'startKick');
  }
  tick(phase, speed, remaining = Infinity) {
    this.routed('mechanical', 'tick', phase === 'SLOW_DOWN', speed);
    if (remaining <= 5) this.routed('jackpot', 'suspense', 6 - remaining);
  }
  stop() { this.routed('mechanical', 'landing'); }
  limit() { this.sound('limit'); }
  lowCredit() { this.sound('lowCredit'); }
  count() { this.sound('count'); }
  chime(step) { this.sound('chime', step); }
  warning() { this.sound('warning'); }
  hit(level) { this.routed('jackpot', 'winHit', level); this.routed('synth', 'coin', level); }
  boom(power) { this.routed('jackpot', 'boom', power); }
  brake() { this.sound('brake'); }
  fanfare() { this.routed('jackpot', 'fanfare'); }
  credit() {
    if (!this.sample('creditStart', { volume: .28, group: 'credit' })) this.routed('synth', 'coin', 1);
  }
  prize(symbol, tier = 'small') {
    const sampleKey = symbol === 'ORANGE' ? 'orange' : symbol === 'LEMON' ? 'lemon' :
      symbol === 'SEVEN' ? 'doubleSeven' : tier === 'jackpot' ? 'jackpotSong' :
      tier === 'big' ? 'bigWinChase' : '';
    if (sampleKey && this.sample(sampleKey, {
      volume: tier === 'jackpot' ? .48 : tier === 'big' ? .4 : .3,
      group: tier === 'jackpot' ? 'event' : 'prize', replace: tier === 'jackpot'
    })) return;
    this.hit(tier === 'jackpot' ? 3 : tier === 'big' ? 2 : 1);
  }
  specialEvent(type) {
    const sampleKey = {
      BIG_THREE: 'bigWinChase', BIG_FOUR: 'jackpotSong', DOUBLE_CANNON: 'doubleCannon',
      GRAND_SLAM: 'randomMultiplier'
    }[type];
    if (!sampleKey) return false;
    return this.sample(sampleKey, { volume: type === 'BIG_FOUR' ? .46 : .4, group: 'event', replace: true });
  }
  endSpecialEvent() { this.samples?.stop('event'); }
  specialCue(type, stage = 0) {
    if (!this.enabled || !this.jackpot) return;
    const notes = {SMALL_THREE:[523,659,784], BIG_THREE:[392,587,784], BIG_FOUR:[440,554,659,880], DOUBLE_CANNON:[220,330], TRAIN:[175,220], GRAND_SLAM:[392,523,659,784,1047]};
    const series = notes[type] || [440];
    this.jackpot.note(series[stage % series.length], .22, .13, 'triangle');
    if (type === 'BIG_THREE' || type === 'GRAND_SLAM' || type === 'BIG_FOUR') this.jackpot.note(82, .23, .13, 'sine', 0, 45);
    if (type === 'DOUBLE_CANNON') this.boom(stage ? 3 : 1);
    if (type === 'TRAIN') this.mechanical.note(115, .12, .09, 'square', 0, 78);
  }
  trainStep(step) {
    this.routed('mechanical', 'tick', false, 50);
    if (step % 2 === 0) this.routed('mechanical', 'note', 110 + step * 2, .11, .095, 'sine', 0, 72);
    if (step % 4 === 0) this.routed('jackpot', 'coin', step / 4);
  }
}
