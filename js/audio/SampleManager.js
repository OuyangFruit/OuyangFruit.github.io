// Optional enhancement layer. A missing or broken sample never blocks synth playback.
export class SampleManager {
  constructor(context, output) { this.context = context; this.output = output; this.cache = new Map(); }
  async load(key, url) {
    if (this.cache.has(key)) return this.cache.get(key);
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Sample ${response.status}`);
      const decoded = await this.context.decodeAudioData(await response.arrayBuffer());
      this.cache.set(key, decoded);
      return decoded;
    } catch { this.cache.set(key, null); return null; }
  }
  play(key, volume = .12) {
    const buffer = this.cache.get(key);
    if (!buffer) return false;
    const source = this.context.createBufferSource(), gain = this.context.createGain();
    gain.gain.value = volume;
    source.buffer = buffer;
    source.connect(gain).connect(this.output);
    source.start();
    return true;
  }
}
