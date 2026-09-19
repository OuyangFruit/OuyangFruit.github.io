// One canonical event stream per round. The lamp shows and the AudioEngine both
// listen to this bus, so swapping sound assets never changes gameplay timing and
// gameplay code never has to know which sample is loaded.
export const GAME_EVENTS = Object.freeze({
  SPIN_START: 'spin:start',
  SPIN_ACCELERATE: 'spin:accelerate',
  SPIN_CRUISE: 'spin:cruise',
  SPIN_DECELERATE: 'spin:decelerate',
  SPIN_SUSPENSE: 'spin:suspense',
  SPIN_TICK: 'spin:tick',
  SPIN_STOP: 'spin:stop',
  FRUIT_HIT: 'fruit:hit',
  MULTIPLIER_ARM: 'multiplier:arm',
  MULTIPLIER_START: 'multiplier:start',
  MULTIPLIER_TICK: 'multiplier:tick',
  MULTIPLIER_REVEAL: 'multiplier:reveal',
  WIN_START: 'win:start',
  WIN_COUNT: 'win:count',
  WIN_END: 'win:end',
  WIN_COLLECT: 'win:collect',
  ODD_EVEN_START: 'double:start',
  ODD_EVEN_WIN: 'double:win',
  ODD_EVEN_LOSE: 'double:lose',
  MYSTERY_START: 'mystery:start',
  MYSTERY_RESULT: 'mystery:result',
  FAIRY_START: 'fairy:start',
  FAIRY_ROLL: 'fairy:roll',
  FAIRY_FINALE: 'fairy:finale',
  JACKPOT_START: 'jackpot:start',
  JACKPOT_PHASE1: 'jackpot:phase1',
  JACKPOT_PHASE2: 'jackpot:phase2',
  JACKPOT_FINALE: 'jackpot:finale',
  JACKPOT_END: 'jackpot:end',
  SURPRISE_BONUS: 'surprise:bonus',
  ROUND_START: 'round:start',
  ROUND_END: 'round:end'
});

export class GameEventBus {
  constructor() {
    this.listeners = new Map();
    this.recording = false;
    this.log = [];
  }

  on(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(handler);
    return () => this.off(type, handler);
  }

  off(type, handler) {
    this.listeners.get(type)?.delete(handler);
  }

  emit(type, payload = {}) {
    if (this.recording) this.log.push({ type, payload });
    for (const handler of this.listeners.get(type) ?? []) {
      try { handler(payload, type); } catch (error) { console.error(`Event handler failed: ${type}`, error); }
    }
    for (const handler of this.listeners.get('*') ?? []) {
      try { handler(payload, type); } catch (error) { console.error(`Event handler failed: *(${type})`, error); }
    }
    return payload;
  }

  count() {
    let total = 0;
    for (const set of this.listeners.values()) total += set.size;
    return total;
  }

  startRecording() { this.recording = true; this.log = []; }
  stopRecording() { this.recording = false; return this.log; }
  clear() { this.listeners.clear(); }
}
