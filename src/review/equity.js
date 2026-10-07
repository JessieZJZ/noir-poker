import { deckOfCards, evaluate, compare, partitionPots } from '../engine/poker.js';
import { startingTier } from './context.js';
function seedRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let x = value;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
function snapshotSeed(s) {
  let seed = 2166136261;
  for (const c of JSON.stringify([
    s.hole,
    s.board,
    s.players,
    s.history,
    s.street,
    s.legal.callAmount,
  ]))
    seed = Math.imul(seed ^ c.charCodeAt(0), 16777619);
  return seed >>> 0;
}
// A call has different eligible opponents in each side pot. Exclude uncalled
// refunds and compare its extra cost with what folding would return already.
export function callPrice(s) {
  const before = { players: s.players.map((p) => ({ ...p })) },
    after = {
      players: s.players.map((p) => ({
        ...p,
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
    closing: (s.street === 3 && !otherPending) || allInCovered,
  };
}
function drawPair(pool, rng) {
  const a = Math.floor(rng() * pool.length);
  let b = Math.floor(rng() * (pool.length - 1));
  if (b >= a) b++;
  return [a, b];
}
function rangeWeight(pair, s, opponent) {
  const aggressive = s.history.some((a) => a.id === opponent.id && a.action === 'raise');
  if (!aggressive) {
    const entered = s.history.some(
      (a) => a.id === opponent.id && a.street === 0 && a.action === 'call',
    );
    return entered && s.street === 0 ? [1, 2, 3, 4][startingTier(pair)] : 1;
  }
  if (s.street === 0) return [1, 2, 4, 6][startingTier(pair)];
  const score = evaluate([...pair, ...s.board]).score[0],
    suitedDraw = [0, 1, 2, 3].some(
      (suit) => [...pair, ...s.board].filter((c) => c.suit === suit).length === 4,
    );
  return score >= 4 ? 6 : score >= 2 ? 5 : score === 1 ? 3 : suitedDraw ? 2 : 1;
}
export function sampleValue(s, price, trials, weighted) {
  if (!price.contestable) return { equity: 0, margin: 0, ev: 0 };
  const rng = seedRandom(snapshotSeed(s) + (weighted ? 7919 : 0)),
    known = new Set([...s.hole, ...s.board].map((c) => c.key)),
    available = deckOfCards().filter((c) => !known.has(c.key));
  const opponents = s.players.filter((p) => p.id !== 0 && !p.folded);
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
          score = evaluate([...pair, ...s.board]).score,
          c = compare(hero, score),
          fraction =
            price.pots.reduce(
              (sum, pot) =>
                sum +
                pot.amount *
                  (!pot.eligible.includes(opponent.id) ? 1 : c > 0 ? 1 : c === 0 ? 0.5 : 0),
              0,
            ) / price.contestable,
          weight = weighted ? rangeWeight(pair, s, opponent) : 1;
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
  for (let t = 0; t < trials; t++) {
    const pool = [...available],
      holes = new Map();
    for (const opponent of opponents) {
      let indices = drawPair(pool, rng);
      if (weighted) {
        while (
          rng() >=
          rangeWeight(
            indices.map((i) => pool[i]),
            s,
            opponent,
          ) /
            6
        )
          indices = drawPair(pool, rng);
      }
      holes.set(
        opponent.id,
        indices.map((i) => pool[i]),
      );
      for (const i of indices.sort((a, b) => b - a)) pool.splice(i, 1);
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
