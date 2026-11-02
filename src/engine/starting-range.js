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
// The class depends only on two ranks and suitedness. Build its exact existing
// heuristic once; rollout policies must not sort/allocate strings per lookup.
const percentiles = new Float64Array(450);
for (let high = 2; high <= 14; high++)
  for (let low = 2; low <= high; low++)
    for (let suited = 0; suited < 2; suited++) {
      const value = startingValue([
        { rank: high, suit: 0 },
        { rank: low, suit: suited ? 0 : 1 },
      ]);
      let lo = 0,
        hi = combinations.length;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (combinations[mid] <= value) lo = mid + 1;
        else hi = mid;
      }
      percentiles[high * 30 + low * 2 + suited] = (combinations.length - lo) / combinations.length;
    }
export function startingPercentile(hole) {
  const a = hole[0].rank,
    b = hole[1].rank;
  return percentiles[
    Math.max(a, b) * 30 + Math.min(a, b) * 2 + (hole[0].suit === hole[1].suit ? 1 : 0)
  ];
}
