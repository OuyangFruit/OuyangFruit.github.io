const EVENTS = ['SMALL_THREE','BIG_THREE','BIG_FOUR','DOUBLE_CANNON','TRAIN','GRAND_SLAM'];
const EVENT_WEIGHTS = [25,18,14,18,17,8];

export class FunModeController {
  constructor({ enabled = true, random = Math.random } = {}) {
    this.enabled = enabled; this.random = random; this.quietRounds = 0;
  }
  eventChance() {
    if (!this.enabled) return .011;
    return [.08,.14,.24,.38,.62,.78][Math.min(this.quietRounds, 5)];
  }
  weightedEvent() {
    let roll = this.random() * EVENT_WEIGHTS.reduce((a,b) => a + b, 0);
    for (let i = 0; i < EVENTS.length; i++) { roll -= EVENT_WEIGHTS[i]; if (roll < 0) return EVENTS[i]; }
    return 'SMALL_THREE';
  }
  draw() {
    if (this.random() < this.eventChance()) { this.quietRounds = 0; return this.weightedEvent(); }
    this.quietRounds++; return '';
  }
  noteMajor() { this.quietRounds = 0; }
}
