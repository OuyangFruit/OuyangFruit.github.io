export const BET_TYPES = Object.freeze([
  'bar','seven','star','watermelon','bell','papaya','orange','apple'
]);

export const toBetType = symbol => symbol === 'GRAPE' ? 'papaya' : symbol.toLowerCase();
export const toBoardSymbol = betType => betType === 'papaya' ? 'GRAPE' : betType.toUpperCase();
