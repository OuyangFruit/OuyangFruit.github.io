const POOL_SIZE = 28;

// The celebration controller owns everything that is not a lamp: screen shake,
// sparks, the jackpot banner and the scoreboard state. Lamp shows live in
// JackpotLightingSystem so the same plan can be replayed by tests.
export class WinCelebrationController {
  constructor(machine, effects, lighting, audio, scale = 1, bus = null) {
    this.machine = machine;
    this.effects = effects;
    this.lighting = lighting;
    this.audio = audio;
    this.scale = scale;
    this.bus = bus;
    this.pool = [];
  }

  classify(amount, multiplier, special = false) {
    if (special) return 'SPECIAL_EVENT';
    if (!amount) return 'NORMAL';
    if (multiplier >= 32) return 'JACKPOT';
    if (multiplier >= 16) return 'BIG_WIN';
    if (multiplier >= 8) return 'MEDIUM_WIN';
    return 'SMALL_WIN';
  }

  reduced() {
    try {
      return matchMedia('(prefers-reduced-motion: reduce)').matches || (navigator.hardwareConcurrency ?? 8) <= 4;
    } catch { return false; }
  }

  // Sparks are pooled: the nodes are created once and only their CSS custom
  // properties change, so 20+ rounds never grows the DOM.
  ensurePool() {
    const layer = document.getElementById('celebration-layer');
    if (!layer) return [];
    if (!this.pool.length || this.pool[0].parentElement !== layer) {
      layer.replaceChildren();
      this.pool = Array.from({ length: POOL_SIZE }, () => {
        const spark = document.createElement('i');
        spark.className = 'spark';
        layer.append(spark);
        return spark;
      });
    }
    return this.pool;
  }

  particles(power = 1) {
    const pool = this.ensurePool();
    if (!pool.length) return;
    const count = Math.min(pool.length, Math.round((this.reduced() ? 12 : POOL_SIZE) * power));
    for (let index = 0; index < count; index++) {
      const spark = pool[index];
      spark.style.setProperty('--x', `${(Math.random() - .5) * 94}vw`);
      spark.style.setProperty('--r', `${Math.random() * 720 - 360}deg`);
      spark.style.setProperty('--c', `${Math.round(Math.random() * 360)}`);
      spark.classList.remove('spark-fly');
      void spark.offsetWidth;
      spark.classList.add('spark-fly');
    }
    clearTimeout(this.sparkTimer);
    this.sparkTimer = setTimeout(() => pool.forEach(spark => spark.classList.remove('spark-fly')), Math.max(200, 1900 * this.scale));
  }

  banner(text, kind = 'jackpot') {
    const element = document.getElementById('jackpot-banner');
    if (!element || !text) return;
    element.textContent = text;
    element.dataset.kind = kind;
    element.classList.remove('banner-show');
    void element.offsetWidth;
    element.classList.add('banner-show');
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => element.classList.remove('banner-show'), Math.max(200, 2600 * this.scale));
  }

  shake(duration = 600) {
    if (this.reduced()) return;
    this.machine.classList.add('screen-shake');
    clearTimeout(this.shakeTimer);
    this.shakeTimer = setTimeout(() => this.machine.classList.remove('screen-shake'), duration * this.scale);
  }

  async play(level, target, options = {}) {
    this.machine.dataset.winLevel = level;
    const major = ['BIG_WIN', 'JACKPOT', 'SPECIAL_EVENT', 'HIGH_MULTIPLIER', 'FAIRY'].includes(level) || Boolean(options.type);
    if (major) {
      this.shake(level === 'JACKPOT' || level === 'FAIRY' || options.type === 'GRAND_SLAM' ? 700 : 520);
      this.particles(level === 'JACKPOT' || level === 'FAIRY' || options.type === 'GRAND_SLAM' ? 2 : 1);
    }
    if (level === 'FAIRY') this.banner('天女散花', 'jackpot');
    else if (level === 'JACKPOT' || options.type === 'GRAND_SLAM') this.banner('JACKPOT', 'jackpot');
    else if (options.label) this.banner(options.label, options.type ? 'event' : 'win');
    await this.lighting.play(level, { ...options, target });
    return level;
  }

  clear() {
    this.machine.dataset.winLevel = '';
    clearTimeout(this.shakeTimer);
    this.machine.classList.remove('screen-shake');
    document.getElementById('jackpot-banner')?.classList.remove('banner-show');
  }
}
