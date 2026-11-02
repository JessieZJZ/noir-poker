// Premium starting hands for the deal highlight, about the top 11% of combos:
// every pair; AK, AQ, AJ; and suited AT, KQ, KJ, QJ, JT. It is a celebration
// cue only and never feeds bot decisions or review grading.
const OFFSUIT = new Set(['14-13', '14-12', '14-11']);
const SUITED = new Set(['14-10', '13-12', '13-11', '12-11', '11-10']);
export function isPremiumStart(hole) {
  if (!Array.isArray(hole) || hole.length !== 2) return false;
  const [high, low] = hole.map((card) => card.rank).sort((a, b) => b - a);
  if (high === low) return true;
  const key = `${high}-${low}`;
  return OFFSUIT.has(key) || (hole[0].suit === hole[1].suit && SUITED.has(key));
}
