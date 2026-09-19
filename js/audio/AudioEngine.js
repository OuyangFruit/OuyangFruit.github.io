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

// Long music beds are pulled in after the first spin starts, a few at a time.
// Everything the first seconds of play need stays in the eager core set, so the
// first tap on a phone is never waiting on 5 MB of MP3.
const MUSIC_KEYS = Object.freeze([
  'music_highlow_lose_hou_lai', 'music_highlow_lose_lei_hai', 'music_jackpot_bones_01', 'music_jackpot_bones_02',
  'music_random_chenmo_buyu', 'music_random_huida_wo', 'music_random_qianshi_jinsheng', 'music_random_tage_erxing',
  'music_random_tiexue_danxin', 'music_random_xibie_hai_an', 'music_random_zhixiang_bugai', 'music_small_win_ai_pin',
  'music_win_hudie_01', 'bonus_big_four_full_bgm'
]);
const CORE_SAMPLES = Object.freeze(Object.fromEntries(
  Object.entries(LIBRARY_SAMPLES).filter(([key]) => !MUSIC_KEYS.includes(key))
));

// Every decodable clip, plus the ones that only load when a round actually asks
// for them. The jackpot-length native master is a fallback layer behind
// fruit_bar / jackpot_10x_plus, so it does not belong in the first-load set.
const SAMPLE_URLS = Object.freeze({ ...NATIVE_SAMPLES, ...LIBRARY_SAMPLES });
const LAZY_SFX_KEYS = Object.freeze(['jackpotSong', 'randomMultiplier']);
const CORE_SFX_SAMPLES = Object.freeze(Object.fromEntries(
  Object.entries(NATIVE_SAMPLES).filter(([key]) => !LAZY_SFX_KEYS.includes(key))
));

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
      // Gentler limiting lets the jackpot stings keep their transient punch
      // instead of being squashed flat against the music bed.
      this.compressor.threshold.value = -14;
      this.compressor.ratio.value = 4;
      this.compressor.attack.value = .004;
      this.compressor.release.value = .18;
      this.masterGain.gain.value = this.enabled ? .58 : 0;
      this.musicGain.gain.value = .34;
      this.sfxGain.gain.value = .78;
      this.mechanicalGain.gain.value = .7;
      this.jackpotGain.gain.value = .78;
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
      this.sampleReady = this.samples.preload({ ...CORE_SFX_SAMPLES, ...CORE_SAMPLES });
      // The music bank warms up in the background, never in front of the first spin.
      this.warmTimer = setTimeout(() => this.warmMusic(), 1200);
    }
    // Both waits are bounded: a slow phone decode can delay the first sound but
    // must never delay a lamp, a bet or a spin.
    if (this.context.state === 'suspended') {
      await Promise.race([this.context.resume().catch(() => {}), this.delay(600)]);
    }
    await Promise.race([this.sampleReady, this.delay(1200)]).catch(() => {});
  }
  delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
  // Load the long tracks a few at a time so the network never stalls a round.
  async warmMusic() {
    if (this.musicWarmed || !this.musicSamples) return;
    this.musicWarmed = true;
    for (let index = 0; index < MUSIC_KEYS.length; index += 3) {
      if (!this.enabled) { this.musicWarmed = false; return; }
      await Promise.all(MUSIC_KEYS.slice(index, index + 3).map(key => this.musicSamples.load(key, LIBRARY_SAMPLES[key])));
      await this.delay(160);
    }
  }
  setEnabled(enabled) {
    this.enabled = enabled;
    try { localStorage.setItem('ouyangfruit.sound', enabled ? 'on' : 'off'); } catch { /* storage may be restricted */ }
    if (this.context) this.masterGain.gain.setTargetAtTime(enabled ? .58 : 0, this.context.currentTime, .025);
    if (!enabled) this.motor(false);
    else this.warmMusic();
  }
  // Lights and gameplay never call sounds directly for round structure: the
  // shared event bus does. Swapping an asset is a one-line change here.
  bind(bus) {
    if (!bus || this.bound) return false;
    this.bound = true;
    this.bus = bus;
    bus.on(E.SPIN_START, () => { this.startKick(); this.motor(true, 150); });
    bus.on(E.SPIN_ACCELERATE, () => { this.routed('mechanical', 'accel'); this.motor(true, 96); });
    bus.on(E.SPIN_TICK, payload => {
      if (payload.phase === 'TRAIN') this.trainStep(payload.step ?? 0, payload.speed);
      else {
        this.tick(payload.phase, payload.speed, payload.remaining ?? Infinity);
        this.motor(true, payload.speed);
      }
    });
    bus.on(E.SPIN_STOP, () => { this.motor(false); this.stop(); });
    bus.on(E.MULTIPLIER_ARM, () => this.multiplierArm());
    bus.on(E.MULTIPLIER_START, () => this.multiplierStart());
    bus.on(E.MULTIPLIER_TICK, payload => this.multiplierTick(payload));
    bus.on(E.MULTIPLIER_REVEAL, payload => this.multiplierReveal(payload.tier));
    bus.on(E.FRUIT_HIT, payload => { if (payload.tier && payload.tier !== 'none') this.prize(payload.symbol, payload.tier); });
    bus.on(E.WIN_COUNT, payload => this.count(payload?.step, payload?.steps));
    bus.on(E.JACKPOT_START, payload => this.jackpotStart(payload));
    bus.on(E.JACKPOT_PHASE1, () => this.boom(3));
    bus.on(E.JACKPOT_PHASE2, () => this.boom(2));
    bus.on(E.JACKPOT_FINALE, () => this.fanfare());
    bus.on(E.JACKPOT_END, () => this.endSpecialEvent());
    bus.on(E.SURPRISE_BONUS, () => this.surprise());
    bus.on(E.WIN_COLLECT, () => this.credit());
    bus.on(E.ODD_EVEN_START, () => this.oddEvenStart());
    bus.on(E.ODD_EVEN_WIN, () => this.playWinMusic('MEDIUM_WIN'));
    bus.on(E.ODD_EVEN_LOSE, () => this.playHighLowLoss());
    bus.on(E.MYSTERY_START, () => this.mysteryStart());
    bus.on(E.MYSTERY_RESULT, payload => this.mysteryResult(payload));
    bus.on(E.FAIRY_START, () => this.fairyStart());
    bus.on(E.ROUND_END, payload => { if (payload.outcome === 'lose') this.playRandomRoundMusic(); });
    return true;
  }
  sound(method, ...args) { if (this.enabled && this.synth) this.synth[method](...args); }
  routed(bus, method, ...args) { if (this.enabled && this[bus]) this[bus][method](...args); }
  button(repeat = false) { this.routed('mechanical', 'button', repeat); }
  // A clip that is not decoded yet is fetched in the background and skipped for
  // this frame: the synthetic fallback always keeps the cabinet audible.
  sample(key, options) {
    if (!this.enabled || !this.samples) return false;
    if (!this.samples.cache.has(key)) {
      const url = SAMPLE_URLS[key];
      if (url) this.samples.load(key, url);
      return false;
    }
    return Boolean(this.samples.play(key, options));
  }
  // Cabinet bed while the lamps are moving. Level and colour track the spin
  // speed, so the sound accelerates and winds down with the light.
  motor(on, speed = 150) {
    if (!this.mechanical) return;
    if (!on || !this.enabled) { this.mechanical.motorStop(); this.lastMotorSpeed = 0; return; }
    const now = Date.now();
    if (this.lastMotorSpeed && Math.abs(this.lastMotorSpeed - speed) < 6 && now - (this.lastMotorAt ?? 0) < 140) return;
    this.lastMotorSpeed = speed; this.lastMotorAt = now;
    const t = Math.min(1, Math.max(0, (140 - speed) / 110));
    this.mechanical.motorStart();
    this.mechanical.motorSet(.018 + t * .042, 170 + t * 270);
  }
  // Music beds are loaded on demand; a track that is not decoded yet simply
  // yields to the SFX and plays on the next round instead of blocking.
  ensureMusic(key) {
    if (!this.musicSamples || !LIBRARY_SAMPLES[key]) return false;
    if (this.musicSamples.cache.has(key)) return true;
    this.musicSamples.load(key, LIBRARY_SAMPLES[key]);
    return false;
  }
  music(key, volume = .5) {
    if (!this.enabled || !key) return false;
    if (!this.ensureMusic(key)) return false;
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
  // Roll start: a short slice of the real counting clip, never the whole bed.
  multiplierStart() {
    this.samples?.stop('multiplier-roll');
    if (this.sample(AUDIO_ASSETS.multiplierRoll, { volume: .2, group: 'multiplier-open', offset: .02, duration: .28, replace: true })) return true;
    this.routed('jackpot', 'note', 520, .18, .08, 'triangle', 0, 900);
    return false;
  }
  // Exactly one "哒" per number change. The visual and the sound come from the
  // same event, so they can never drift apart. Only the fast roll phase is rate
  // limited, and the pitch drops as the reveal decelerates.
  multiplierTick({ phase = 'roll', final = false, digit = false } = {}) {
    const now = this.context?.currentTime ?? 0;
    const floor = phase === 'roll' ? .036 : .02;
    if (now && now - (this.lastMultiplierTick ?? -1) < floor) return false;
    this.lastMultiplierTick = now;
    const slow = phase === 'decelerate' || phase === 'fakeout';
    const rate = phase === 'jump' ? 1.25 : slow ? .82 : digit ? 1.1 : 1;
    const volume = phase === 'jump' || final ? .17 : slow ? .13 : .1;
    if (this.sample(AUDIO_ASSETS.multiplierRoll, { volume, group: 'multiplier-tick', offset: .015, duration: .08, rate })) return true;
    const frequency = phase === 'jump' ? 1420 : slow ? 760 : digit ? 1180 : 900;
    this.routed('jackpot', 'note', frequency, .045, volume, 'square', 0, frequency * 1.25);
    return true;
  }
  multiplierReveal(tier = 'small') {
    this.samples?.stop('multiplier-open');
    const big = tier === 'jackpot' || tier === 'fairy' || tier === 'high' || tier === 'big';
    if (big) {
      // Real 10x+ sting, clipped to its punch rather than the whole 6.5s file.
      if (this.sample(AUDIO_ASSETS.jackpotHit, { volume:.5, group:'reveal', offset:0, duration:2.6, replace:true })) return true;
    } else if (this.sample(AUDIO_ASSETS.multiplierRoll, { volume:.34, group:'reveal', offset:.35, duration:.5, replace:true })) return true;
    this.routed('jackpot', 'winHit', big ? 3 : 2);
    return false;
  }
  // 天女散花: the user's full random-multiplier clip (9.4s) drives the whole show.
  fairyStart() { return this.music(AUDIO_ASSETS.multiplierReveal, .6); }
  oddEvenStart() { this.routed('jackpot', 'note', 700, .16, .1, 'triangle', 0, 1180); }
  mysteryStart() { this.routed('jackpot', 'note', 300, .3, .1, 'sine', 0, 180); this.routed('mechanical', 'note', 180, .25, .07, 'square', 0, 120); }
  mysteryResult({ outcome = '', multiplier = 0 } = {}) {
    if (outcome === 'MISS') { this.routed('mechanical', 'note', 200, .3, .08, 'sine', 0, 120); return; }
    if (outcome === 'FAIRY') return;
    if (this.sample(AUDIO_ASSETS.credit, { volume: .34, group: 'credit', replace: true })) this.routed('jackpot', 'winHit', multiplier >= 10 ? 3 : 2);
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
