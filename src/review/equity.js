import { reviewCardCache } from './card-cache.js';
import { deckOfCards, evaluate, compare, partitionPots } from '../engine/poker.js';
import { botBoardFeatures } from '../engine/bot-profiles.js';
import { preparePublicRanges, publicComboWeight } from '../engine/public-ranges.js';
import {
  createPublicPairSampler,
  publicHandData,
  samplePublicPair,
} from '../engine/public-equity.js';
export function seedRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let x = value;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
export function snapshotSeed(s) {
  let seed = 2166136261;
  for (const c of JSON.stringify([
    s.hole,
    s.board,
    s.players.map(
      ({
        id,
        position,
        stack,
        bet,
        total,
        folded,
        allin,
        actedTo,
        checked,
        botProfile,
        botMoodKind,
      }) => ({
        id,
        position,
        stack,
        bet,
        total,
        folded,
        allin,
        actedTo,
        checked,
        botProfile,
        botMoodKind,
      }),
    ),
    s.history.map(({ id, street, action, amount }) => ({ id, street, action, amount })),
    s.street,
    s.legal.callAmount,
  ]))
    seed = Math.imul(seed ^ c.charCodeAt(0), 16777619);
  return seed >>> 0;
}
// A call has different eligible opponents in each side pot. Exclude uncalled
// refunds and compare its extra cost with what folding would return already.
export function callPrice(s) {
  const before = {
      players: s.players.map((p) => ({ id: p.id, total: p.total, folded: p.folded })),
    },
    after = {
      players: s.players.map((p) => ({
        id: p.id,
        folded: p.folded,
        total: p.total + (p.id === 0 ? s.legal.callAmount : 0),
      })),
    };
  const original = partitionPots(before),
    projected = partitionPots(after);
  const refundBefore = original.refunds.filter((r) => r.id === 0).reduce((n, r) => n + r.amount, 0),
    refundAfter = projected.refunds.filter((r) => r.id === 0).reduce((n, r) => n + r.amount, 0);
  const pots = projected.pots.filter((p) => p.eligible.includes(0));
  const contestable = pots.reduce((n, p) => n + p.amount, 0),
    cost = Math.max(0, s.legal.callAmount - refundAfter + refundBefore);
  const otherPending = s.pending.some(
    (id) => id !== 0 && !s.players[id].folded && !s.players[id].allin,
  );
  const allInCovered =
    s.legal.callAmount === s.stack &&
    s.players
      .filter((p) => p.id !== 0 && !p.folded)
      .every((p) => p.allin || p.total >= s.total + s.legal.callAmount);
  return {
    pots,
    contestable,
    cost,
    refundBefore,
    refundAfter,
    required: contestable ? cost / contestable : 0,
    closing:
      (s.street === 3 && !otherPending) ||
      allInCovered ||
      s.players.filter((p) => p.id !== 0 && !p.folded).every((p) => p.allin),
  };
}
function drawPair(pool, rng) {
  const a = Math.floor(rng() * pool.length);
  let b = Math.floor(rng() * (pool.length - 1));
  if (b >= a) b++;
  return [a, b];
}
// Keep the historical 0..6 contract for callers while the shared engine
// kernel supplies the position/action likelihood used by bots and examples.
export function rangeWeight(pair, s, opponent, ranges = preparePublicRanges(s), cache = new Map()) {
  const descriptor = ranges.find((range) => range.id === opponent.id);
  if (!descriptor) return 6;
  const board = descriptor.board || [],
    data =
      board.length >= 3
        ? publicHandData(pair, board, { evaluate, features: botBoardFeatures, cache })
        : {},
    boardScore = board.length === 5 ? publicHandData([], board, { evaluate, cache }).score : null;
  return 6 * publicComboWeight(pair, descriptor, { board, ...data, boardScore, compare });
}
export function sampleValue(s, price, trials, weighted) {
  if (!price.contestable) return { equity: 0, margin: 0, ev: 0 };
  const rng = seedRandom(snapshotSeed(s) + (weighted ? 7919 : 0)),
    known = new Set([...s.hole, ...s.board].map((c) => c.key)),
    available = deckOfCards().filter((c) => !known.has(c.key));
  const opponents = s.players.filter((p) => p.id !== 0 && !p.folded),
    ranges = preparePublicRanges(s),
    descriptors = new Map(ranges.map((range) => [range.id, range])),
    cache = reviewCardCache();
  let sum = 0;
  if (s.board.length === 5 && opponents.length === 1) {
    const hero = evaluate([...s.hole, ...s.board]).score,
      opponent = opponents[0];
    let weightSum = 0,
      valueSum = 0,
      combinations = 0;
    for (let i = 0; i < available.length - 1; i++)
      for (let j = i + 1; j < available.length; j++) {
        const pair = [available[i], available[j]],
          score = publicHandData(pair, s.board, { evaluate, cache }).score,
          c = compare(hero, score),
          fraction =
            price.pots.reduce(
              (sum, pot) =>
                sum +
                pot.amount *
                  (!pot.eligible.includes(opponent.id) ? 1 : c > 0 ? 1 : c === 0 ? 0.5 : 0),
              0,
            ) / price.contestable,
          weight = weighted ? rangeWeight(pair, s, opponent, ranges, cache) : 1;
        weightSum += weight;
        valueSum += fraction * weight;
        combinations++;
      }
    const equity = valueSum / weightSum;
    return {
      equity,
      margin: 0,
      ev: equity * price.contestable - price.cost,
      method: 'enumeration',
      samples: combinations,
    };
  }
  // The first opponent sees the same unblocked pool every trial. Later seats
  // must rebuild their prior after earlier sampled hands remove their cards.
  const firstPairSampler =
    weighted && opponents.length
      ? createPublicPairSampler(available, descriptors.get(opponents[0].id), {
          evaluate,
          features: botBoardFeatures,
          compare,
          cache,
        })
      : null;
  for (let t = 0; t < trials; t++) {
    const pool = [...available],
      holes = new Map();
    for (const [index, opponent] of opponents.entries()) {
      const pair = weighted
        ? index === 0
          ? firstPairSampler({ random: rng })
          : samplePublicPair(pool, descriptors.get(opponent.id), {
              random: rng,
              evaluate,
              features: botBoardFeatures,
              compare,
              cache,
            })
        : drawPair(pool, rng).map((index) => pool[index]);
      holes.set(opponent.id, pair);
      for (const card of pair)
        pool.splice(
          pool.findIndex((candidate) => candidate.key === card.key),
          1,
        );
    }
    const board = [...s.board];
    while (board.length < 5) board.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
    const hero = evaluate([...s.hole, ...board]).score,
      scores = new Map(
        opponents.map((p) => [p.id, evaluate([...holes.get(p.id), ...board]).score]),
      );
    let returned = 0;
    for (const pot of price.pots) {
      let ties = 1,
        lost = false;
      for (const id of pot.eligible) {
        if (id === 0) continue;
        const c = compare(scores.get(id), hero);
        if (c > 0) {
          lost = true;
          break;
        }
        if (c === 0) ties++;
      }
      if (!lost) returned += pot.amount / ties;
    }
    const fraction = price.contestable ? returned / price.contestable : 0;
    sum += fraction;
  }
  const equity = sum / trials,
    margin = Math.min(1, Math.sqrt(Math.log(80) / (2 * trials)));
  return {
    equity,
    margin,
    ev: equity * price.contestable - price.cost,
    method: 'sampling',
    samples: trials,
  };
}
