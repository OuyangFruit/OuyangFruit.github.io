// THE single source of truth for what every outer lamp pays.
//
// The printed label is DERIVED from the numbers below, never written by hand,
// so "what the lamp shows" and "what the lamp pays" cannot drift apart.
// Order matches js/prize-table.js BOARD (perimeter, clockwise from the top-left).
const PRINTED = [
  { symbol: 'ORANGE', type: 'range', min: 10, max: 20 },
  { symbol: 'BELL', type: 'range', min: 10, max: 20 },
  { symbol: 'BAR', type: 'fixed', payout: 60 },
  { symbol: 'BAR', type: 'fixed', payout: 120 },
  { symbol: 'BAR', type: 'fixed', payout: 30 },
  { symbol: 'APPLE', type: 'range', min: 5, max: 6 },
  { symbol: 'GRAPE', type: 'range', min: 10, max: 20 },

  { symbol: 'WATERMELON', type: 'range', min: 20, max: 40 },
  { symbol: 'WATERMELON', type: 'fixed', payout: 3 },
  { symbol: 'LOSE', type: 'none' },
  { symbol: 'APPLE', type: 'range', min: 5, max: 6 },
  { symbol: 'ORANGE', type: 'fixed', payout: 3 },

  { symbol: 'ORANGE', type: 'range', min: 10, max: 20 },
  { symbol: 'BELL', type: 'range', min: 10, max: 20 },
  { symbol: 'SEVEN', type: 'fixed', payout: 3 },
  { symbol: 'SEVEN', type: 'range', min: 20, max: 40 },
  { symbol: 'APPLE', type: 'range', min: 5, max: 6 },
  { symbol: 'GRAPE', type: 'fixed', payout: 3 },
  { symbol: 'GRAPE', type: 'range', min: 10, max: 20 },

  { symbol: 'STAR', type: 'range', min: 20, max: 40 },
  { symbol: 'STAR', type: 'fixed', payout: 3 },
  { symbol: 'LOSE', type: 'none' },
  { symbol: 'APPLE', type: 'range', min: 5, max: 6 },
  { symbol: 'BELL', type: 'fixed', payout: 3 }
];

export const labelFor = entry =>
  entry.type === 'fixed' ? `×${entry.payout}`
    : entry.type === 'none' ? ''
      : entry.min === entry.max ? `×${entry.min}` : `${entry.min}–${entry.max}`;

export const BOARD_PAYOUTS = Object.freeze(PRINTED.map((entry, index) => Object.freeze({
  index,
  symbol: entry.symbol,
  payoutType: entry.type,
  pays: entry.type !== 'none',
  payout: entry.payout ?? 0,
  min: entry.min ?? 0,
  max: entry.max ?? 0,
  label: labelFor(entry)
})));

// The exact value a lamp pays. Fixed rules are returned untouched; range rules
// draw an integer inside their printed window and nothing else.
export function drawPayout(index, random = Math.random) {
  const cell = BOARD_PAYOUTS[index];
  if (!cell) throw new Error(`No payout for lamp ${index}`);
  if (cell.payoutType === 'none') return 0;
  if (cell.payoutType === 'fixed') return cell.payout;
  return cell.min + Math.floor(random() * (cell.max - cell.min + 1));
}

export function payoutRange(index) {
  const cell = BOARD_PAYOUTS[index];
  if (!cell) return { min: 0, max: 0 };
  return cell.payoutType === 'fixed' ? { min: cell.payout, max: cell.payout } : { min: cell.min, max: cell.max };
}

// The whole printed table for one lamp, used by the audit test.
export function describeCell(index) {
  const cell = BOARD_PAYOUTS[index];
  return {
    index, symbol: cell.symbol, label: cell.label, payoutType: cell.payoutType,
    min: cell.payoutType === 'fixed' ? cell.payout : cell.min,
    max: cell.payoutType === 'fixed' ? cell.payout : cell.max
  };
}
