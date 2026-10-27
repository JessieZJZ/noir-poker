// A simple, deterministic starting-hand ordering, weighted by the 1,326 actual
// combinations. This is a range-selection heuristic, not an equity table.
function startingValue(hole) {
  const [high, low] = hole.map((c) => c.rank).sort((a, b) => b - a);
  if (high === low) return 30 + high * 2;
  const suited = hole[0].suit === hole[1].suit,
    gap = high - low;
  return (
    high * 1.9 +
    low * 0.9 +
    (suited ? 4 : 0) +
    (gap === 1 ? 3 : gap === 2 ? 1 : 0) +
    (high === 14 ? 3 : 0)
  );
}
const combinations = [];
for (let a = 0; a < 52; a++)
  for (let b = a + 1; b < 52; b++)
    combinations.push(
      startingValue([a, b].map((v) => ({ rank: (v % 13) + 2, suit: Math.floor(v / 13) }))),
    );
combinations.sort((a, b) => a - b);
const percentiles = new Map();
export function startingPercentile(hole) {
  const [high, low] = hole.map((c) => c.rank).sort((a, b) => b - a);
  const key = `${high}:${low}:${hole[0].suit === hole[1].suit}`;
  if (!percentiles.has(key)) {
    const value = startingValue(hole);
    let lo = 0,
      hi = combinations.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (combinations[mid] <= value) lo = mid + 1;
      else hi = mid;
    }
    percentiles.set(key, (combinations.length - lo) / combinations.length);
  }
  return percentiles.get(key);
}
