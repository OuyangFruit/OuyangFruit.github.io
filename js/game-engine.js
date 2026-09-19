import { PRIZES, drawPrize } from './prize-table.js';
import { BOARD_CELLS, calculateWin, pickIndex, indicesFor } from './board-model.js';
import { BET_TYPES, toBetType } from './bet-types.js';
import { GAME_EVENTS as E } from './game-events.js';
import { EXCITEMENT_TIERS, isSpecial } from './config/special-events.js';

export const GAME_STATES = Object.freeze([
  'IDLE','BETTING','SPIN_START','SPINNING','SLOW_DOWN','SUSPENSE','NORMAL_STOP','NORMAL_WIN',
  'SPECIAL_TRIGGER','SPECIAL_INTRO','SPECIAL_RUNNING','SPECIAL_SETTLEMENT','WIN_COUNTING','READY_NEXT'
]);

// Every phase LightRunner can report must be a legal engine state, otherwise the
// round aborts mid-spin.
export const RUNNER_PHASES = Object.freeze(['SPIN_START', 'SPINNING', 'SLOW_DOWN', 'SUSPENSE', 'NORMAL_STOP']);

const emptyBets = () => Object.fromEntries(BET_TYPES.map(key => [key, 0]));

// How long the WIN meter takes to run up, per celebration level.
const COUNT_DURATION = Object.freeze({
  NORMAL: 320, SMALL_WIN: 380, MEDIUM_WIN: 700, BIG_WIN: 1200,
  HIGH_MULTIPLIER: 1300, SPECIAL_EVENT: 620, JACKPOT: 2000, LOSE: 0
});

const REVEAL_LABEL = Object.freeze({
  JACKPOT: 'JACKPOT!', BIG_WIN: 'BIG WIN!', HIGH_MULTIPLIER: 'HIGH MULTIPLIER!', MEDIUM_WIN: 'NICE!'
});

// The high-multiplier surprise always lands on a real high value symbol.
const HIGH_SYMBOLS = ['BELL', 'STAR', 'SEVEN', 'BAR', 'SEVEN', 'STAR'];

export class GameEngine {
  constructor({ runner, effects, special, audio, funMode, multiplier, celebration, lighting, bus, onChange, initialCredit = 1000 }) {
    this.runner = runner; this.effects = effects; this.special = special; this.audio = audio;
    this.onChange = onChange;
    this.funMode = funMode; this.multiplier = multiplier; this.celebration = celebration;
    this.lighting = lighting; this.bus = bus;
    this.credit = initialCredit;
    this.win = 0;
    this.currentBets = emptyBets();
    this.lastBets = emptyBets();
    this.roundBets = emptyBets();
    this.gameState = 'IDLE';
    this.status = '准备就绪 · 按红色按钮下注';
    this.busy = false;
    this.forcedPrize = '';
    this.forcedSpecial = '';
    this.forcedSurprise = false;
    this.forcedMultiplierTier = '';
    this.roundsPlayed = 0;
    this.emit();
  }

  get totalBet() { return Object.values(this.currentBets).reduce((sum, n) => sum + n, 0); }
  emit() { this.onChange?.(this); }
  event(type, payload) { this.bus?.emit(type, payload); }
  state(name, status = this.status) {
    if (!GAME_STATES.includes(name)) throw new Error(`Unknown state ${name}`);
    this.gameState = name; this.status = status; this.emit();
  }
  canEdit() { return !this.busy; }

  placeBet(symbol, amount = 1) {
    const betType = toBetType(symbol);
    if (!this.canEdit() || !(betType in this.currentBets)) return false;
    const before = this.currentBets[betType];
    const next = Math.min(99, before + amount);
    if (next === before) { this.audio.limit(); return false; }
    this.currentBets[betType] = next;
    this.audio.button(amount > 1);
    this.state('BETTING', `${PRIZES[symbol].label} 下注 ${next} 分`);
    if (next === 99) this.audio.limit();
    return true;
  }
  clear() {
    if (!this.canEdit()) return false;
    this.currentBets = emptyBets();
    this.state('BETTING', '下注已清除 · 可按续压恢复');
    return true;
  }
  rebet() {
    if (!this.canEdit() || !Object.values(this.lastBets).some(Boolean)) return false;
    this.currentBets = { ...this.lastBets };
    this.audio.button(true);
    this.state('BETTING', '已恢复上一局下注 · 可直接开始');
    return true;
  }
  setAllBets(value) {
    if (!this.canEdit()) return false;
    this.currentBets = Object.fromEntries(BET_TYPES.map(key => [key, Math.min(99, Math.max(0, value))]));
    this.state('BETTING', `测试下注：每路 ${value} 分`);
    return true;
  }
  addCredit(value) { if (this.canEdit()) { this.credit += value; this.audio.credit(); this.emit(); } }
  reset() {
    if (!this.canEdit()) return;
    this.credit = 1000; this.win = 0;
    this.currentBets = emptyBets(); this.lastBets = emptyBets();
    this.state('IDLE', '积分已重置');
  }

  forcePrize(key) { this.forcedPrize = key; this.forcedSpecial = ''; this.forcedSurprise = false; }
  forceSpecial(type) { this.forcedSpecial = type; this.forcedPrize = ''; this.forcedSurprise = false; }
  forceSurprise() { this.forcedSurprise = true; this.forcedPrize = ''; this.forcedSpecial = ''; }
  forceMultiplierTier(tier = '') { this.forcedMultiplierTier = tier; }
  clearForced() { this.forcedPrize = ''; this.forcedSpecial = ''; this.forcedSurprise = false; this.forcedMultiplierTier = ''; }

  stats() {
    return { roundsPlayed: this.roundsPlayed, credit: this.credit, win: this.win, bet: this.totalBet, ...(this.funMode?.stats?.() ?? {}) };
  }

  // Decides the round outcome before any animation runs. The lamps only ever
  // render this decision; they can never change it.
  decide() {
    if (this.forcedSpecial) return { kind: 'special', type: this.forcedSpecial };
    if (this.forcedSurprise) return { kind: 'surprise' };
    if (this.forcedPrize) return { kind: 'normal', symbol: this.forcedPrize };
    const excitement = this.funMode?.draw() ?? '';
    if (!excitement) return { kind: 'normal' };
    if (isSpecial(excitement)) return { kind: 'special', type: excitement };
    if (excitement === 'SURPRISE_BONUS') return { kind: 'surprise' };
    return { kind: 'highMultiplier' };
  }

  multiplierFor(tier) {
    const pool = this.forcedMultiplierTier || tier;
    return this.multiplier.choose(pool);
  }

  async countWin(amount, duration = 500, level = '') {
    if (!amount) return;
    const from = this.win;
    const steps = Math.min(64, Math.max(6, Math.round(duration / 30)));
    this.event(E.WIN_START, { amount, level });
    this.effects.cabinet.dataset.countLevel = level;
    this.effects.cabinet.classList.add('win-counting');
    this.state('WIN_COUNTING', `WIN +${amount}`);
    for (let step = 1; step <= steps; step++) {
      this.win = from + Math.floor(amount * step / steps);
      this.event(E.WIN_COUNT, { step, steps, level });
      this.emit();
      await this.effects.wait(duration / steps);
    }
    this.win = from + amount;
    this.credit += amount;
    this.effects.cabinet.classList.remove('win-counting');
    delete this.effects.cabinet.dataset.countLevel;
    this.event(E.WIN_END, { amount, level });
    this.emit();
  }

  async settle(cell, { special = false, countDuration, multiplier = cell.multiplier, level = '' } = {}) {
    const amount = calculateWin(cell.symbol, this.roundBets[cell.betType], multiplier);
    if (special) this.state('SPECIAL_SETTLEMENT', `${PRIZES[cell.symbol].label} · +${amount}`);
    else this.state('NORMAL_WIN', `${PRIZES[cell.symbol].label} · ${amount ? `中奖 ${amount}` : '未押中'}`);
    if (amount) await this.countWin(amount, countDuration ?? COUNT_DURATION[level] ?? 500, level);
    return amount;
  }

  // 300-600ms of dead air between the lamps stopping and the multiplier firing up.
  suspense() { return 300 + Math.random() * 300; }

  async start() {
    if (this.busy || !this.totalBet) return false;
    if (this.credit < this.totalBet) {
      this.status = 'CREDIT不足 · 请减少下注'; this.emit(); this.audio.lowCredit();
      this.onInsufficient?.();
      return false;
    }
    this.busy = true;
    this.roundsPlayed++;
    this.roundBets = { ...this.currentBets };
    this.lastBets = { ...this.currentBets };
    this.credit -= this.totalBet; // The only stake deduction in a round.
    this.win = 0;
    this.celebration?.clear();
    this.effects.clearBetWindows();
    this.effects.tiles.forEach(tile => tile.classList.remove('final'));
    this.state('SPIN_START', '跑灯开始');

    const plan = this.decide();
    this.forcedPrize = ''; this.forcedSpecial = ''; this.forcedSurprise = false;
    this.event(E.ROUND_START, { round: this.roundsPlayed, kind: plan.kind });
    try {
      await this.audio.unlock();
      await this.beginSpin();
      const payload = plan.kind === 'special' ? await this.playSpecial(plan)
        : plan.kind === 'surprise' ? await this.playSurprise()
        : await this.playNormal(plan);
      this.status = payload.status;
      this.state('READY_NEXT', this.status);
      this.event(E.ROUND_END, { outcome: payload.outcome, amount: this.win, level: payload.level ?? '', round: this.roundsPlayed });
      return true;
    } catch (error) {
      console.error('Game round failed', error);
      this.effects.restore();
      this.multiplier?.reset();
      this.state('READY_NEXT', '运行中断 · 可重新开始');
      return false;
    } finally {
      this.busy = false;
      this.emit();
    }
  }

  async beginSpin() {
    this.event(E.SPIN_START, { round: this.roundsPlayed });
    await this.effects.timeline.cue(90, () => this.effects.cabinet.classList.add('start-pulse'), null);
    await this.effects.timeline.cue(170, () => this.effects.cabinet.classList.remove('start-pulse'), null);
  }

  spinTierFor(symbol, plan) {
    if (plan.kind === 'highMultiplier') return 'jackpot';
    const tier = symbol ? PRIZES[symbol].tier : 'none';
    return tier === 'jackpot' ? 'jackpot' : 'normal';
  }

  async playNormal(plan = {}) {
    let symbol = plan.symbol || '';
    let poolTier = null;
    if (plan.kind === 'highMultiplier') {
      symbol = HIGH_SYMBOLS[Math.floor(Math.random() * HIGH_SYMBOLS.length)];
      poolTier = 'high';
      this.funMode?.noteEvent?.('HIGH_MULTIPLIER');
    }
    if (!symbol) symbol = drawPrize('');
    const cell = BOARD_CELLS[pickIndex(symbol)];
    const tier = PRIZES[symbol].tier;
    const wagered = (this.roundBets[cell.betType] || 0) > 0;
    const pays = wagered && cell.multiplier > 0 && tier !== 'none';

    await this.runner.spinTo(cell.index, { tier: this.spinTierFor(symbol, plan) });
    await this.effects.wait(this.suspense());
    this.event(E.FRUIT_HIT, { symbol, tier, index: cell.index, wagered });

    if (!pays) {
      await this.lighting.play('LOSE', { target: cell.index });
      this.status = `${PRIZES[symbol].label} · 未中奖`;
      return { status: this.status, outcome: 'lose', level: 'LOSE' };
    }

    const multiplier = this.multiplierFor(poolTier || tier);
    const revealTier = poolTier === 'high' ? 'high' : tier;
    await this.multiplier.land(multiplier, { tier: revealTier, label: poolTier === 'high' ? REVEAL_LABEL.HIGH_MULTIPLIER : '' });
    this.effects.betWindowFlash(symbol);
    this.effects.tiles[cell.index].classList.add('final');

    const amount = calculateWin(symbol, this.roundBets[cell.betType], multiplier);
    const level = poolTier === 'high' ? 'HIGH_MULTIPLIER' : this.celebration.classify(amount, multiplier);
    await this.celebration.play(level, cell.index, {
      label: REVEAL_LABEL[level] ?? '',
      symbols: [symbol],
      indices: indicesFor(symbol),
      target: cell.index
    });
    await this.settle(cell, { multiplier, level });
    this.status = `${PRIZES[symbol].label}中奖 · ×${multiplier} · 赢得 ${this.win} 分`;
    return { status: this.status, outcome: 'win', level };
  }

  // Surprise Bonus: a light show plus free credit, without a full special event.
  async playSurprise() {
    this.funMode?.noteEvent?.('SURPRISE_BONUS');
    const bonus = 120 + Math.floor(Math.random() * 9) * 40;
    const multiplier = this.multiplierFor('high');
    await this.runner.spinTo(pickIndex('BAR'), { tier: 'jackpot' });
    await this.effects.wait(this.suspense());
    await this.multiplier.land(multiplier, { tier: 'high', label: 'BONUS!' });
    this.credit += bonus;
    this.event(E.SURPRISE_BONUS, { bonus, multiplier });
    this.emit();
    await this.celebration.play('HIGH_MULTIPLIER', this.runner.index, {
      label: '惊喜加码', indices: indicesFor('BAR'), target: this.runner.index
    });
    this.event(E.WIN_END, { amount: bonus, level: 'SURPRISE_BONUS' });
    this.status = `惊喜加码 · CREDIT +${bonus} · ×${multiplier}`;
    return { status: this.status, outcome: 'win', level: 'HIGH_MULTIPLIER' };
  }

  async playSpecial(plan) {
    const type = plan.type;
    this.funMode?.noteEvent?.(type);
    this.state('SPECIAL_TRIGGER', `${EXCITEMENT_TIERS[type]?.label ?? type} 触发`);
    const ctx = {
      event: type,
      engine: this,
      state: (name, text) => this.state(name, text),
      spin: (target, options) => this.runner.spinTo(target, options),
      emit: (name, payload) => this.event(name, payload),
      betFor: betType => this.roundBets[betType] || 0,
      multiplier: this.multiplier,
      forcedTier: this.forcedMultiplierTier,
      celebrate: (level, options = {}) => this.celebration.play(level, options.target ?? this.runner.index, { announce: false, ...options }),
      settle: (cell, options) => this.settle(cell, { special: true, ...options })
    };
    await this.special.run(type, ctx);
    this.status = `${EXCITEMENT_TIERS[type]?.label ?? type} · 共赢得 ${this.win} 分`;
    return { status: this.status, outcome: 'special', level: type };
  }

  async highLow(choice) {
    if (this.busy || !this.win) return false;
    this.busy = true;
    try {
      const roll = Math.floor(Math.random() * 10) + 1;
      const won = choice === 'big' ? roll >= 6 : roll <= 5;
      if (won) {
        this.credit += this.win;
        this.win *= 2;
        this.event(E.HIGHLOW_WIN, { roll, win: this.win });
        await this.celebration.play('MEDIUM_WIN', this.runner.index, { label: '压大小成功', indices: [] });
        this.state('READY_NEXT', `${roll} · 压${choice === 'big' ? '大' : '小'}成功，WIN 翻倍`);
      } else {
        this.credit = Math.max(0, this.credit - this.win);
        this.win = 0;
        this.event(E.HIGHLOW_LOSE, { roll });
        await this.lighting.play('LOSE', { target: this.runner.index });
        this.state('READY_NEXT', `${roll} · 压${choice === 'big' ? '大' : '小'}失败`);
      }
      this.emit();
      return true;
    } finally { this.busy = false; this.emit(); }
  }

  specialName(type) { return EXCITEMENT_TIERS[type]?.label ?? type; }
}
