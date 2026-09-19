// Single source of truth for what can interrupt a normal round.
//
// Rarity is expressed twice on purpose:
//   weight  - relative share inside one excitement draw
//   minHeat - how many quiet rounds must pass before the type is even eligible
// A legendary surprise (大满贯) can never fire early and never fires twice in a row.
export const EXCITEMENT_TIERS = Object.freeze({
  SMALL_THREE: { label: '小三元', weight: 24, rarity: 'common', minHeat: 0, special: true },
  BIG_THREE: { label: '大三元', weight: 16, rarity: 'uncommon', minHeat: 0, special: true },
  BIG_FOUR: { label: '大四喜', weight: 12, rarity: 'rare', minHeat: 1, special: true },
  DOUBLE_CANNON: { label: '双响炮', weight: 14, rarity: 'uncommon', minHeat: 0, special: true },
  TRAIN: { label: '开火车', weight: 13, rarity: 'uncommon', minHeat: 0, special: true },
  GRAND_SLAM: { label: '大满贯', weight: 3, rarity: 'legendary', minHeat: 2, special: true },
  SURPRISE_BONUS: { label: '惊喜加码', weight: 10, rarity: 'common', minHeat: 0, special: false },
  HIGH_MULTIPLIER: { label: '高倍率', weight: 18, rarity: 'common', minHeat: 0, special: false }
});

export const EXCITEMENT_ORDER = Object.freeze(Object.keys(EXCITEMENT_TIERS));

// Quiet rounds before an excitement event is guaranteed. The pity ladder in
// FunModeController is this long, which keeps the average gap near 4 rounds.
export const PITY_LADDER_LENGTH = 7;

// After a legendary fires the machine calms down for this many rounds.
export const LEGENDARY_COOLDOWN = 3;

// Legacy shape kept for callers that only care about the six board specials.
export const SPECIAL_CONFIG = Object.freeze({
  enabled: true,
  ...Object.fromEntries(EXCITEMENT_ORDER.filter(type => EXCITEMENT_TIERS[type].special)
    .map(type => [`${type.toLowerCase().replace(/_(\w)/g, (_, c) => c.toUpperCase())}Weight`,
      EXCITEMENT_TIERS[type].weight]))
});

const SPECIAL_WEIGHTS = EXCITEMENT_ORDER
  .filter(type => EXCITEMENT_TIERS[type].special)
  .map(type => [type, EXCITEMENT_TIERS[type].weight]);
const SPECIAL_TOTAL = SPECIAL_WEIGHTS.reduce((sum, [, weight]) => sum + weight, 0);

export function drawSpecial() {
  let roll = Math.random() * SPECIAL_TOTAL;
  for (const [type, weight] of SPECIAL_WEIGHTS) {
    roll -= weight;
    if (roll < 0) return type;
  }
  return '';
}

export function isSpecial(type) { return Boolean(EXCITEMENT_TIERS[type]?.special); }
