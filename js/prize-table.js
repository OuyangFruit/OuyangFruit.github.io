export const PRIZES = Object.freeze({
  LOSE:   { label: '再来一次', multiplier: 0, weight: 50, tier: 'none' },
  APPLE:  { label: '苹果', multiplier: 2, weight: 20, tier: 'small' },
  LEMON:  { label: '柠檬', multiplier: 3, weight: 10, tier: 'small' },
  ORANGE: { label: '橙子', multiplier: 5, weight: 7, tier: 'small' },
  WATERMELON: { label: '西瓜', multiplier: 6, weight: 5, tier: 'small' },
  GRAPE:  { label: '葡萄', multiplier: 8, weight: 5, tier: 'small' },
  BELL:   { label: '铃铛', multiplier: 10, weight: 4, tier: 'big' },
  STAR:   { label: '星星', multiplier: 15, weight: 2, tier: 'big' },
  SEVEN:  { label: '77', multiplier: 25, weight: 1.5, tier: 'big' },
  BAR:    { label: 'BAR', multiplier: 50, weight: 0.5, tier: 'jackpot' }
});

export const BOARD = [
  'APPLE','LEMON','ORANGE','GRAPE','BELL','STAR','SEVEN','BAR',
  'WATERMELON','APPLE','LEMON','ORANGE','GRAPE','BELL',
  'STAR','SEVEN','BAR','LOSE','APPLE','LEMON','ORANGE','GRAPE','LOSE','WATERMELON'
];

export const SYMBOLS = {
  APPLE: ['🍎','APPLE'], LEMON: ['🍋','LEMON'], ORANGE: ['🍊','ORANGE'],
  GRAPE: ['🍇','GRAPE'], BELL: ['🔔','BELL'], STAR: ['⭐','STAR'],
  SEVEN: ['77','DOUBLE'], BAR: ['BAR','BAR'], WATERMELON: ['🍉','MELON'],
  LOSE: ['◇','LUCK']
};

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
