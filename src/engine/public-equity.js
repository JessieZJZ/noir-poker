import { publicComboWeight } from './public-ranges.js';
import { hasPublicStory } from './public-story.js';

// Exact only for a genuine heads-up river with multi-street public evidence.
// It cannot learn which candidate is the actual hidden hand.
export function exactStoryRiver(
  view,
  descriptor,
  pots,
  { deck, evaluate, features, compare, cache = new Map() },
) {
  if (view.street !== 3 || view.rivals !== 1 || !hasPublicStory(descriptor?.postflopLine))
    return null;
  const known = new Set([...view.hole, ...view.board].map((c) => c.key));
  const available = deck.filter((c) => !known.has(c.key));
  const data = (h, b) => publicHandData(h, b, { evaluate, features, cache });
  const own = data(view.hole, view.board).score;
  let total = 0,
    wins = 0,
    ties = 0,
    combinations = 0;
  for (let a = 0; a < available.length; a++)
    for (let b = a + 1; b < available.length; b++) {
      const hole = [available[a], available[b]],
        facts = data(hole, view.board);
      const weight = publicComboWeight(hole, descriptor, {
        board: descriptor.board,
        ...data(hole, descriptor.board),
        compare,
        handData: data,
      });
      const result = compare(own, facts.score);
      total += weight;
      if (result > 0) wins += weight;
      else if (result === 0) ties += weight;
      combinations++;
    }
  const share = total ? (wins + ties / 2) / total : 0;
  const contestable = pots.reduce((sum, p) => sum + p.amount, 0);
  return {
    equity: contestable
      ? pots.reduce(
          (sum, p) => sum + p.amount * (p.eligible.includes(descriptor.id) ? share : 1),
          0,
        ) / contestable
      : 0,
    winProbability: total ? wins / total : 0,
    tieProbability: total ? ties / total : 0,
    lossProbability: total ? 1 - (wins + ties) / total : 0,
    samples: 0,
    enumeratedCombos: combinations,
    exact: true,
    rangeModel: 'public-street-lines-v1',
  };
}

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
// Same keys as map/join, built without intermediate arrays: rollouts look up
// hundreds of thousands of pairs.
const cardsKey = (cards) => {
  let key = cards.length ? cards[0].key : '';
  for (let i = 1; i < cards.length; i++) key += '|' + cards[i].key;
  return key;
};
export function publicHandData(hole, board, { evaluate, features, cache = new Map() }) {
  const boardKey = cardsKey(board);
  let pairs = cache.get(boardKey);
  if (!pairs) cache.set(boardKey, (pairs = new Map()));
  // Scores and features do not depend on hole-card order. Reversed sampled
  // pairs share the same pure facts, without caching a range or a decision.
  const pairKey =
    hole.length === 2 && hole[0].key > hole[1].key
      ? hole[1].key + '|' + hole[0].key
      : cardsKey(hole);
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
    publicStyle: descriptor.publicStyle,
    publicAxes: descriptor.publicAxes ? [...descriptor.publicAxes] : undefined,
    publicRead: descriptor.publicRead ? { ...descriptor.publicRead } : undefined,
    rangeObservation: descriptor.rangeObservation ? { ...descriptor.rangeObservation } : undefined,
    committedCount: descriptor.committedCount,
    seatedCount: descriptor.seatedCount,
    opponentCount: descriptor.opponentCount,
    waitingCount: descriptor.waitingCount,
    preflop: descriptor.preflop ? { ...descriptor.preflop } : undefined,
    postflop: descriptor.postflop ? { ...descriptor.postflop } : undefined,
    postflopLine: descriptor.postflopLine?.map((a) => ({
      ...a,
      board: a.board.map((card) => ({ ...card })),
    })),
  };
  const board = (descriptor.board || []).map((card) => ({ ...card })),
    boardScore = board.length === 5 ? publicHandData([], board, { evaluate, cache }).score : null,
    weightOf = (pair) => {
      const data =
        board.length >= 3 ? publicHandData(pair, board, { evaluate, features, cache }) : {};
      return publicComboWeight(pair, range, {
        board,
        ...data,
        boardScore,
        compare,
        handData: (hole, earlierBoard) =>
          publicHandData(hole, earlierBoard, { evaluate, features, cache }),
      });
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
  let cumulative;
  let storyCdf;
  return ({ random, stats = {}, available = pool }) => {
    if (hasPublicStory(range.postflopLine)) {
      if (!storyCdf) {
        let total = 0;
        const pairs = [];
        for (let a = 0; a < pool.length - 1; a++)
          for (let b = a + 1; b < pool.length; b++) {
            const pair = [pool[a], pool[b]],
              weight = weightOf(pair);
            if (weight > 0) {
              total += weight;
              pairs.push({ pair, weight, cumulative: total });
            }
          }
        if (!total) throw Error('公开范围没有可用底牌组合。');
        storyCdf = { pairs, total };
        stats.storyCdfBuilds = (stats.storyCdfBuilds || 0) + 1;
      }
      const allowed = new Set(available.map((c) => c.key));
      for (let attempt = 0; attempt < 24; attempt++) {
        stats.proposals = (stats.proposals || 0) + 1;
        const target = random() * storyCdf.total;
        const picked = (storyCdf.pairs.find((p) => target < p.cumulative) || storyCdf.pairs.at(-1))
          .pair;
        if (picked.every((c) => allowed.has(c.key))) return picked;
      }
      stats.cdfFallbacks = (stats.cdfFallbacks || 0) + 1;
      const valid = storyCdf.pairs.filter((p) => p.pair.every((c) => allowed.has(c.key)));
      let target = random() * valid.reduce((sum, p) => sum + p.weight, 0);
      const picked = valid.find((p) => (target -= p.weight) < 0) || valid.at(-1);
      if (!picked) throw Error('公开范围没有可用底牌组合。');
      return picked.pair;
    }
    for (let attempt = 0; attempt < 24; attempt++) {
      stats.proposals = (stats.proposals || 0) + 1;
      const { pair, weight: priorWeight } = drawPrior(random),
        conditional = weightOf(pair) / priorWeight;
      if (conditional >= 1 || random() < conditional) return pair;
    }
    stats.cdfFallbacks = (stats.cdfFallbacks || 0) + 1;
    // A factory owns one immutable range and pool. Reuse only this local CDF;
    // the shared cross-view cache above continues to contain card facts only.
    if (!cumulative) {
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
      cumulative = { pairs, total };
    }
    const { pairs, total } = cumulative;
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
    // A waiting seat contests only the layers already paid. Keep the full-field
    // estimate for betting decisions, but price a call against actual exposed
    // contributions on every street. A check is not a commitment to match the
    // next bet; treating it as one invents opponents in the new wager's layer.
    // No new chips, hands, scores or random samples are introduced here.
    pricePots =
      view.legal?.callAmount > 0 &&
      view.history.some((a) => a.street === view.street && a.action === 'raise') &&
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
  const storySamplers = new Map(
    selected
      .filter((r) => hasPublicStory(r.postflopLine))
      .map((range, index) => [
        range.id,
        range === selected[0]
          ? firstSampler
          : createPublicPairSampler(available, range, { evaluate, features, compare, cache }),
      ]),
  );
  const exact =
    selected.length === 1
      ? exactStoryRiver(view, selected[0], pots, { deck, evaluate, features, compare, cache })
      : null;
  if (exact)
    return {
      ...exact,
      rangeInputsVersion: 'complete-public-weight-inputs-v1',
      potEquity: exact.equity,
      model: 'public-action-ranges',
      assumedOpponentIds: [...assumed],
      proposals: 0,
      cdfFallbacks: 0,
    };
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
          : storySamplers.has(range.id)
            ? storySamplers.get(range.id)({ random, stats, available: pool })
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
    rangeInputsVersion: 'complete-public-weight-inputs-v1',
    potEquity: equity,
    ...(priceContestable ? { priceEquity: priceShare / trials / priceContestable } : {}),
    winProbability: wins / trials,
    tieProbability: ties / trials,
    lossProbability: 1 - (wins + ties) / trials,
    samples: trials,
    model: 'public-action-ranges',
    ...(storySamplers.size ? { rangeModel: 'public-street-lines-v1' } : {}),
    assumedOpponentIds: [...assumed],
    ...stats,
  };
}
