import { PRIZES, drawPrize } from './prize-table.js';
import { BOARD_CELLS, calculateWin, pickIndex } from './board-model.js';
import { drawSpecial } from './config/special-events.js';
import { BET_TYPES, toBetType } from './bet-types.js';

export const GAME_STATES = Object.freeze([
  'IDLE','BETTING','SPIN_START','SPINNING','SLOW_DOWN','NORMAL_STOP','NORMAL_WIN',
  'SPECIAL_TRIGGER','SPECIAL_INTRO','SPECIAL_RUNNING','SPECIAL_SETTLEMENT','WIN_COUNTING','READY_NEXT'
]);
const emptyBets = () => Object.fromEntries(BET_TYPES.map(key => [key, 0]));

export class GameEngine {
  constructor({ runner, effects, special, audio, onChange, initialCredit = 1000 }) {
    this.runner = runner; this.effects = effects; this.special = special; this.audio = audio;
    this.onChange = onChange;
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
    this.emit();
  }
  get totalBet() { return Object.values(this.currentBets).reduce((sum, n) => sum + n, 0); }
  emit() { this.onChange?.(this); }
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
  forcePrize(key) { this.forcedPrize = key; this.forcedSpecial = ''; }
  forceSpecial(type) { this.forcedSpecial = type; this.forcedPrize = ''; }
  async countWin(amount, duration) {
    if (!amount) return;
    const from = this.win;
    const steps = Math.min(24, Math.max(8, Math.round(duration / 35)));
    this.state('WIN_COUNTING', `WIN +${amount}`);
    for (let step = 1; step <= steps; step++) {
      this.win = from + Math.floor(amount * step / steps);
      this.audio.count(); this.emit();
      await this.effects.wait(duration / steps);
    }
    this.win = from + amount;
    this.credit += amount;
    this.emit();
  }
  async settle(cell, { special = false, countDuration } = {}) {
    const amount = calculateWin(cell.symbol, this.roundBets[cell.betType], cell.multiplier);
    if (special) this.state('SPECIAL_SETTLEMENT', `${PRIZES[cell.symbol].label} · +${amount}`);
    else this.state('NORMAL_WIN', `${PRIZES[cell.symbol].label} · ${amount ? `中奖 ${amount}` : '未押中'}`);
    if (amount) await this.countWin(amount, countDuration ?? (special ? 450 : 500));
    return amount;
  }
  async start() {
    if (this.busy || !this.totalBet) return false;
    if (this.credit < this.totalBet) {
      this.status = 'CREDIT不足 · 请减少下注'; this.emit(); this.audio.lowCredit();
      this.onInsufficient?.();
      return false;
    }
    this.busy = true;
    this.roundBets = { ...this.currentBets };
    this.lastBets = { ...this.currentBets };
    this.credit -= this.totalBet; // The only stake deduction in a round.
    this.win = 0;
    this.effects.clearBetWindows();
    this.effects.tiles.forEach(tile => tile.classList.remove('final'));
    this.state('SPIN_START', '跑灯开始');
    const forcedPrize = this.forcedPrize, forcedSpecial = this.forcedSpecial;
    this.forcedPrize = ''; this.forcedSpecial = '';
    try {
      await this.audio.unlock();
      await this.effects.timeline.cue(90, () => this.effects.cabinet.classList.add('start-pulse'), () => this.audio.startKick());
      await this.effects.timeline.cue(160, () => this.effects.cabinet.classList.remove('start-pulse'), () => this.audio.chime(0));
      const specialType = forcedSpecial || (!forcedPrize && drawSpecial());
      if (specialType) {
        this.state('SPECIAL_TRIGGER', `${specialType} 触发`);
        await this.special.run(specialType, {
          event: specialType,
          state: (name, text) => this.state(name, text),
          settle: (cell, options) => this.settle(cell, options)
        });
        this.status = `${this.specialName(specialType)} · 共赢得 ${this.win} 分`;
      } else {
        const symbol = drawPrize(forcedPrize);
        const target = pickIndex(symbol);
        const cell = await this.runner.spinTo(target);
        await this.effects.wait(180);
        if (this.roundBets[cell.betType] > 0 && cell.multiplier > 0) {
          const prizePower = PRIZES[cell.symbol].tier === 'jackpot' ? 3 : PRIZES[cell.symbol].tier === 'big' ? 2 : 1;
          this.effects.betWindowFlash(cell.symbol);
          await this.effects.flashCell(target, prizePower === 3 ? 4 : prizePower === 2 ? 3 : 2, prizePower);
          if (PRIZES[cell.symbol].tier === 'jackpot') await this.effects.jackpotCelebration();
          this.effects.tiles[target].classList.add('final');
          this.audio.prize(cell.symbol, PRIZES[cell.symbol].tier);
        }
        await this.settle(cell, { countDuration: PRIZES[cell.symbol].tier === 'big' ? 850 : 500 });
        this.status = this.win ? `${PRIZES[symbol].label}中奖 · 赢得 ${this.win} 分` : `${PRIZES[symbol].label} · 未中奖`;
      }
      this.state('READY_NEXT', this.status);
      return true;
    } catch (error) {
      console.error('Game round failed', error);
      this.effects.restore();
      this.state('READY_NEXT', '运行中断 · 可重新开始');
      return false;
    } finally {
      this.busy = false;
      this.emit();
    }
  }
  specialName(type) { return ({SMALL_THREE:'小三元',BIG_THREE:'大三元',BIG_FOUR:'大四喜',DOUBLE_CANNON:'双响炮',TRAIN:'开火车',GRAND_SLAM:'大满贯'})[type]; }
}
