// Historical five-card subset oracle, kept only in tests for equivalence checks.
import { compare, RANK_NAMES } from '../../src/engine/poker.js';
function evaluateFive(cards) {
  const ranks = [cards[0].rank, cards[1].rank, cards[2].rank, cards[3].rank, cards[4].rank].sort(
    (a, b) => b - a,
  );
  const groups = [];
  for (let i = 0; i < 5;) {
    let j = i + 1;
    while (j < 5 && ranks[j] === ranks[i]) j++;
    groups.push([ranks[i], j - i]);
    i = j;
  }
  const suit = cards[0].suit,
    flush =
      cards[1].suit === suit &&
      cards[2].suit === suit &&
      cards[3].suit === suit &&
      cards[4].suit === suit;
  let straight = groups.length === 5 && ranks[0] - ranks[4] === 4 ? ranks[0] : 0;
  if (groups.length === 5 && ranks[0] === 14 && ranks[1] === 5) straight = 5;
  groups.sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  if (flush && straight) return [8, straight];
  if (groups[0][1] === 4) return [7, groups[0][0], groups[1][0]];
  if (groups[0][1] === 3 && groups[1][1] === 2) return [6, groups[0][0], groups[1][0]];
  if (flush) return [5, ...ranks];
  if (straight) return [4, straight];
  if (groups[0][1] === 3) return [3, groups[0][0], ...groups.slice(1).map((g) => g[0])];
  if (groups[0][1] === 2 && groups[1][1] === 2)
    return [
      2,
      Math.max(groups[0][0], groups[1][0]),
      Math.min(groups[0][0], groups[1][0]),
      groups[2][0],
    ];
  if (groups[0][1] === 2) return [1, groups[0][0], ...groups.slice(1).map((g) => g[0])];
  return [0, ...ranks];
}
export function legacyEvaluate(cards) {
  if (cards.length < 5) {
    const ranks = cards.map((c) => c.rank).sort((a, b) => b - a);
    return {
      score: [ranks.length === 2 && ranks[0] === ranks[1] ? 1 : 0, ...ranks],
      label: ranks.length === 2 && ranks[0] === ranks[1] ? '口袋对子' : '高牌',
      cards,
    };
  }
  let best = null,
    bestCards = [];
  for (let a = 0; a < cards.length - 4; a++)
    for (let b = a + 1; b < cards.length - 3; b++)
      for (let c = b + 1; c < cards.length - 2; c++)
        for (let d = c + 1; d < cards.length - 1; d++)
          for (let e = d + 1; e < cards.length; e++) {
            const picked = [cards[a], cards[b], cards[c], cards[d], cards[e]],
              score = evaluateFive(picked);
            if (!best || compare(score, best) > 0) {
              best = score;
              bestCards = picked;
            }
          }
  return {
    score: best,
    label: best[0] === 8 && best[1] === 14 ? '皇家同花顺' : RANK_NAMES[best[0]],
    cards: bestCards,
  };
}
