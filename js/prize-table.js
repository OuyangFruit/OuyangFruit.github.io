// Clockwise from the top-left cell of the 7 × 7 perimeter in the reference photo.
// SEVEN and GRAPE retain their original internal keys for Demo Mode compatibility;
// their printed machine artwork is the blue-nine and purple-plum symbol.
export const BOARD = [
  'ORANGE','BELL','BAR','BAR','BAR','APPLE','GRAPE',
  'WATERMELON','WATERMELON','LOSE','APPLE','ORANGE',
  'ORANGE','BELL','SEVEN','SEVEN','APPLE','GRAPE','GRAPE',
  'STAR','STAR','LOSE','APPLE','BELL'
];

export const BET_CHANNELS = [
  { key: 'BAR', label: 'BAR' },
  { key: 'SEVEN', label: '蓝九' },
  { key: 'STAR', label: '星星' },
  { key: 'WATERMELON', label: '西瓜' },
  { key: 'BELL', label: '铃铛' },
  { key: 'GRAPE', label: '紫李' },
  { key: 'ORANGE', label: '橘子' },
  { key: 'APPLE', label: '苹果' }
];

export const PRIZES = Object.freeze({
  LOSE: { label: '未中奖', multiplier: 0, weight: 48, tier: 'none' },
  APPLE: { label: '苹果', multiplier: 2, weight: 17, tier: 'small' },
  ORANGE: { label: '橘子', multiplier: 3, weight: 11, tier: 'small' },
  GRAPE: { label: '紫李', multiplier: 5, weight: 8, tier: 'small' },
  WATERMELON: { label: '西瓜', multiplier: 6, weight: 6, tier: 'small' },
  BELL: { label: '铃铛', multiplier: 10, weight: 5, tier: 'big' },
  STAR: { label: '星星', multiplier: 15, weight: 3, tier: 'big' },
  SEVEN: { label: '蓝九', multiplier: 25, weight: 1.5, tier: 'big' },
  BAR: { label: 'BAR', multiplier: 50, weight: 0.5, tier: 'jackpot' }
});

export function drawPrize(forced = '') {
  if (forced && PRIZES[forced]) return forced;
  const entries = Object.entries(PRIZES);
  const total = entries.reduce((n, [, prize]) => n + prize.weight, 0);
  let roll = Math.random() * total;
  for (const [key, prize] of entries) {
    roll -= prize.weight;
    if (roll < 0) return key;
  }
  return 'LOSE';
}
