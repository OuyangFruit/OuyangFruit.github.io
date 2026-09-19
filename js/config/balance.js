// Every tunable probability and multiplier pool lives here so the entertainment
// curve can be adjusted without hunting through gameplay code.

// What the two "未中奖" cells turn into. Weights are relative, not percent.
export const LOSE_EVENT_WEIGHTS = Object.freeze({
  MISS: 35,
  CONSOLATION: 25,
  RESPIN: 18,
  RANDOM_MULTIPLIER: 12,
  MYSTERY: 8,
  FAIRY: 2
});

// Pay-outs are expressed as multiples of the round stake (total bet), because a
// mystery cell has no single fruit channel to pay on.
export const LOSE_EVENT_PAYOUT = Object.freeze({
  CONSOLATION: [1, 2],
  RANDOM_MULTIPLIER: [3, 5, 8, 12],
  MYSTERY: [5, 10, 20]
});

// 天女散花 final multiplier pool: [multiplier, weight], high values are rare.
export const FAIRY_MULTIPLIERS = Object.freeze([
  [24, 30], [32, 24], [48, 18], [64, 12], [96, 8], [128, 5], [256, 1]
]);

export const ODD_EVEN = Object.freeze({
  maxChallenges: 5,      // consecutive double-ups before the win is auto-banked
  autoCollectAt: 400000, // safety valve against runaway numbers
  digitRange: [1, 9]
});

// A jackpot-tier reveal may fake a stop, then jump to the real value.
export const FAKE_OUT = Object.freeze({
  chance: .28,
  holdMs: 420,
  tiers: ['big', 'high', 'jackpot']
});

// Reveal length per celebration tier, in milliseconds (before scale).
export const REVEAL_LENGTH = Object.freeze({
  none: 380, small: 700, special: 800, medium: 1000, big: 1500, high: 1600, jackpot: 2200, fairy: 2600
});

export function drawWeighted(weights, random = Math.random) {
  const entries = Object.entries(weights);
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = random() * total;
  for (const [key, weight] of entries) {
    roll -= weight;
    if (roll < 0) return key;
  }
  return entries[entries.length - 1][0];
}

export function drawFromPool(pool, random = Math.random) {
  if (!pool || !pool.length) return 1;
  if (Array.isArray(pool[0])) {
    const value = drawWeighted(Object.fromEntries(pool.map(([multiplier, weight]) => [String(multiplier), weight])), random);
    return Number(value);
  }
  return pool[Math.floor(random() * pool.length)];
}
