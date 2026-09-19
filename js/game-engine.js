import { PRIZES, drawPrize } from './prize-table.js';
import { BOARD_CELLS, calculateWin, pickIndex, indicesFor } from './board-model.js';
import { BET_TYPES, toBetType } from './bet-types.js';
import { GAME_EVENTS as E } from './game-events.js';
import { EXCITEMENT_TIERS, isSpecial } from './config/special-events.js';
import { drawPayout, payoutRange } from './config/board-payouts.js';
import {
  LOSE_EVENT_WEIGHTS, LOSE_EVENT_PAYOUT, FAIRY_MULTIPLIERS, ODD_EVEN,
  drawWeighted, drawFromPool
} from './config/balance.js';

export const GAME_STATES = Object.freeze([
  'IDLE','BETTING','SPIN_START','SPINNING','SLOW_DOWN','SUSPENSE','NORMAL_STOP','NORMAL_WIN',
  'SPECIAL_TRIGGER','SPECIAL_INTRO','SPECIAL_RUNNING','SPECIAL_SETTLEMENT','MYSTERY','DOUBLE_UP',
  'WIN_COUNTING','READY_NEXT'
]);

// Every phase LightRunner can report must be a legal engine state, otherwise the
// round aborts mid-spin.
export const RUNNER_PHASES = Object.freeze(['SPIN_START', 'SPINNING', 'SLOW_DOWN', 'SUSPENSE', 'NORMAL_STOP']);

const emptyBets = () => Object.fromEntries(BET_TYPES.map(key => [key, 0]));

// How long the WIN meter takes to run up, per celebration level.
const COUNT_DURATION = Object.freeze({
  NORMAL: 320, SMALL_WIN: 380, MEDIUM_WIN: 700, BIG_WIN: 1200,
  HIGH_MULTIPLIER: 1300, SPECIAL_EVENT: 620, JACKPOT: 2000, FAIRY: 3200, MYSTERY: 900
});

const REVEAL_LABEL = Object.freeze({
  JACKPOT: 'JACKPOT!', BIG_WIN: 'BIG WIN!', HIGH_MULTIPLIER: 'HIGH MULTIPLIER!', MEDIUM_WIN: 'NICE!'
});

const HIGH_SYMBOLS = ['BELL', 'STAR', 'SEVEN', 'BAR', 'SEVEN', 'STAR'];
const MYSTERY_LABEL = Object.freeze({
  MISS: '未中奖', CONSOLATION: '保底小奖', RESPIN: '再转一次',
  RANDOM_MULTIPLIER: '随机倍率', MYSTERY: '神秘奖', FAIRY: '天女散花'
});
const MAX_WIN = 999999;

// Reveal length follows the real printed value, not the symbol tier.
const payoutTier = value =>
  value >= 50 ? 'jackpot' : value >= 20 ? 'big' : value >= 8 ? 'medium' : 'small';

const integerPool = ({ min, max }) => (max > min ? Array.from({ length: max - min + 1 }, (_, i) => min + i) : null);

export class GameEngine {
  constructor({ runner, effects, special, audio, funMode, multiplier, celebration, lighting, bus, onChange, initialCredit = 1000, random = Math.random }) {
    this.runner = runner; this.effects = effects; this.special = special; this.audio = audio;
    this.onChange = onChange;
    this.funMode = funMode; this.multiplier = multiplier; this.celebration = celebration;
    this.lighting = lighting; this.bus = bus;
    this.random = random;
    this.credit = initialCredit;
    // WIN is a pending, uncollected prize. It only reaches CREDIT through 收分,
    // so a failed 单双 challenge can never touch the player's safe balance.
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
    this.forcedLoseEvent = '';
    this.forcedCellIndex = null;
    this.doubleChallenges = 0;
    this.roundsPlayed = 0;
    this.emit();
  }

  get totalBet() { return Object.values(this.currentBets).reduce((sum, n) => sum + n, 0); }
  get roundStake() { return Math.max(1, Object.values(this.roundBets).reduce((sum, n) => sum + n, 0)); }
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
    this.credit = 1000; this.win = 0; this.doubleChallenges = 0;
    this.currentBets = emptyBets(); this.lastBets = emptyBets();
    this.state('IDLE', '积分已重置');
  }

  forcePrize(key) { this.forcedPrize = key; this.forcedSpecial = ''; this.forcedSurprise = false; this.forcedLoseEvent = ''; this.forcedCellIndex = null; }
  forceSpecial(type) { this.forcedSpecial = type; this.forcedPrize = ''; this.forcedSurprise = false; this.forcedLoseEvent = ''; this.forcedCellIndex = null; }
  forceSurprise() { this.forcedSurprise = true; this.forcedPrize = ''; this.forcedSpecial = ''; this.forcedLoseEvent = ''; this.forcedCellIndex = null; }
  forceLoseEvent(type) { this.forcedLoseEvent = type; this.forcedPrize = 'LOSE'; this.forcedSpecial = ''; this.forcedSurprise = false; this.forcedCellIndex = null; }
  // Pin the lamps to one exact lamp index: used by the rule-consistency audit.
  forceCell(index) { this.forcedCellIndex = index; this.forcedPrize = ''; this.forcedSpecial = ''; this.forcedSurprise = false; this.forcedLoseEvent = ''; }
  forceMultiplierTier(tier = '') { this.forcedMultiplierTier = tier; }
  clearForced() {
    this.forcedPrize = ''; this.forcedSpecial = ''; this.forcedSurprise = false;
    this.forcedMultiplierTier = ''; this.forcedLoseEvent = ''; this.forcedCellIndex = null;
  }

  stats() {
    return {
      roundsPlayed: this.roundsPlayed, credit: this.credit, win: this.win,
      bet: this.totalBet, doubles: this.doubleChallenges, ...(this.funMode?.stats?.() ?? {})
    };
  }

  // Decides the round outcome before any animation runs. The lamps only ever
  // render this decision; they can never change it.
  decide() {
    if (this.forcedSpecial) return { kind: 'special', type: this.forcedSpecial };
    if (this.forcedSurprise) return { kind: 'surprise' };
    if (this.forcedCellIndex !== null && this.forcedCellIndex !== undefined) return { kind: 'normal', cellIndex: this.forcedCellIndex };
    if (this.forcedPrize) return { kind: 'normal', symbol: this.forcedPrize };
    const excitement = this.funMode?.draw() ?? '';
    if (!excitement) return { kind: 'normal' };
    if (isSpecial(excitement)) return { kind: 'special', type: excitement };
    if (excitement === 'SURPRISE_BONUS') return { kind: 'surprise' };
    return { kind: 'highMultiplier' };
  }

  multiplierFor(tier) { return this.multiplier.choose(this.forcedMultiplierTier || tier); }

  // ---------------------------------------------------------------- money
  // WIN only ever moves to CREDIT through here (or automatically when a new
  // round starts, so a pending prize can never be silently lost).
  bankWin(status = '') {
    if (!this.win) return 0;
    const amount = this.win;
    this.credit += amount;
    this.win = 0;
    this.doubleChallenges = 0;
    this.audio.credit();
    this.event(E.WIN_COLLECT, { amount, credit: this.credit });
    if (status) this.status = status;
    this.emit();
    return amount;
  }

  collect() {
    if (this.busy || !this.win) return false;
    const amount = this.bankWin();
    this.state('READY_NEXT', `已收分 ${amount} · CREDIT ${this.credit}`);
    return true;
  }

  async countWin(amount, duration = 500, level = '') {
    if (!amount) return;
    const from = this.win;
    const steps = Math.min(64, Math.max(6, Math.round(duration / 30)));
    this.event(E.WIN_START, { amount, level });
    this.effects.cabinet.dataset.countLevel = level;
    this.effects.cabinet.classList.add('win-counting', 'win-active');
    this.state('WIN_COUNTING', `WIN +${amount}`);
    for (let step = 1; step <= steps; step++) {
      this.win = from + Math.floor(amount * step / steps);
      this.event(E.WIN_COUNT, { step, steps, level });
      this.emit();
      await this.effects.wait(duration / steps);
    }
    this.win = from + amount;
    this.effects.cabinet.classList.remove('win-counting');
    delete this.effects.cabinet.dataset.countLevel;
    // Final hit: the WIN window pops to ~1.15x, flashes, then settles back.
    this.effects.cabinet.classList.add('win-pop');
    clearTimeout(this.winPopTimer);
    this.winPopTimer = setTimeout(() => this.effects.cabinet.classList.remove('win-pop', 'win-active'),
      Math.max(160, 1500 * (this.effects.scale ?? 1)));
    this.event(E.WIN_END, { amount, level, pending: this.win });
    this.emit();
  }

  async settle(cell, { special = false, countDuration, multiplier = cell.multiplier, level = '', bet = null } = {}) {
    const amount = calculateWin(cell.symbol, bet ?? this.roundBets[cell.betType], multiplier);
    if (special) this.state('SPECIAL_SETTLEMENT', `${PRIZES[cell.symbol].label} · +${amount}`);
    else this.state('NORMAL_WIN', `${PRIZES[cell.symbol].label} · ${amount ? `中奖 ${amount}` : '未押中'}`);
    if (amount) await this.countWin(amount, countDuration ?? COUNT_DURATION[level] ?? 500, level);
    // Let the result sit on screen instead of snapping to the next state.
    await this.effects.wait(level === 'JACKPOT' || level === 'FAIRY' ? 1400 : 900);
    return amount;
  }

  // 300-600ms of dead air between the lamps stopping and the multiplier firing up.
  suspense() { return 300 + Math.random() * 300; }

  // ------------------------------------------------------------- round flow
  async start() {
    if (this.busy || !this.totalBet) return false;
    if (this.credit < this.totalBet) {
      this.status = 'CREDIT不足 · 请减少下注'; this.emit(); this.audio.lowCredit();
      this.onInsufficient?.();
      return false;
    }
    // A pending prize is banked before a new stake is taken, so nothing is lost
    // and CREDIT never mixes in an uncollected win during play.
    if (this.win > 0) this.bankWin();
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
    this.forcedPrize = ''; this.forcedSpecial = ''; this.forcedSurprise = false; this.forcedCellIndex = null;
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

  // The settlement the player watches, in order:
  //   which lamp  ->  the lamp's printed multiplier  ->  BET x multiplier  ->  WIN
  // The multiplier is read from the lamp's own payout record, so the printed
  // label and the money can never disagree.
  async revealWin(cell, symbol, { bonus = 0, bonusLabel = '', betOverride = null } = {}) {
    const payout = drawPayout(cell.index, this.random);
    const range = payoutRange(cell.index);
    const pool = cell.payoutType === 'range' ? integerPool(range) : null;

    // 1. Tell the player where the lamps stopped.
    this.multiplier.showSymbol(PRIZES[symbol].label);
    await this.effects.wait(460);

    // 2. Reveal the multiplier: range lamps only roll inside their printed window.
    await this.multiplier.land(payout, { tier: payoutTier(payout), label: '', pool });

    this.effects.betWindowFlash(symbol);
    this.effects.tiles[cell.index].classList.add('final');

    // 3. Show the arithmetic.
    const bet = betOverride ?? this.roundBets[cell.betType] ?? 0;
    const amount = bet * payout * (bonus || 1);
    this.multiplier.showFormula(bonus ? `BET ${bet} × ${payout} × ${bonus}` : `BET ${bet} × ${payout}`);
    await this.effects.wait(560);
    this.multiplier.showFormula(`WIN ${amount}`, 'WIN');
    await this.effects.wait(320);

    const level = bonus ? 'SPECIAL_EVENT' : this.celebration.classify(amount, payout);
    await this.celebration.play(level, cell.index, {
      label: bonusLabel || REVEAL_LABEL[level] || '', symbols: [symbol],
      indices: indicesFor(symbol), target: cell.index
    });
    await this.settle(cell, { multiplier: payout * (bonus || 1), level, bet });
    return { multiplier: payout, level, amount: this.win };
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
    const cell = plan.cellIndex === undefined ? BOARD_CELLS[pickIndex(symbol)] : BOARD_CELLS[plan.cellIndex];
    symbol = cell.symbol;
    const tier = PRIZES[symbol].tier;
    const wagered = (this.roundBets[cell.betType] || 0) > 0;
    const pays = wagered && cell.pays;

    await this.runner.spinTo(cell.index, { tier: this.spinTierFor(symbol, plan) });
    // The winning lamp holds its full-strength glow before anything else moves,
    // so the player always learns "where did I land" first.
    if (pays) this.effects.tiles[cell.index].classList.add('final');
    await this.effects.wait(pays ? 900 : this.suspense());
    this.event(E.FRUIT_HIT, { symbol, tier, index: cell.index, wagered });

    if (!pays) return this.playLoseMystery(cell);

    const { level, multiplier } = await this.revealWin(cell, symbol,
      poolTier === 'high' ? { bonusLabel: REVEAL_LABEL.HIGH_MULTIPLIER } : {});
    this.status = `${PRIZES[symbol].label} ${cell.label} → ×${multiplier} · 赢得 ${this.win} 分`;
    return { status: this.status, outcome: 'win', level };
  }

  // -------------------------------------------------- 未中奖 → mystery cell
  pickParity(kind) {
    const odds = [1, 3, 5, 7, 9], evens = [2, 4, 6, 8];
    const pool = kind === 'odd' ? odds : evens;
    return pool[Math.floor(this.random() * pool.length)];
  }

  async playLoseMystery(cell) {
    const outcome = this.forcedLoseEvent || drawWeighted(LOSE_EVENT_WEIGHTS, this.random);
    this.forcedLoseEvent = '';
    this.event(E.MYSTERY_START, { outcome, index: cell.index });
    this.state('MYSTERY', `未中奖 · ${MYSTERY_LABEL[outcome]}?`);
    await this.lighting.play('MYSTERY_INTRO', { target: cell.index, label: '???' });

    if (outcome === 'MISS') {
      await this.lighting.play('LOSE', { target: cell.index });
      this.event(E.MYSTERY_RESULT, { outcome });
      this.multiplier.reset();
      this.status = `${PRIZES[cell.symbol].label} · 未中奖`;
      return { status: this.status, outcome: 'lose', level: 'LOSE' };
    }

    if (outcome === 'RESPIN') {
      this.celebration.banner('再转一次', 'event');
      this.audio.chime(2);
      this.event(E.MYSTERY_RESULT, { outcome });
      // A free re-spin always lands on a paying symbol so the bonus cannot
      // fizzle into a second disappointment.
      let symbol = '';
      while (!symbol || symbol === 'LOSE') symbol = drawPrize('');
      const next = BOARD_CELLS[pickIndex(symbol)];
      await this.runner.spinTo(next.index, { tier: 'normal' });
      this.effects.tiles[next.index].classList.add('final');
      await this.effects.wait(760);
      this.event(E.FRUIT_HIT, { symbol, tier: PRIZES[symbol].tier, index: next.index, wagered: true });
      // The free spin pays the lamp's own printed rule, measured against the
      // round stake so a player who did not back that fruit still wins something.
      const { level, multiplier } = await this.revealWin(next, symbol, { betOverride: this.roundStake });
      this.status = `再转一次 · ${PRIZES[symbol].label} ${next.label} → ×${multiplier} · WIN ${this.win}`;
      return { status: this.status, outcome: 'win', level };
    }

    if (outcome === 'FAIRY') return this.playFairy(cell);

    const multiplier = drawFromPool(LOSE_EVENT_PAYOUT[outcome]);
    this.event(E.MYSTERY_RESULT, { outcome, multiplier });
    this.multiplier.showSymbol(MYSTERY_LABEL[outcome]);
    await this.effects.wait(380);
    await this.multiplier.land(multiplier, { tier: 'special', label: MYSTERY_LABEL[outcome] });
    const amount = Math.min(MAX_WIN, this.roundStake * multiplier);
    this.multiplier.showFormula(`BET ${this.roundStake} × ${multiplier}`, 'BONUS');
    await this.effects.wait(520);
    this.multiplier.showFormula(`WIN ${amount}`, 'WIN');
    await this.effects.wait(280);
    const level = outcome === 'MYSTERY' ? 'BIG_WIN' : outcome === 'RANDOM_MULTIPLIER' ? 'MEDIUM_WIN' : 'SMALL_WIN';
    await this.celebration.play(level, cell.index, { label: MYSTERY_LABEL[outcome], indices: [], target: cell.index });
    this.win += amount;
    this.audio.count();
    this.emit();
    await this.effects.wait(200);
    this.status = `${MYSTERY_LABEL[outcome]} ×${multiplier} · WIN +${amount}`;
    return { status: this.status, outcome: 'win', level };
  }

  // ------------------------------------------------------------- 天女散花
  async playFairy(cell) {
    const multiplier = drawFromPool(FAIRY_MULTIPLIERS, this.random);
    this.state('MYSTERY', '天女散花');
    this.event(E.MYSTERY_RESULT, { outcome: 'FAIRY', multiplier });
    await this.lighting.play('FAIRY', {
      target: cell.index,
      label: '天女散花',
      // The show owns the music cue: it starts after the omen, not before it.
      announce: false,
      onStart: () => {
        // The music and banner fire here, after the omen, so the cue lands with
        // the first lamp beat instead of over a dark cabinet.
        this.event(E.FAIRY_START, { multiplier, level: 'FAIRY' });
        this.effects.cabinet.dataset.winLevel = 'FAIRY';
        this.celebration.banner('天女散花', 'jackpot');
        this.celebration.shake(820);
        this.celebration.particles(2);
      },
      onRoll: async () => {
        this.event(E.FAIRY_ROLL, { multiplier });
        await this.multiplier.land(multiplier, { tier: 'fairy', label: '天女散花' });
      }
    });
    const amount = Math.min(MAX_WIN, this.roundStake * multiplier);
    await this.countWin(amount, COUNT_DURATION.FAIRY, 'FAIRY');
    this.status = `天女散花 ×${multiplier} · WIN +${amount}`;
    return { status: this.status, outcome: 'win', level: 'FAIRY' };
  }

  // ------------------------------------------------------------ 单双翻倍
  async oddEven(choice) {
    if (this.busy || !this.win) return false;
    this.busy = true;
    try {
      const label = choice === 'odd' ? '单' : '双';
      this.event(E.ODD_EVEN_START, { choice, win: this.win, challenge: this.doubleChallenges + 1 });
      this.state('DOUBLE_UP', `${label} · 摇号中`);
      const won = this.random() < .5;
      const target = this.pickParity(won ? choice : choice === 'odd' ? 'even' : 'odd');
      await this.multiplier.rollDigits({ target, duration: 1500, tier: 'high', label });
      await this.effects.wait(320);
      this.doubleChallenges++;
      if (won) {
        this.win = Math.min(MAX_WIN, this.win * 2);
        this.event(E.ODD_EVEN_WIN, { choice, roll: target, win: this.win });
        await this.celebration.play('MEDIUM_WIN', this.runner.index, { label: `压${label}成功`, indices: [] });
        this.state('READY_NEXT', `${target} · 压${label}成功，WIN 翻倍至 ${this.win}`);
        if (this.doubleChallenges >= ODD_EVEN.maxChallenges || this.win >= ODD_EVEN.autoCollectAt) {
          this.busy = false;
          this.bankWin(`连续 ${this.doubleChallenges} 次 · 自动收分 ${this.win}`);
          this.state('READY_NEXT', this.status);
        }
      } else {
        const lost = this.win;
        this.win = 0;
        this.doubleChallenges = 0;
        this.event(E.ODD_EVEN_LOSE, { choice, roll: target, lost });
        await this.lighting.play('LOSE', { target: this.runner.index });
        this.state('READY_NEXT', `${target} · 压${label}失败，WIN 归零（CREDIT 不受影响）`);
      }
      this.emit();
      return true;
    } finally {
      this.busy = false;
      this.emit();
    }
  }

  // --------------------------------------------------------- 惊喜 / 特殊奖
  async playSurprise() {
    this.funMode?.noteEvent?.('SURPRISE_BONUS');
    // The surprise pays the multiplier it shows, measured against the stake.
    const multiplier = drawFromPool([2, 3, 5, 8]);
    const bonus = Math.min(MAX_WIN, this.roundStake * multiplier);
    await this.runner.spinTo(pickIndex('BAR'), { tier: 'jackpot' });
    await this.effects.wait(700);
    this.multiplier.showSymbol('惊喜加码');
    await this.effects.wait(380);
    await this.multiplier.land(multiplier, { tier: 'medium', label: 'BONUS' });
    this.multiplier.showFormula(`BET ${this.roundStake} × ${multiplier}`, 'BONUS');
    await this.effects.wait(520);
    this.multiplier.showFormula(`WIN ${bonus}`, 'WIN');
    await this.effects.wait(280);
    this.win += bonus;
    this.event(E.SURPRISE_BONUS, { bonus, multiplier });
    this.emit();
    await this.celebration.play('HIGH_MULTIPLIER', this.runner.index, {
      label: '惊喜加码', indices: indicesFor('BAR'), target: this.runner.index
    });
    this.event(E.WIN_END, { amount: bonus, level: 'SURPRISE_BONUS', pending: this.win });
    this.status = `惊喜加码 · WIN +${bonus} · ×${multiplier}`;
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
      random: this.random,
      forcedTier: this.forcedMultiplierTier,
      celebrate: (level, options = {}) => this.celebration.play(level, options.target ?? this.runner.index, { announce: false, ...options }),
      settle: (cell, options) => this.settle(cell, { special: true, ...options })
    };
    await this.special.run(type, ctx);
    this.status = `${EXCITEMENT_TIERS[type]?.label ?? type} · 共赢得 ${this.win} 分`;
    return { status: this.status, outcome: 'special', level: type };
  }

  specialName(type) { return EXCITEMENT_TIERS[type]?.label ?? type; }
}
