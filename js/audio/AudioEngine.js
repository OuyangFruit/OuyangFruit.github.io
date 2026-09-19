import { SynthEffects } from './SynthEffects.js';
import { SampleManager } from './SampleManager.js';
import { AUDIO_ASSETS, LIBRARY_SAMPLES } from './AudioAssetMap.js';
import { GAME_EVENTS as E } from '../game-events.js';

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
      this.musicSamples = new SampleManager(this.context, this.musicGain);
      this.lastPlayedTrack = '';
      // Decode once and reuse AudioBuffers. Playback never creates HTMLAudioElement nodes.
      this.sampleReady = Promise.all([
        this.samples.preload({...NATIVE_SAMPLES, ...LIBRARY_SAMPLES}),
        this.musicSamples.preload(LIBRARY_SAMPLES)
      ]);
    }
    // Both waits are bounded: a slow phone decode can delay the first sound but
    // must never delay a lamp, a bet or a spin.
    if (this.context.state === 'suspended') {
      await Promise.race([this.context.resume().catch(() => {}), this.delay(600)]);
    }
    await Promise.race([this.sampleReady, this.delay(1200)]).catch(() => {});
  }
  delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
  setEnabled(enabled) {
    this.enabled = enabled;
    try { localStorage.setItem('ouyangfruit.sound', enabled ? 'on' : 'off'); } catch { /* storage may be restricted */ }
    if (this.context) this.masterGain.gain.setTargetAtTime(enabled ? .48 : 0, this.context.currentTime, .025);
  }
  // Lights and gameplay never call sounds directly for round structure: the
  // shared event bus does. Swapping an asset is a one-line change here.
  bind(bus) {
    if (!bus || this.bound) return false;
    this.bound = true;
    this.bus = bus;
    bus.on(E.SPIN_START, () => this.startKick());
    bus.on(E.SPIN_TICK, payload => {
      if (payload.phase === 'TRAIN') this.trainStep(payload.step ?? 0, payload.speed);
      else this.tick(payload.phase, payload.speed, payload.remaining ?? Infinity);
    });
    bus.on(E.SPIN_STOP, () => this.stop());
    bus.on(E.MULTIPLIER_ARM, () => this.multiplierArm());
    bus.on(E.MULTIPLIER_START, () => this.multiplierRoll(true));
    bus.on(E.MULTIPLIER_TICK, payload => {
      if (payload.phase === 'roll' || payload.final) this.multiplierTick(Boolean(payload.final));
    });
    bus.on(E.MULTIPLIER_REVEAL, payload => {
      this.multiplierRoll(false);
      this.multiplierReveal(payload.tier);
    });
    bus.on(E.FRUIT_HIT, payload => { if (payload.tier && payload.tier !== 'none') this.prize(payload.symbol, payload.tier); });
    bus.on(E.WIN_COUNT, payload => this.count(payload?.step, payload?.steps));
    bus.on(E.JACKPOT_START, payload => this.jackpotStart(payload));
    bus.on(E.JACKPOT_PHASE1, () => this.boom(3));
    bus.on(E.JACKPOT_PHASE2, () => this.boom(2));
    bus.on(E.JACKPOT_FINALE, () => this.fanfare());
    bus.on(E.JACKPOT_END, () => this.endSpecialEvent());
    bus.on(E.SURPRISE_BONUS, () => this.surprise());
    bus.on(E.HIGHLOW_WIN, () => this.playWinMusic('MEDIUM_WIN'));
    bus.on(E.HIGHLOW_LOSE, () => this.playHighLowLoss());
    bus.on(E.ROUND_END, payload => { if (payload.outcome === 'lose') this.playRandomRoundMusic(); });
    return true;
  }
  sound(method, ...args) { if (this.enabled && this.synth) this.synth[method](...args); }
  routed(bus, method, ...args) { if (this.enabled && this[bus]) this[bus][method](...args); }
  button(repeat = false) { this.routed('mechanical', 'button', repeat); }
  sample(key, options) { return Boolean(this.enabled && this.samples?.play(key, options)); }
  music(key, volume = .5) {
    if (!this.enabled || !key) return false;
    this.musicSamples?.stop('music');
    this.lastPlayedTrack = key;
    return Boolean(this.musicSamples?.play(key, { volume, group: 'music', replace: true }));
  }
  stopMusic() { this.musicSamples?.stop('music'); }
  randomFrom(pool) {
    const choices = pool.filter(key => key !== this.lastPlayedTrack);
    return (choices.length ? choices : pool)[Math.floor(Math.random() * (choices.length || pool.length))];
  }
  playRandomRoundMusic() { return this.music(this.randomFrom(AUDIO_ASSETS.randomMusic), .34); }
  playHighLowLoss() { return this.music(this.randomFrom(AUDIO_ASSETS.highLowLose), .46); }
  playWinMusic(level) {
    if (level === 'JACKPOT' || level === 'SPECIAL_EVENT') return this.music(this.randomFrom(AUDIO_ASSETS.jackpotMusic), .58);
    if (level === 'BIG_WIN' || level === 'MEDIUM_WIN' || level === 'SMALL_WIN') return this.music(AUDIO_ASSETS.smallWinMusic, .45);
    return this.music(AUDIO_ASSETS.normalWinMusic, .32);
  }
  multiplierRoll(active) {
    if (!active) return this.samples?.stop('multiplier-roll');
    return this.sample(AUDIO_ASSETS.multiplierRoll, { volume:.22, group:'multiplier-roll', replace:true });
  }
  multiplierArm() { this.routed('jackpot', 'note', 620, .16, .075, 'triangle', 0, 900); }
  // One short click per lamp change while the multiplier is rolling. Rate limited
  // so a fast roll never floods the audio graph on a phone.
  multiplierTick(final = false) {
    const now = this.context?.currentTime ?? 0;
    if (now && now - (this.lastMultiplierTick ?? -1) < .038) return false;
    this.lastMultiplierTick = now;
    this.routed('jackpot', 'note', final ? 1320 : 880, .045, final ? .11 : .055, 'square', 0, final ? 1760 : 1180);
    return true;
  }
  multiplierReveal(tier = 'small') {
    const volume = tier === 'jackpot' ? .55 : tier === 'big' || tier === 'high' ? .46 : .4;
    if (this.sample(AUDIO_ASSETS.multiplierReveal, { volume, group:'reveal', replace:true })) return true;
    this.routed('jackpot', 'winHit', tier === 'jackpot' ? 3 : 2);
    return false;
  }
  startKick() {
    if (!this.sample('start', { volume: .38, group: 'start', replace: true })) this.routed('mechanical', 'startKick');
  }
  tick(phase, speed, remaining = Infinity) {
    const slow = phase === 'DECELERATE' || phase === 'SLOW_DOWN';
    this.routed('mechanical', 'tick', slow, speed);
    if (phase === 'SUSPENSE') this.routed('jackpot', 'suspense', Math.max(1, 6 - remaining));
    else if (remaining <= 5) this.routed('jackpot', 'suspense', 6 - remaining);
  }
  stop() { this.routed('mechanical', 'landing'); }
  // Jackpot sting + level music, fired by jackpot:start from the lamp system.
  jackpotStart({ level = '', type = '' } = {}) {
    const sting = { BIG_FOUR: AUDIO_ASSETS.bigFourHits, DOUBLE_CANNON: AUDIO_ASSETS.doubleHit,
      GRAND_SLAM: AUDIO_ASSETS.jackpotHit }[type] ?? AUDIO_ASSETS.jackpotHit;
    this.sample(sting, { volume: .46, group: 'event', replace: true });
    if (type === 'BIG_FOUR') this.music(AUDIO_ASSETS.bigFourMusic, .55);
    else this.playWinMusic(level);
    return true;
  }
  surprise() {
    this.sample(AUDIO_ASSETS.credit, { volume: .34, group: 'credit', replace: true });
    this.routed('jackpot', 'winHit', 3);
    this.playWinMusic('BIG_WIN');
  }
  limit() { this.sound('limit'); }
  lowCredit() { this.sound('lowCredit'); }
  // Long jackpot counts tick many times per second; skip anything faster than 42ms.
  count() {
    const now = this.context?.currentTime ?? 0;
    if (now && now - (this.lastCount ?? -1) < .042) return false;
    this.lastCount = now;
    this.sound('count');
    return true;
  }
  chime(step) { this.sound('chime', step); }
  warning() { this.sound('warning'); }
  hit(level) { this.routed('jackpot', 'winHit', level); this.routed('synth', 'coin', level); }
  boom(power) { this.routed('jackpot', 'boom', power); }
  brake() { this.sound('brake'); }
  fanfare() { this.routed('jackpot', 'fanfare'); }
  credit() {
    if (!this.sample(AUDIO_ASSETS.credit, { volume: .3, group: 'credit', replace:true }) && !this.sample('creditStart', { volume: .28, group: 'credit' })) this.routed('synth', 'coin', 1);
  }
  prize(symbol, tier = 'small') {
    const libraryKey = AUDIO_ASSETS.fruit[symbol];
    if (libraryKey && this.sample(libraryKey, {volume:tier==='jackpot'?.4:.26,group:'prize'})) return;
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
    if (type === 'BIG_FOUR') {
      this.sample(AUDIO_ASSETS.bigFourHits, { volume:.48, group:'event', replace:true });
      return this.music(AUDIO_ASSETS.bigFourMusic, .55);
    }
    const sampleKey = {
      BIG_THREE: 'bigWinChase', DOUBLE_CANNON: AUDIO_ASSETS.doubleHit,
      GRAND_SLAM: AUDIO_ASSETS.jackpotHit
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
