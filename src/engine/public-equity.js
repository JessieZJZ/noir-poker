import { publicComboWeight } from './public-ranges.js';

// Rank/suited classes have at most 169 entries. Exact available-card counts
// preserve blockers without evaluating or enumerating 1,326 physical pairs.
function priorPairSampler(pool, descriptor) {
  const ranks = new Map();
  for (const card of pool) {
    if (!ranks.has(card.rank)) ranks.set(card.rank, []);
    ranks.get(card.rank).push(card);
  }
  const classes = [];
  let total = 0;
  for (let high = 2; high <= 14; high++) {
    const highCards = ranks.get(high) || [];
    if (!highCards.length) continue;
    for (let low = 2; low <= high; low++) {
      const lowCards = ranks.get(low) || [];
      if (!lowCards.length) continue;
      for (const suited of high === low ? [false] : [true, false]) {
        const common = highCards.filter((card) =>
            lowCards.some((other) => other.suit === card.suit),
          ),
          quantity =
            high === low
              ? (highCards.length * (highCards.length - 1)) / 2
              : suited
                ? common.length
                : highCards.length * lowCards.length - common.length;
        if (!quantity) continue;
        const weight =
          descriptor.allIn && descriptor.street > 0
            ? 1
            : publicComboWeight(
                [
                  { rank: high, suit: 0 },
                  { rank: low, suit: suited ? 0 : 1 },
                ],
                descriptor,
                { board: [] },
              );
        total += quantity * weight;
        classes.push({
          highCards,
          lowCards,
          common,
          suited,
          weight,
          cumulative: total,
          pair: high === low,
        });
      }
    }
  }
  if (!total) throw Error('公开范围没有可用底牌组合。');
  return (random) => {
    const target = random() * total,
      selected = classes.find((entry) => target < entry.cumulative) || classes.at(-1);
    let pair;
    if (selected.pair) {
      const a = Math.min(
        selected.highCards.length - 1,
        Math.floor(random() * selected.highCards.length),
      );
      let b = Math.min(
        selected.highCards.length - 2,
        Math.floor(random() * (selected.highCards.length - 1)),
      );
      if (b >= a) b++;
      pair = [selected.highCards[a], selected.highCards[b]];
    } else if (selected.suited) {
      const high =
        selected.common[
          Math.min(selected.common.length - 1, Math.floor(random() * selected.common.length))
        ];
      pair = [high, selected.lowCards.find((card) => card.suit === high.suit)];
    } else {
      const quantities = selected.highCards.map(
          (card) => selected.lowCards.filter((other) => other.suit !== card.suit).length,
        ),
        quantity = quantities.reduce((sum, count) => sum + count, 0);
      let target = random() * quantity;
      const high =
          selected.highCards.find((_, index) => (target -= quantities[index]) < 0) ||
          selected.highCards.at(-1),
        lowCards = selected.lowCards.filter((card) => card.suit !== high.suit);
      pair = [
        high,
        lowCards[Math.min(lowCards.length - 1, Math.floor(random() * lowCards.length))],
      ];
    }
    return { pair, weight: selected.weight };
  };
}

// The shared cache stores only pure scores/features of a board and candidate pair.
export function publicHandData(hole, board, { evaluate, features, cache = new Map() }) {
  const boardKey = board.map((c) => c.key).join('|');
  let pairs = cache.get(boardKey);
  if (!pairs) cache.set(boardKey, (pairs = new Map()));
  const pairKey = hole.map((c) => c.key).join('|');
  let data = pairs.get(pairKey);
  if (!data) {
    data = { score: evaluate([...hole, ...board]).score };
    pairs.set(pairKey, data);
  }
  if (features && hole.length === 2 && board.length >= 3)
    data.features ??= features(hole, board, data.score);
  return data;
}

// Rejection proposals and the exact weighted-CDF fallback target the same
// conditional distribution. A bounded rejection loop never silently changes
// a narrow public range into uniform cards. Only cards in pool can be selected.
export function createPublicPairSampler(
  initialPool,
  descriptor,
  { evaluate, features, compare, cache = new Map() },
) {
  const pool = [...initialPool];
  if (pool.length < 2) throw Error('公开未知牌不足以抽取底牌。');
  // Capture this public range's weight inputs, never decisions, sampled hands
  // or random state. A different view prepares its own independent factory.
  const range = {
    allIn: descriptor.allIn,
    street: descriptor.street,
    role: descriptor.role,
    line: descriptor.line,
    depthBB: descriptor.depthBB,
    position: descriptor.position,
    aggressionRatio: descriptor.aggressionRatio,
    preflop: descriptor.preflop ? { ...descriptor.preflop } : undefined,
    postflop: descriptor.postflop ? { ...descriptor.postflop } : undefined,
  };
  const board = (descriptor.board || []).map((card) => ({ ...card })),
    boardScore = board.length === 5 ? publicHandData([], board, { evaluate, cache }).score : null,
    weightOf = (pair) => {
      const data =
        board.length >= 3 ? publicHandData(pair, board, { evaluate, features, cache }) : {};
      return publicComboWeight(pair, range, { board, ...data, boardScore, compare });
    };
  const drawPrior =
    range.allIn && range.street > 0
      ? (random) => {
          const a = Math.min(pool.length - 1, Math.floor(random() * pool.length));
          let b = Math.min(pool.length - 2, Math.floor(random() * (pool.length - 1)));
          if (b >= a) b++;
          return { pair: [pool[a], pool[b]], weight: 1 };
        }
      : priorPairSampler(pool, range);
  return ({ random, stats = {} }) => {
    for (let attempt = 0; attempt < 24; attempt++) {
      stats.proposals = (stats.proposals || 0) + 1;
      const { pair, weight: priorWeight } = drawPrior(random),
        conditional = weightOf(pair) / priorWeight;
      if (conditional >= 1 || random() < conditional) return pair;
    }
    stats.cdfFallbacks = (stats.cdfFallbacks || 0) + 1;
    const pairs = [];
    let total = 0;
    for (let a = 0; a < pool.length - 1; a++)
      for (let b = a + 1; b < pool.length; b++) {
        const pair = [pool[a], pool[b]],
          weight = weightOf(pair);
        if (weight > 0) {
          total += weight;
          pairs.push({ pair, cumulative: total });
        }
      }
    if (!total) throw Error('公开范围没有可用底牌组合。');
    const target = random() * total;
    return (pairs.find((entry) => target < entry.cumulative) || pairs.at(-1)).pair;
  };
}

export function samplePublicPair(
  pool,
  descriptor,
  { random, evaluate, features, compare, cache, stats },
) {
  return createPublicPairSampler(pool, descriptor, { evaluate, features, compare, cache })({
    random,
    stats,
  });
}

export function estimatePublicEquity(
  view,
  ranges,
  { deck, evaluate, compare, features, trials, random, cache = new Map() },
) {
  if (!Number.isInteger(trials) || trials < 1) throw Error('权益抽样次数必须为正整数。');
  const known = new Set([...view.hole, ...view.board].map((c) => c.key)),
    available = deck.filter((c) => !known.has(c.key)),
    voluntary = ranges.filter((range) => view.street > 0 || range.preflop.action || range.allIn),
    entered = ranges.filter((range) => voluntary.includes(range) || range.actualAllIn),
    // Before anybody enters, estimate one future caller rather than assuming
    // every unacted seat will see a showdown. Their response risk stays separate.
    futureCaller = voluntary.length
      ? null
      : ranges.find(
          (range) =>
            !range.actualAllIn &&
            !entered.includes(range) &&
            (!view.equityPots || view.equityPots.some((pot) => pot.eligible.includes(range.id))),
        ),
    selected = [...entered, ...(futureCaller ? [futureCaller] : [])],
    assumed = new Set(selected.map((range) => range.id)),
    pots = (
      view.equityPots ||
      view.callPots || [
        { amount: view.contestable || view.pot || 1, eligible: [view.id, ...assumed] },
      ]
    )
      .filter((pot) => pot.eligible.includes(view.id))
      .map((pot) => ({
        ...pot,
        eligible: pot.eligible.filter((id) => id === view.id || assumed.has(id)),
      })),
    contestable = pots.reduce((sum, pot) => sum + pot.amount, 0),
    // A limper who has not matched a later raise contests only the layers
    // already paid. The full-field estimate above remains useful, but cannot
    // price a current preflop call as though every limper covered every layer.
    // No new chips, hands, scores or random samples are introduced here.
    pricePots =
      view.street === 0 &&
      view.legal?.callAmount > 0 &&
      view.history.some((a) => a.street === 0 && a.action === 'raise') &&
      view.callPots
        ? view.callPots.map((pot) => ({
            ...pot,
            eligible: pot.eligible.filter((id) => id === view.id || assumed.has(id)),
          }))
        : null,
    priceContestable = pricePots?.reduce((sum, pot) => sum + pot.amount, 0),
    stats = { proposals: 0, cdfFallbacks: 0 };
  // Only the first seat sees the same full available pool on every trial.
  // Later seats keep preparing against the cards left by prior sampled seats.
  const firstSampler = selected.length
    ? createPublicPairSampler(available, selected[0], { evaluate, features, compare, cache })
    : null;
  let share = 0,
    priceShare = 0,
    wins = 0,
    ties = 0;
  for (let trial = 0; trial < trials; trial++) {
    const pool = [...available],
      hands = new Map();
    for (const [index, range] of selected.entries()) {
      const pair =
        index === 0
          ? firstSampler({ random, stats })
          : samplePublicPair(pool, range, {
              random,
              evaluate,
              features,
              compare,
              cache,
              stats,
            });
      hands.set(range.id, pair);
      for (const card of pair)
        pool.splice(
          pool.findIndex((candidate) => candidate.key === card.key),
          1,
        );
    }
    const community = [...view.board];
    while (community.length < 5) {
      const index = Math.min(pool.length - 1, Math.floor(random() * pool.length));
      community.push(pool.splice(index, 1)[0]);
    }
    const own = publicHandData(view.hole, community, { evaluate, cache }).score,
      scores = new Map(
        [...hands].map(([id, pair]) => [
          id,
          publicHandData(pair, community, { evaluate, cache }).score,
        ]),
      );
    const comparisons = [...scores.values()].map((score) => compare(own, score));
    if (comparisons.every((comparison) => comparison > 0)) wins++;
    else if (comparisons.every((comparison) => comparison >= 0)) ties++;
    for (const pot of pots) {
      const comparisons = pot.eligible
        .filter((id) => id !== view.id)
        .map((id) => compare(own, scores.get(id)));
      if (comparisons.every((comparison) => comparison >= 0))
        share += pot.amount / (1 + comparisons.filter((comparison) => comparison === 0).length);
    }
    for (const pot of pricePots || []) {
      const comparisons = pot.eligible
        .filter((id) => id !== view.id)
        .map((id) => compare(own, scores.get(id)));
      if (comparisons.every((comparison) => comparison >= 0))
        priceShare +=
          pot.amount / (1 + comparisons.filter((comparison) => comparison === 0).length);
    }
  }
  const equity = contestable ? share / trials / contestable : 0;
  return {
    equity,
    potEquity: equity,
    ...(priceContestable ? { priceEquity: priceShare / trials / priceContestable } : {}),
    winProbability: wins / trials,
    tieProbability: ties / trials,
    lossProbability: 1 - (wins + ties) / trials,
    samples: trials,
    model: 'public-action-ranges',
    assumedOpponentIds: [...assumed],
    ...stats,
  };
}
