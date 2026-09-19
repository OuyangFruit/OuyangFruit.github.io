import { BOARD, PRIZES } from './prize-table.js';
import { toBetType } from './bet-types.js';
import { BOARD_PAYOUTS } from './config/board-payouts.js';

// Every physical lamp keeps a stable index and carries its own printed payout.
// The printed label, the payout table and the settlement all read this record,
// so the lamp can never show one multiplier and pay another.
export const BOARD_CELLS = Object.freeze(BOARD.map((symbol, index) => Object.freeze({
  index, symbol, betType: toBetType(symbol),
  pays: BOARD_PAYOUTS[index].pays,
  payoutType: BOARD_PAYOUTS[index].payoutType,
  payout: BOARD_PAYOUTS[index].payout,
  min: BOARD_PAYOUTS[index].min,
  max: BOARD_PAYOUTS[index].max,
  label: BOARD_PAYOUTS[index].label,
  // Lowest value this lamp can pay; kept for legacy callers that only ask
  // "does this lamp pay anything".
  multiplier: BOARD_PAYOUTS[index].payoutType === 'fixed' ? BOARD_PAYOUTS[index].payout : BOARD_PAYOUTS[index].min,
  isSmall: PRIZES[symbol].tier === 'small',
  isLarge: ['big', 'jackpot'].includes(PRIZES[symbol].tier)
})));

// Spots where the board and the payout table disagree. Empty in a healthy build.
export const BOARD_MISMATCHES = Object.freeze(BOARD_CELLS
  .filter(cell => BOARD_PAYOUTS[cell.index].symbol !== cell.symbol)
  .map(cell => cell.index));

export const indicesFor = symbol => BOARD_CELLS.filter(cell => cell.symbol === symbol).map(cell => cell.index);
export const pickIndex = symbol => {
  const choices = indicesFor(symbol);
  return choices[Math.floor(Math.random() * choices.length)];
};
export const calculateWin = (symbol, bet, multiplier = PRIZES[symbol].multiplier) =>
  Math.max(0, bet || 0) * multiplier;
