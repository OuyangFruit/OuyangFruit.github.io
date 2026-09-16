export const SPECIAL_CONFIG = Object.freeze({
  enabled: true,
  smallThreeWeight: .35,
  bigThreeWeight: .23,
  bigFourWeight: .17,
  doubleCannonWeight: .25,
  trainWeight: .13,
  grandSlamWeight: .035
});

const weights = [
  ['SMALL_THREE', SPECIAL_CONFIG.smallThreeWeight],
  ['BIG_THREE', SPECIAL_CONFIG.bigThreeWeight],
  ['BIG_FOUR', SPECIAL_CONFIG.bigFourWeight],
  ['DOUBLE_CANNON', SPECIAL_CONFIG.doubleCannonWeight],
  ['TRAIN', SPECIAL_CONFIG.trainWeight],
  ['GRAND_SLAM', SPECIAL_CONFIG.grandSlamWeight]
];

export function drawSpecial() {
  if (!SPECIAL_CONFIG.enabled) return '';
  let roll = Math.random() * 100;
  for (const [name, weight] of weights) {
    roll -= weight;
    if (roll < 0) return name;
  }
  return '';
}
