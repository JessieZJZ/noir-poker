import { chipUnitOf, fractionRaiseTo, legalRaiseTo } from './bet-sizing.js';
import { bigBlindOf } from './stakes.js';
import { preparePublicRanges, publicComboWeight } from './public-ranges.js';
import { publicHandData } from './public-equity.js';
import { handFeatures } from './hand-features.js';
import { sanitizePublicRead, observedResponseShift } from './public-observations.js';

const VERSION = 'public-strategy-v1';
const FRACTIONS = [0.25, 0.5, 0.75, 1, 1.5];
const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const card = ({ rank, suit }) => ({ rank, suit, key: `${suit}-${rank}` });
const overlap = (a, b) => a.some((c) => b.some((d) => c.key === d.key));
const share = (comparison) => (comparison > 0 ? 1 : comparison < 0 ? 0 : 0.5);
const resultCaches = new WeakMap();
const cloneResult = (value) =>
  typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));

function seededRandom(text) {
  let seed = 2166136261;
  for (let i = 0; i < text.length; i++) seed = Math.imul(seed ^ text.charCodeAt(i), 16777619);
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let next = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    next ^= next + Math.imul(next ^ (next >>> 7), 61 | next);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

// Whitelist the before-action public ledger. In particular, neither a supplied
// player.hole, a future deck, a previous assessment nor the final result is read.
function publicView(view) {
  const id = view.id ?? 0;
  const seat = (p) => ({
    id: p.id,
    position: p.position ?? null,
    botProfile: p.botProfile,
    publicAxes: Array.isArray(p.publicAxes) ? p.publicAxes.map(Number) : null,
    publicRead: sanitizePublicRead(p.publicRead),
    stack: p.stack ?? 0,
    bet: p.bet ?? 0,
    total: p.total ?? p.bet ?? 0,
    allin: p.allin === true,
    folded: p.folded === true,
    out: p.out === true,
  });
  const opponents = (view.players || view.opponents || [])
    .filter((p) => p.id !== id && !p.folded && !p.out)
    .map(seat)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
  return {
    id,
    botProfile: view.botProfile,
    publicAxes: Array.isArray(view.publicAxes) ? view.publicAxes.map(Number) : null,
    publicRead: sanitizePublicRead(view.publicRead),
    hole: view.hole.map(card),
    board: view.board.map(card),
    street: view.street,
    position: view.position ?? view.players?.find((p) => p.id === id)?.position ?? null,
    stack: view.stack ?? view.players?.find((p) => p.id === id)?.stack ?? 0,
    bet: view.bet ?? view.players?.find((p) => p.id === id)?.bet ?? 0,
    total: view.total ?? view.players?.find((p) => p.id === id)?.total ?? view.bet ?? 0,
    pot: view.pot ?? 0,
    currentBet: view.currentBet ?? 0,
    count: view.count ?? opponents.length + 1,
    bigBlind: bigBlindOf(view),
    chipUnit: chipUnitOf(view),
    opponents,
    history: (view.history || [])
      .filter((a) => a.street <= view.street)
      .map(({ id, street, action, amount }) => ({ id, street, action, amount: amount ?? 0 })),
    legal: {
      chipUnit: chipUnitOf(view.legal || view),
      canRaise: view.legal?.canRaise === true,
      canCheck: view.legal?.canCheck === true,
      callAmount: view.legal?.callAmount ?? 0,
      minRaiseTo: view.legal?.minRaiseTo ?? 0,
      maxRaiseTo: view.legal?.maxRaiseTo ?? 0,
    },
    callPrice: view.callPrice
      ? { cost: view.callPrice.cost, contestable: view.callPrice.contestable }
      : null,
    callPots: (view.callPots || view.equityPots || []).map(({ amount, eligible }) => ({
      amount,
      eligible: [...eligible],
    })),
  };
}

function signature(view, includeHole) {
  const blind = view.bigBlind;
  const amount = (n) => n / blind;
  return JSON.stringify({
    id: view.id,
    botProfile: view.botProfile,
    publicAxes: view.publicAxes,
    publicRead: view.publicRead,
    hole: includeHole ? view.hole.map((c) => c.key) : undefined,
    board: view.board.map((c) => c.key),
    street: view.street,
    position: view.position,
    count: view.count,
    stack: amount(view.stack),
    bet: amount(view.bet),
    total: amount(view.total),
    pot: amount(view.pot),
    currentBet: amount(view.currentBet),
    chipUnit: amount(view.chipUnit),
    opponents: view.opponents.map((p) => ({
      ...p,
      stack: amount(p.stack),
      bet: amount(p.bet),
      total: amount(p.total),
    })),
    history: view.history.map((a) => ({ ...a, amount: amount(a.amount) })),
    legal: {
      ...view.legal,
      chipUnit: amount(view.legal.chipUnit),
      callAmount: amount(view.legal.callAmount),
      minRaiseTo: amount(view.legal.minRaiseTo),
      maxRaiseTo: amount(view.legal.maxRaiseTo),
    },
    callPrice: view.callPrice
      ? {
          cost: amount(view.callPrice.cost),
          contestable: amount(view.callPrice.contestable),
        }
      : null,
    callPots: view.callPots.map((p) => ({ ...p, amount: amount(p.amount) })),
  });
}

function drawFacts(hole, board, score, facts) {
  const known = [...hole, ...board];
  const suit = facts.flushDraw
    ? [0, 1, 2, 3].find((s) => known.filter((c) => c.suit === s).length === 4)
    : undefined;
  const highestOffBoard =
    suit === undefined
      ? 0
      : Math.max(
          ...Array.from({ length: 13 }, (_, i) => i + 2).filter(
            (rank) => !board.some((c) => c.suit === suit && c.rank === rank),
          ),
        );
  const nutFlushDraw =
    suit !== undefined && hole.some((c) => c.suit === suit && c.rank === highestOffBoard);
  const flushOuts = suit === undefined ? 0 : 13 - known.filter((c) => c.suit === suit).length;
  return {
    flushDraw: facts.flushDraw === true,
    nutFlushDraw,
    straightDraw: facts.straightOuts > 0,
    comboDraw: facts.flushDraw === true && facts.straightOuts > 0,
    pairedBoard: facts.pairedBoard === true,
    improvementOuts: facts.drawOuts || 0,
    nutOuts: nutFlushDraw ? flushOuts : 0,
    nutOutsMeaning: 'highest-flush-completions',
    flushRankNutsOnly: nutFlushDraw,
    madeCategory: score[0],
  };
}

function candidatePairs(pool, count, random) {
  const candidates = [],
    seen = new Set();
  const limit = Math.min(count, (pool.length * (pool.length - 1)) / 2);
  // A bounded uniform proposal set, then normalised public action weights.
  for (let attempt = 0; candidates.length < limit && attempt < limit * 12; attempt++) {
    const a = Math.floor(random() * pool.length);
    let b = Math.floor(random() * (pool.length - 1));
    if (b >= a) b++;
    const key = a < b ? `${a}:${b}` : `${b}:${a}`;
    if (!seen.has(key)) {
      seen.add(key);
      candidates.push(a < b ? [pool[a], pool[b]] : [pool[b], pool[a]]);
    }
  }
  return candidates;
}

function weightedTable(pairs, descriptor, context, board) {
  const actionBoard = descriptor.board || [];
  const boardScore = actionBoard.length === 5 ? context.data([], actionBoard).score : null;
  const entries = pairs
    .map((pair) => {
      const data = context.data(pair, board);
      return {
        pair,
        ...data,
        features: data.features || context.features(pair, board, data.score),
        weight: publicComboWeight(pair, descriptor, {
          board: actionBoard,
          ...context.data(pair, actionBoard),
          boardScore,
          compare: context.compare,
          handData: context.data,
        }),
      };
    })
    .filter((entry) => entry.weight > 0);
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
  return { entries, total };
}

function pick(table, random, excluded = []) {
  const entries = excluded.length
    ? table.entries.filter((entry) => !overlap(entry.pair, excluded))
    : table.entries;
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
  let target = random() * total;
  return entries.find((entry) => (target -= entry.weight) < 0) || entries.at(-1);
}

function runout(board, pool, excluded, random) {
  const available = pool.filter((c) => !excluded.some((d) => c.key === d.key));
  const result = [...board];
  while (result.length < 5 && available.length) {
    const index = Math.floor(random() * available.length);
    result.push(available.splice(index, 1)[0]);
  }
  return result;
}

function topMass(actor, opponents, compare, board) {
  if (board.length < 3 || !opponents.length)
    return {
      actorTopMass: null,
      opponentTopMass: null,
      topThresholdQuantile: 0.85,
      topThresholdScore: null,
    };
  const pooled = [actor, ...opponents]
    .flatMap((table) =>
      table.entries.map((entry) => ({
        score: entry.score,
        weight: entry.weight / table.total / (opponents.length + 1),
      })),
    )
    .sort((a, b) => compare(a.score, b.score));
  let cumulative = 0;
  const threshold =
    pooled.find((entry) => (cumulative += entry.weight) >= 0.85)?.score || pooled.at(-1).score;
  const mass = (table) =>
    table.entries.reduce(
      (sum, entry) => sum + (compare(entry.score, threshold) >= 0 ? entry.weight : 0),
      0,
    ) / table.total;
  return {
    actorTopMass: mass(actor),
    opponentTopMass: opponents.reduce((sum, table) => sum + mass(table), 0) / opponents.length,
    topThresholdQuantile: 0.85,
    topThresholdScore: [...threshold],
  };
}

function compareRanges(actor, opponents, board, pool, context, samples, random) {
  let equity = 0,
    comparisons = 0;
  for (let t = 0; t < samples; t++) {
    for (const table of opponents) {
      let own, other;
      for (let attempt = 0; attempt < 24; attempt++) {
        own = pick(actor, random);
        other = pick(table, random);
        if (!overlap(own.pair, other.pair)) break;
      }
      if (overlap(own.pair, other.pair)) continue;
      const community = runout(board, pool, [...own.pair, ...other.pair], random);
      equity += share(
        context.compare(
          context.data(own.pair, community).score,
          context.data(other.pair, community).score,
        ),
      );
      comparisons++;
    }
  }
  const actorEquity = comparisons ? equity / comparisons : 0.5;
  return {
    actorEquity,
    advantage: actorEquity - 0.5,
    samples,
    comparisons,
    actorSamples: actor.entries.length,
    opponentSamples: opponents.map((table) => table.entries.length),
    // Keep uncertainty conservative across correlated opponent range priors;
    // this bound covers Monte Carlo variation, not candidate or prior error.
    uncertainty: comparisons ? Math.min(0.5, Math.sqrt(Math.log(40) / (2 * samples))) : 0.5,
    method: 'sampled-public-ranges',
    ...topMass(actor, opponents, context.compare, board),
  };
}

function opponentEvidence({ descriptor, table }, street, board) {
  const top = Math.max(0, ...board.map((c) => c.rank));
  const mass = (test) =>
    table.entries.reduce((sum, entry) => sum + (test(entry) ? entry.weight : 0), 0) / table.total;
  const topPair = (entry) =>
    entry.features.overpair || (entry.features.ownPair && entry.pair.some((c) => c.rank === top));
  const latest = descriptor.postflopLine?.at(-1);
  return {
    id: descriptor.id,
    currentStreetCheck: latest?.street === street && latest.action === 'check',
    checkedThroughStreets: [
      ...new Set(
        (descriptor.postflopLine || [])
          .filter((event) => event.checkedThrough)
          .map((event) => event.street),
      ),
    ],
    strongMadeMass: mass((entry) => entry.features.strongMade),
    topPairMass: mass(topPair),
    marginalMadeMass: mass(
      (entry) => entry.features.ownMade && !entry.features.strongMade && !topPair(entry),
    ),
    drawMass: mass((entry) => entry.features.draw),
    unmadeMass: mass((entry) => !entry.features.ownMade && !entry.features.draw),
    candidateCount: table.entries.length,
    // Draws may overlap made-hand classes. These masses are a bounded
    // authored posterior, not sightings of an opponent's private holding.
    method: 'public-action-candidate-mass',
  };
}

function strengthAgainst(entry, actor, compare) {
  return (
    actor.entries.reduce(
      (sum, other) => sum + share(compare(entry.score, other.score)) * other.weight,
      0,
    ) / actor.total
  );
}

function sharesPot(view, id) {
  return (
    !view.callPots.length ||
    view.callPots.some((p) => p.eligible.includes(view.id) && p.eligible.includes(id))
  );
}

function responses(entry, opponent, descriptor, amount, view, actor, context) {
  if (opponent.allin || opponent.stack <= 0) return { fold: 0, call: 1, raise: 0, pay: 0 };
  const pay = Math.min(opponent.stack, Math.max(0, amount - opponent.bet));
  if (!pay) return { fold: 0, call: 1, raise: 0, pay: 0 };
  const strength = entry.publicStrength;
  const facts = entry.features;
  const draw = entry.drawFacts;
  const price = pay / Math.max(view.chipUnit, view.pot + Math.max(0, amount - view.bet) + pay);
  const size = pay / Math.max(view.bigBlind, view.pot);
  const aggressiveLine = descriptor.postflopLine?.some((a) =>
    ['bet', 'raise', 'check-raise'].includes(a.action),
  );
  const support =
    0.07 +
    strength * 0.62 +
    (facts.ownMade ? 0.035 : 0) +
    (facts.draw ? 0.08 : 0) +
    (draw.nutFlushDraw ? 0.035 : 0) +
    (aggressiveLine ? 0.025 : 0);
  let continuation = clamp(
    1 /
      (1 +
        Math.exp(
          (price + Math.log1p(size) * 0.11 - support) * 9 -
            observedResponseShift(descriptor.publicRead),
        )),
    0.025,
    0.97,
  );
  // Preserve strong paying hands; a larger wager cannot manufacture callers.
  if (strength >= 0.9 && facts.ownMade)
    continuation = Math.max(continuation, clamp(0.93 - Math.log1p(size) * 0.1, 0.65, 0.93));
  const raiseShare = clamp(
    (0.015 +
      (strength >= 0.9 && facts.strongMade ? 0.24 : 0) +
      (facts.draw && strength >= 0.4 ? 0.055 : 0)) /
      (1 + size * 0.35),
    0,
    0.3,
  );
  const canRaise = opponent.stack > pay && view.stack > Math.max(0, amount - view.bet);
  const raise = canRaise ? continuation * raiseShare : 0;
  return { fold: 1 - continuation, call: continuation - raise, raise, pay };
}

function responseSamples(view, tables, context, samples, pool, random) {
  return tables.map(({ opponent, descriptor, table }) => {
    const entries = [];
    for (let t = 0; t < samples; t++) {
      const entry = pick(table, random, view.hole);
      if (!entry) continue;
      const community = runout(view.board, pool, [...view.hole, ...entry.pair], random);
      entries.push({
        entry,
        outcome: share(
          context.compare(
            context.data(view.hole, community).score,
            context.data(entry.pair, community).score,
          ),
        ),
        worseMade: entry.features.ownMade && context.compare(context.own.score, entry.score) > 0,
        draw: entry.features.draw === true,
      });
    }
    return { opponent, descriptor, entries };
  });
}

function optionModel(fraction, amount, view, actor, sampled, context) {
  const extra = Math.max(0, amount - view.bet);
  const opponents = sampled.map(({ opponent, descriptor, entries }) => {
    let fold = 0,
      call = 0,
      raise = 0,
      calledShare = 0,
      worse = 0,
      draw = 0,
      contribution = 0;
    for (const trial of entries) {
      const response = responses(trial.entry, opponent, descriptor, amount, view, actor, context);
      fold += response.fold;
      call += response.call;
      raise += response.raise;
      calledShare += trial.outcome * response.call;
      if (trial.worseMade) worse += response.call;
      if (trial.draw) draw += response.call;
      contribution += response.pay * response.call;
    }
    const n = entries.length || 1;
    return {
      id: opponent.id,
      foldProbability: fold / n,
      callProbability: call / n,
      raiseProbability: raise / n,
      worseMadeCallMass: worse / n,
      drawCallMass: draw / n,
      calledEquity: call > 0 ? calledShare / call : 0,
      expectedCallContribution: contribution / n,
      samples: entries.length,
      actualAllIn: opponent.allin || opponent.stack <= 0,
    };
  });
  const foldProbability = opponents.length
    ? opponents.reduce((p, o) => p * o.foldProbability, 1)
    : 0;
  const raiseProbability = 1 - opponents.reduce((p, o) => p * (1 - o.raiseProbability), 1);
  const callProbability = Math.max(0, 1 - foldProbability - raiseProbability);
  const callCost = view.callPrice?.cost ?? view.legal.callAmount;
  const currentPots = view.callPots.length
    ? view.callPots.filter((p) => p.eligible.includes(view.id))
    : [{ amount: view.pot + callCost, eligible: [view.id, ...opponents.map((o) => o.id)] }];
  const afterCallPot = currentPots.reduce((sum, p) => sum + p.amount, 0);
  const pot = Math.max(0, afterCallPot - callCost);
  let calledShare = 0,
    calledValue = 0;
  // Integrate all no-raise fold/call subsets. A waiting opponent contributes
  // equity and chips only in the subsets where it calls. An eligible all-in
  // has zero fold mass and therefore appears in every nonzero subset.
  for (let mask = 1; mask < 2 ** opponents.length; mask++) {
    let probability = 1,
      added = 0,
      newWagerEquity = 1;
    const callers = [];
    for (let i = 0; i < opponents.length; i++) {
      const opponent = opponents[i];
      if (mask & (1 << i)) {
        probability *= opponent.callProbability;
        callers.push(opponent);
        const contribution =
          opponent.callProbability > 0
            ? opponent.expectedCallContribution / opponent.callProbability
            : 0;
        added += contribution;
        // An all-in hand can contest its already paid layers, but cannot win
        // a new wager between players who still have chips.
        if (contribution > 0) newWagerEquity *= opponent.calledEquity;
      } else probability *= opponent.foldProbability;
    }
    const currentShare = currentPots.reduce(
      (sum, p) =>
        sum +
        p.amount *
          callers.filter((o) => p.eligible.includes(o.id)).reduce((q, o) => q * o.calledEquity, 1),
      0,
    );
    calledShare += (probability * currentShare) / Math.max(view.chipUnit, afterCallPot);
    calledValue +=
      probability *
      (currentShare -
        callCost +
        newWagerEquity * added -
        (1 - newWagerEquity) * Math.max(0, extra - callCost));
  }
  const calledEquity = callProbability > 0 ? calledShare / callProbability : 0;
  const estimatedValue = foldProbability * pot + calledValue - raiseProbability * extra;
  const samples = Math.min(...opponents.map((o) => o.samples));
  return {
    fraction,
    amount,
    extra,
    foldProbability,
    callProbability,
    raiseProbability,
    calledEquity,
    worseMadeCallMass:
      opponents.reduce((sum, o) => sum + o.worseMadeCallMass, 0) / Math.max(1, opponents.length),
    drawCallMass:
      opponents.reduce((sum, o) => sum + o.drawCallMass, 0) / Math.max(1, opponents.length),
    estimatedValue,
    valueModel: 'heuristic-current-pot-with-raise-loss',
    samples,
    uncertainty: Math.min(
      0.5,
      Math.sqrt(Math.log(40) / (2 * Math.max(1, samples * callProbability))),
    ),
    opponents,
  };
}

function futurePayingRange(view, draw, sampled, context, pool, random, pairMining) {
  const known = [...view.hole, ...view.board];
  const suit = draw.flushDraw
    ? [0, 1, 2, 3].find((s) => known.filter((c) => c.suit === s).length === 4)
    : null;
  const improving = pool
    .filter((c) => !overlap([c], view.hole))
    .filter((c) => {
      if (pairMining) return c.rank === view.hole[0].rank;
      if (suit !== null && c.suit === suit) return true;
      if (!draw.straightDraw) return false;
      const data = context.data(view.hole, [...view.board, c]);
      return data.features.ownMade && [4, 8].includes(data.score[0]);
    });
  const futureStack = Math.max(0, view.stack - view.legal.callAmount);
  let pay = 0,
    reverse = 0,
    weight = 0,
    samples = 0;
  for (const { opponent, entries } of sampled) {
    if (opponent.allin || !sharesPot(view, opponent.id)) continue;
    const cap = Math.min(
      futureStack,
      Math.max(0, opponent.stack - Math.max(0, view.currentBet - opponent.bet)),
    );
    const n = Math.min(12, entries.length);
    if (!cap || !n) continue;
    for (let i = 0; i < n; i++) {
      const entry = entries[Math.floor((i * entries.length) / n)].entry;
      const outs = improving.filter((c) => !overlap([c], entry.pair));
      if (!outs.length) continue;
      const next = outs[Math.floor(random() * outs.length)];
      const board = [...view.board, next];
      if (pairMining) {
        const available = pool.filter((c) => !overlap([c], [...view.hole, ...entry.pair, next]));
        while (board.length < 3)
          board.push(available.splice(Math.floor(random() * available.length), 1)[0]);
      }
      const own = context.data(view.hole, board);
      const other = context.data(entry.pair, board);
      const facts = other.features;
      const comparison = context.compare(own.score, other.score);
      // Only worse hands can fund the improvement bonus. Better hands are a
      // reverse-implied risk, not an additional source of future payment.
      const willingness =
        comparison > 0 && facts.ownMade
          ? facts.strongMade
            ? 0.58
            : facts.overpair
              ? 0.36
              : facts.ownPair
                ? 0.24
                : 0.12
          : 0;
      pay += cap * willingness;
      reverse += cap * (comparison < 0 ? 1 : 0);
      weight += cap;
      samples++;
    }
  }
  return {
    frequency: weight ? pay / weight : 0,
    reverseRisk: weight ? reverse / weight : 0,
    samples,
  };
}

function impliedCall(view, draw, sampled, context, pool, random) {
  const amount = view.legal.callAmount;
  const cost = view.callPrice?.cost ?? amount;
  const contestable = view.callPrice?.contestable ?? view.pot + amount;
  const pairEquities = new Map(
    sampled.map((o) => [
      o.opponent.id,
      o.entries.length ? o.entries.reduce((sum, e) => sum + e.outcome, 0) / o.entries.length : 0.5,
    ]),
  );
  const equity = view.callPots.length
    ? view.callPots
        .filter((p) => p.eligible.includes(view.id))
        .reduce(
          (sum, p) =>
            sum +
            p.amount *
              p.eligible
                .filter((id) => id !== view.id)
                .reduce((q, id) => q * (pairEquities.get(id) ?? 0.5), 1),
          0,
        ) / Math.max(view.chipUnit, contestable)
    : [...pairEquities.values()].reduce((p, q) => p * q, 1);
  const pairMining = view.street === 0 && view.hole[0].rank === view.hole[1].rank;
  const remaining = 52 - view.board.length - 2;
  const improvementProbability = pairMining
    ? 1 -
      ((remaining - 2) * (remaining - 3) * (remaining - 4)) /
        (remaining * (remaining - 1) * (remaining - 2))
    : draw.improvementOuts > 0
      ? draw.improvementOuts / remaining
      : 0;
  const futureStack = Math.max(0, view.stack - amount);
  const eligibleOpponents = view.opponents.filter(
    (o) => !o.allin && o.stack > 0 && sharesPot(view, o.id),
  );
  const availableFuturePay = eligibleOpponents.reduce(
    (sum, o) =>
      sum + Math.min(futureStack, Math.max(0, o.stack - Math.max(0, view.currentBet - o.bet))),
    0,
  );
  const reason = !amount
    ? 'no-call'
    : view.street >= 3
      ? 'no-future-street'
      : !futureStack
        ? 'actor-all-in'
        : !eligibleOpponents.length || !availableFuturePay
          ? 'no-eligible-future-stack'
          : !improvementProbability
            ? 'no-draw-forecast'
            : null;
  const eligible = reason === null;
  const futurePayBound = eligible
    ? Math.floor(Math.min(availableFuturePay, view.pot * 0.75) / view.chipUnit) * view.chipUnit
    : 0;
  const futurePay = eligible
    ? futurePayingRange(view, draw, sampled, context, pool, random, pairMining)
    : { frequency: 0, reverseRisk: 0, samples: 0 };
  const reverseImpliedDiscount = Math.max(
    futurePay.reverseRisk,
    draw.pairedBoard ? 0.55 : draw.nutFlushDraw ? 0.12 : pairMining ? 0.25 : 0.4,
  );
  const improvementDiscount =
    (draw.nutFlushDraw ? 0.85 : pairMining ? 0.65 : 0.6) * (eligibleOpponents.length > 1 ? 0.8 : 1);
  const futurePayFrequency = futurePay.frequency;
  const impliedValue =
    futurePayBound *
    improvementProbability *
    improvementDiscount *
    (1 - reverseImpliedDiscount) *
    futurePayFrequency;
  const samples = sampled.length ? Math.min(...sampled.map((o) => o.entries.length)) : 0;
  return {
    amount,
    cost,
    price: cost / Math.max(view.chipUnit, contestable),
    equity,
    samples,
    uncertainty: samples ? Math.min(0.5, Math.sqrt(Math.log(40) / (2 * samples))) : 0.5,
    improvementProbability,
    forecast: pairMining ? 'set-by-flop' : 'next-card-improvement',
    pairMining,
    futurePayBound,
    reverseImpliedDiscount,
    improvementDiscount,
    futurePayFrequency,
    futurePaySamples: futurePay.samples,
    impliedValue,
    directCallValue: equity * contestable - cost,
    estimatedValue: equity * contestable - cost + impliedValue,
    eligible,
    reason,
    valueModel: 'discounted-implied-call-heuristic',
  };
}

/**
 * Bounded public-range and response heuristics, never a solver or proven EV.
 * `deck` is a full card catalogue; its order is discarded. Randomness is local
 * to the whitelisted snapshot and never consumes the game's random stream.
 */
export function assessPublicStrategy(
  input,
  { deck, evaluate, compare, features = handFeatures, cache = new Map(), samples = 32 },
) {
  if (!Number.isInteger(samples) || samples < 1) throw Error('策略抽样次数必须为正整数。');
  samples = Math.min(96, Math.max(8, samples));
  const view = publicView(input);
  const catalogue = [...deck].map(card).sort((a, b) => a.key.localeCompare(b.key));
  if (
    catalogue.length !== 52 ||
    new Set(catalogue.map((c) => c.key)).size !== 52 ||
    catalogue.some(
      (c) =>
        !Number.isInteger(c.rank) ||
        c.rank < 2 ||
        c.rank > 14 ||
        !Number.isInteger(c.suit) ||
        c.suit < 0 ||
        c.suit > 3,
    )
  )
    throw Error('策略模型需要完整的52张牌目录，不能使用实际剩余牌堆。');
  const ownKey = signature(view, true);
  // Common proposals/runouts make public-line comparisons reproducible without
  // changing the candidate universe whenever an earlier action is edited.
  const samplingKey = `${view.board.map((c) => c.key).join(',')}|${view.count}|${catalogue.map((c) => c.key).join(',')}`;
  const resultKey = `${samples}|${view.bigBlind}|${ownKey}|${catalogue.map((c) => c.key).join(',')}`;
  let saved = resultCaches.get(cache);
  if (
    !saved ||
    saved.evaluate !== evaluate ||
    saved.compare !== compare ||
    saved.features !== features
  ) {
    saved = { evaluate, compare, features, results: new Map() };
    resultCaches.set(cache, saved);
  }
  if (saved.results.has(resultKey)) return cloneResult(saved.results.get(resultKey));
  const data = (hole, board) => {
    // Scores/features alone may be shared across views; cap board growth in
    // long counterfactual runs. No sampled hand or decision enters this cache.
    // Each sampled runout adds a small board; evict the oldest of those before
    // the deal's fully enumerated flop/turn/river boards, which every later
    // weight and equity lookup reuses.
    if (cache.size > 64) {
      let evict = null;
      for (const key of cache.keys()) {
        evict ??= key;
        if ((cache.get(key)?.size ?? 0) < 64) {
          evict = key;
          break;
        }
      }
      cache.delete(evict);
    }
    return publicHandData(hole, board, { evaluate, features, cache });
  };
  const context = { data, compare, features, own: data(view.hole, view.board) };
  const draw = drawFacts(
    view.hole,
    view.board,
    context.own.score,
    context.own.features || features(view.hole, view.board, context.own.score),
  );
  const pool = catalogue.filter((c) => !view.board.some((b) => b.key === c.key));
  const pairs = candidatePairs(
    pool,
    Math.max(24, samples * 2),
    seededRandom(`${samplingKey}|candidates`),
  );
  const descriptors = preparePublicRanges(view);
  const actorSeat = {
    id: view.id,
    position: view.position,
    botProfile: view.botProfile,
    publicAxes: view.publicAxes,
    publicRead: view.publicRead,
    stack: view.stack,
    bet: view.bet,
    total: view.total,
    allin: false,
  };
  const actorDescriptor = preparePublicRanges({
    ...view,
    id: '__public_observer__',
    players: [actorSeat],
    legal: null,
  })[0];
  const actor = weightedTable(pairs, actorDescriptor, context, view.board);
  const tables = descriptors
    .map((descriptor) => ({
      descriptor,
      opponent: view.opponents.find((o) => o.id === descriptor.id),
      table: weightedTable(pairs, descriptor, context, view.board),
    }))
    .filter(
      ({ opponent, table }) =>
        table.total > 0 &&
        (!(opponent.allin || opponent.stack <= 0) || sharesPot(view, opponent.id)),
    );
  for (const { table } of tables)
    for (const entry of table.entries) {
      entry.publicStrength = strengthAgainst(entry, actor, compare);
      entry.drawFacts = drawFacts(entry.pair, view.board, entry.score, entry.features);
    }
  const range = compareRanges(
    actor,
    tables.map((o) => o.table),
    view.board,
    pool,
    context,
    samples,
    seededRandom(`${samplingKey}|range`),
  );
  range.opponentEvidence = tables.map((table) => opponentEvidence(table, view.street, view.board));
  const sampled = responseSamples(
    view,
    tables,
    context,
    samples,
    pool,
    seededRandom(`${samplingKey}|${view.hole.map((c) => c.key).join(',')}|response`),
  );
  const options = [];
  if (view.street > 0 && view.legal.canRaise && sampled.length) {
    for (const fraction of FRACTIONS) {
      const amount = legalRaiseTo(
        fractionRaiseTo(
          {
            currentBet: view.currentBet,
            pot: view.pot,
            callAmount: view.legal.callAmount,
            chipUnit: view.chipUnit,
          },
          fraction,
        ),
        view.legal,
      );
      options.push(optionModel(fraction, amount, view, actor, sampled, context));
    }
  }
  const result = {
    version: VERSION,
    range,
    options,
    call: impliedCall(
      view,
      draw,
      sampled,
      context,
      pool,
      seededRandom(`${samplingKey}|${view.hole.map((c) => c.key).join(',')}|future-pay`),
    ),
    draw,
    limitations: [
      'authored-public-range-priors',
      'bounded-candidate-range-approximation',
      'sampling-uncertainty-excludes-prior-error',
      'response-likelihoods-not-measured-frequencies',
      'estimated-values-not-proven-ev',
      'showdown-equity-excludes-future-betting-costs',
      ...(tables.length > 1 ? ['multiway-joint-fold-and-equity-approximation'] : []),
      ...(view.callPots.length > 1 ? ['new-wager-side-pot-payoff-approximation'] : []),
      ...(view.street === 0 ? ['preflop-size-response-omitted'] : []),
      ...(draw.nutFlushDraw ? ['nut-flush-rank-is-not-guaranteed-overall-nuts'] : []),
      ...(draw.pairedBoard && draw.flushDraw ? ['paired-board-full-house-risk'] : []),
    ],
  };
  if (saved.results.size >= 48) saved.results.delete(saved.results.keys().next().value);
  saved.results.set(resultKey, cloneResult(result));
  return result;
}
