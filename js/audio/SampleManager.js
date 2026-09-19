// Optional enhancement layer. A missing or broken sample never blocks synth playback.
export class SampleManager {
  constructor(context, output) {
    this.context = context;
    this.output = output;
    this.cache = new Map();
    this.pending = new Map();
    this.groups = new Map();
  }
  async load(key, url) {
    if (this.cache.has(key)) return this.cache.get(key);
    if (this.pending.has(key)) return this.pending.get(key);
    const pending = this.fetchAndDecode(key, url);
    this.pending.set(key, pending);
    return pending;
  }
  async fetchAndDecode(key, url) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Sample ${response.status}`);
      const decoded = await this.context.decodeAudioData(await response.arrayBuffer());
      this.cache.set(key, decoded);
      return decoded;
    } catch (error) {
      console.warn(`Audio sample unavailable: ${key}`, error);
      this.cache.set(key, null);
      return null;
    } finally {
      this.pending.delete(key);
    }
  }
  preload(manifest) {
    return Promise.all(Object.entries(manifest).map(([key, url]) => this.load(key, url)));
  }
  play(key, { volume = .12, rate = 1, group = 'oneshot', replace = false } = {}) {
    const buffer = this.cache.get(key);
    if (!buffer) return false;
    if (replace) this.stop(group);
    const source = this.context.createBufferSource(), gain = this.context.createGain();
    gain.gain.value = volume;
    source.buffer = buffer;
    source.playbackRate.value = rate;
    source.connect(gain).connect(this.output);
    const voices = this.groups.get(group) || new Set();
    voices.add(source);
    this.groups.set(group, voices);
    source.addEventListener('ended', () => voices.delete(source), { once: true });
    source.start();
    return true;
  }
  stop(group) {
    const voices = this.groups.get(group);
    if (!voices) return;
    for (const source of voices) {
      try { source.stop(); } catch { /* already stopped */ }
    }
    voices.clear();
  }
}
