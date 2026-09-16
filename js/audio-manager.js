export class AudioManager {
  constructor() {
    this.enabled = true;
    this.context = null;
    this.buffers = new Map();
    this.map = {};
    this.loadPromise = this.preload();
  }

  async preload() {
    try {
      const response = await fetch('./assets/audio/audio-map.json');
      this.map = await response.json();
      this.raw = await Promise.all(Object.entries(this.map).filter(([, path]) => path).map(async ([key, path]) => {
        try { return [key, await (await fetch(path)).arrayBuffer()]; }
        catch { return [key, null]; }
      }));
    } catch { this.raw = []; }
  }

  async unlock() {
    if (!this.context) this.context = new (window.AudioContext || window.webkitAudioContext)();
    if (this.context.state === 'suspended') await this.context.resume();
    await this.loadPromise;
    await Promise.all(this.raw.map(async ([key, data]) => {
      if (data && !this.buffers.has(key)) {
        try { this.buffers.set(key, await this.context.decodeAudioData(data.slice(0))); } catch { /* fallback tone */ }
      }
    }));
    this.raw = [];
  }

  play(key, volume = 0.3) {
    if (!this.enabled || !this.context) return;
    const buffer = this.buffers.get(key);
    if (buffer) {
      const source = this.context.createBufferSource();
      const gain = this.context.createGain();
      gain.gain.value = volume;
      source.buffer = buffer;
      source.connect(gain).connect(this.context.destination);
      source.start();
    } else this.tone(key === 'jackpot' ? 740 : key === 'stop' ? 250 : 520, 0.09, volume * 0.5);
  }

  tone(frequency, duration, volume = 0.08) {
    if (!this.enabled || !this.context) return;
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = 'square'; oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(Math.max(.0001, volume), now);
    gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
    oscillator.connect(gain).connect(this.context.destination);
    oscillator.start(now); oscillator.stop(now + duration);
  }

  tick(phase, speed) {
    if (!this.enabled || !this.context) return;
    const slow = phase === 'DECELERATE';
    this.tone(slow ? 420 : 570, slow ? 0.055 : 0.025, slow ? 0.09 : speed < 90 ? 0.028 : 0.05);
  }
}
