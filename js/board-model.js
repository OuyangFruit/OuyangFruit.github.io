import { BOARD, PRIZES } from './prize-table.js';
import { toBetType } from './bet-types.js';

// Keep the existing symbol payouts. Every physical lamp has a stable index.
export const BOARD_CELLS = Object.freeze(BOARD.map((symbol, index) => Object.freeze({
  index, symbol, betType: toBetType(symbol), multiplier: PRIZES[symbol].multiplier,
  isSmall: PRIZES[symbol].tier === 'small',
  isLarge: ['big', 'jackpot'].includes(PRIZES[symbol].tier)
})));

export const indicesFor = symbol => BOARD_CELLS.filter(cell => cell.symbol === symbol).map(cell => cell.index);
export const pickIndex = symbol => {
  const choices = indicesFor(symbol);
  return choices[Math.floor(Math.random() * choices.length)];
};
export const calculateWin = (symbol, bet, multiplier = PRIZES[symbol].multiplier) =>
  Math.max(0, bet || 0) * multiplier;
