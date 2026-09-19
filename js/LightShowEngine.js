// Low level lamp primitives. Every method only touches the 24 existing lamp
// nodes through LightingEffects, so no show ever creates DOM.
export class LightShowEngine {
  constructor(effects) {
    this.fx = effects;
    this.all = effects.tiles.map((_, index) => index);
  }

  wait(ms) { return this.fx.wait(ms); }

  async blackout(ms = 200) {
    this.fx.setPower(1);
    this.fx.blackout();
    await this.wait(ms);
  }

  chase(rounds = 1, speed = 40) { return this.fx.chaseClockwise(rounds, speed); }
  reverseChase(rounds = 1, speed = 45) { return this.fx.chaseCounterClockwise(rounds, speed); }

  // Left-to-right / clockwise sweep that lights one lamp at a time.
  wave(speed = 30) { return this.fx.cascade(this.all, speed); }
  waveBack(speed = 30) { return this.fx.cascade([...this.all].reverse(), speed); }

  async rings(target, maxDistance = 4, speed = 90) {
    for (let distance = 1; distance <= maxDistance; distance++) {
      await this.fx.timeline.cue(distance === 1 ? 1 : speed,
        () => this.fx.ring(target, distance), () => this.fx.audio.tick('SPINNING', speed));
    }
  }

  async collapse(target, maxDistance = 5, speed = 80) {
    for (let distance = maxDistance; distance >= 1; distance--) {
      await this.fx.timeline.cue(distance === maxDistance ? 1 : speed,
        () => this.fx.ring(target, distance), () => this.fx.audio.tick('SPINNING', speed));
    }
  }

  async burst(target, times = 3, power = 1) {
    for (let i = 0; i < times; i++) {
      await this.fx.timeline.cue(i ? 80 : 1, () => { this.fx.setPower(power); this.fx.only(target); }, () => this.fx.audio.hit(power));
      await this.wait(95 + power * 20);
    }
    this.fx.only(target);
  }

  async focus(target, times = 4) {
    return this.burst(target, times, 2);
  }

  async sync(indices, times = 4, power = 2) {
    for (let i = 0; i < times; i++) {
      await this.fx.timeline.cue(i ? 90 : 1, () => { this.fx.setPower(power + (i >= times - 2 ? 1 : 0)); this.fx.show(indices); }, () => this.fx.audio.hit(power));
      await this.wait(110);
      this.fx.show([]);
      await this.wait(70);
    }
    this.fx.show(indices);
  }

  async allFlash(times = 3, power = 2) {
    for (let i = 0; i < times; i++) {
      await this.fx.timeline.cue(i ? 95 : 1, () => { this.fx.setPower(power); this.fx.show(this.all); }, () => this.fx.audio.boom(power));
      await this.wait(140);
      this.fx.show([]);
    }
    this.fx.show(this.all);
  }

  async alternate(times = 4, speed = 105) {
    const even = this.all.filter(i => i % 2 === 0);
    const odd = this.all.filter(i => i % 2);
    for (let i = 0; i < times; i++) {
      this.fx.show(i % 2 ? odd : even);
      this.fx.audio.hit(1);
      await this.wait(speed);
    }
  }

  async centerBurst(target) {
    const length = this.fx.tiles.length;
    for (let distance = 0; distance <= 12; distance++) {
      this.fx.show([target, (target + distance) % length, (target - distance + length) % length]);
      this.fx.audio.chime(distance);
      await this.wait(50);
    }
  }

  async jackpotStorm(target) {
    await this.chase(1, 30);
    await this.reverseChase(1);
    await this.allFlash(2);
    await this.centerBurst(target);
    await this.alternate(5);
    await this.allFlash(3);
  }
}
