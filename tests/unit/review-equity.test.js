import test from 'node:test';
import assert from 'node:assert/strict';
import { deckOfCards, evaluate, compare } from '../../src/engine/poker.js';
import { botBoardFeatures } from '../../src/engine/bot-profiles.js';
import { preparePublicRanges } from '../../src/engine/public-ranges.js';
import { samplePublicPair } from '../../src/engine/public-equity.js';
import { rangeWeight, sampleValue, seedRandom, snapshotSeed } from '../../src/review/equity.js';
import { cards } from '../fixtures/deceptive-decisions.js';

function snapshot(hole, board, { multiway = false, allin = false, bigBlind = 200 } = {}) {
  const community = board ? cards(board) : [],
    street = community.length ? community.length - 2 : 0,
    opponents = [
      { id: 1, position: 'UTG', stack: allin ? 0 : 60 * bigBlind, total: 4 * bigBlind, allin },
      ...(multiway
        ? [{ id: 2, position: 'CO', stack: 40 * bigBlind, total: 6 * bigBlind, allin: false }]
        : []),
    ];
  const s = {
    id: 0,
    bigBlind,
    chipUnit: bigBlind / 2,
    hole: cards(hole),
    board: community,
    street,
    position: 'BTN',
    stack: 80 * bigBlind,
    total: 3 * bigBlind,
    bet: 0,
    currentBet: 4 * bigBlind,
    pot: (multiway ? 15 : 7) * bigBlind,
    legal: { callAmount: bigBlind, toCall: bigBlind },
    pending: [0],
    players: [{ id: 0, position: 'BTN', stack: 80 * bigBlind, total: 3 * bigBlind }, ...opponents],
    history: [
      { id: 1, street: 0, action: 'raise', amount: 3 * bigBlind },
      ...(multiway ? [{ id: 2, street: 0, action: 'call', amount: 3 * bigBlind }] : []),
      ...(street
        ? [{ id: 1, street, action: 'raise', amount: allin ? 12 * bigBlind : bigBlind }]
        : []),
    ],
  };
  const pots = [
    { amount: (multiway ? 12 : 8) * bigBlind, eligible: s.players.map((player) => player.id) },
    ...(multiway ? [{ amount: 3 * bigBlind, eligible: [0, 2] }] : []),
  ];
  return {
    s,
    price: { pots, contestable: pots.reduce((sum, pot) => sum + pot.amount, 0), cost: bigBlind },
  };
}

// Preserve the pre-optimization calculation as a reference: every seat calls
// the one-shot sampler on its current pool, including the first seat each trial.
function referenceSampleValue(s, price, trials, weighted) {
  if (!price.contestable) return { result: { equity: 0, margin: 0, ev: 0 }, randomCalls: 0 };
  const sourceRandom = seedRandom(snapshotSeed(s) + (weighted ? 7919 : 0));
  let randomCalls = 0;
  const random = () => {
      randomCalls++;
      return sourceRandom();
    },
    known = new Set([...s.hole, ...s.board].map((card) => card.key)),
    available = deckOfCards().filter((card) => !known.has(card.key)),
    opponents = s.players.filter((player) => player.id !== 0 && !player.folded),
    ranges = preparePublicRanges(s),
    descriptors = new Map(ranges.map((range) => [range.id, range])),
    cache = new Map();
  if (s.board.length === 5 && opponents.length === 1) {
    const own = evaluate([...s.hole, ...s.board]).score,
      opponent = opponents[0];
    let weightSum = 0,
      valueSum = 0,
      combinations = 0;
    for (let a = 0; a < available.length - 1; a++)
      for (let b = a + 1; b < available.length; b++) {
        const pair = [available[a], available[b]],
          comparison = compare(own, evaluate([...pair, ...s.board]).score),
          fraction =
            price.pots.reduce(
              (sum, pot) =>
                sum +
                pot.amount *
                  (!pot.eligible.includes(opponent.id)
                    ? 1
                    : comparison > 0
                      ? 1
                      : comparison === 0
                        ? 0.5
                        : 0),
              0,
            ) / price.contestable,
          weight = weighted ? rangeWeight(pair, s, opponent, ranges, cache) : 1;
        weightSum += weight;
        valueSum += fraction * weight;
        combinations++;
      }
    const equity = valueSum / weightSum;
    return {
      result: {
        equity,
        margin: 0,
        ev: equity * price.contestable - price.cost,
        method: 'enumeration',
        samples: combinations,
      },
      randomCalls,
    };
  }
  let sum = 0;
  for (let trial = 0; trial < trials; trial++) {
    const pool = [...available],
      holes = new Map();
    for (const opponent of opponents) {
      let pair;
      if (weighted)
        pair = samplePublicPair(pool, descriptors.get(opponent.id), {
          random,
          evaluate,
          features: botBoardFeatures,
          compare,
          cache,
        });
      else {
        const a = Math.floor(random() * pool.length);
        let b = Math.floor(random() * (pool.length - 1));
        if (b >= a) b++;
        pair = [pool[a], pool[b]];
      }
      holes.set(opponent.id, pair);
      for (const card of pair)
        pool.splice(
          pool.findIndex((candidate) => candidate.key === card.key),
          1,
        );
    }
    const board = [...s.board];
    while (board.length < 5) board.push(pool.splice(Math.floor(random() * pool.length), 1)[0]);
    const own = evaluate([...s.hole, ...board]).score,
      scores = new Map(
        opponents.map((opponent) => [
          opponent.id,
          evaluate([...holes.get(opponent.id), ...board]).score,
        ]),
      );
    let returned = 0;
    for (const pot of price.pots) {
      let ties = 1,
        lost = false;
      for (const id of pot.eligible) {
        if (id === 0) continue;
        const comparison = compare(scores.get(id), own);
        if (comparison > 0) {
          lost = true;
          break;
        }
        if (comparison === 0) ties++;
      }
      if (!lost) returned += pot.amount / ties;
    }
    sum += returned / price.contestable;
  }
  const equity = sum / trials;
  return {
    result: {
      equity,
      margin: Math.min(1, Math.sqrt(Math.log(80) / (2 * trials))),
      ev: equity * price.contestable - price.cost,
      method: 'sampling',
      samples: trials,
    },
    randomCalls,
  };
}

test('review fixed-first-seat sampling preserves deterministic equity and eligible side-pot returns across public ranges', () => {
  const fixtures = [
    snapshot('As Kd', ''),
    snapshot('As Kd', '', { multiway: true, bigBlind: 50 }),
    snapshot('5s 5d', '5h Ks 9c'),
    snapshot('Qd 8h', '9h 7d 3d Ts', { multiway: true }),
    snapshot('Ah Qh', 'Kh Jh 3c', { allin: true }),
    snapshot('As Kd', 'Ks 7h 2c 9d 3s', { multiway: true, allin: true }),
  ];
  for (const { s, price } of fixtures) {
    const before = structuredClone({ s, price });
    for (const weighted of [false, true]) {
      const reference = referenceSampleValue(s, price, 48, weighted),
        actual = sampleValue(s, price, 48, weighted);
      assert.deepEqual(
        actual,
        reference.result,
        `${s.board.length} cards, ${s.players.length - 1} opponents, weighted=${weighted}`,
      );
      assert.ok(reference.randomCalls > 0);
      if (!weighted)
        assert.equal(reference.randomCalls, 48 * (2 * (s.players.length - 1) + 5 - s.board.length));
      assert.deepEqual({ s, price }, before);
    }
  }
});

test('review keeps heads-up river exact enumeration and hidden-card boundaries with the fixed-pool sampler', () => {
  const { s, price } = snapshot('As Kd', 'Ks 7h 2c 9d 3s');
  for (const weighted of [false, true]) {
    const reference = referenceSampleValue(s, price, 48, weighted),
      actual = sampleValue(s, price, 48, weighted);
    assert.deepEqual(actual, reference.result);
    assert.equal(actual.method, 'enumeration');
    assert.equal(actual.samples, 990);
    assert.equal(actual.margin, 0);
    assert.equal(reference.randomCalls, 0);
  }
  const multiway = snapshot('5s 5d', '5h Ks 9c', { multiway: true }),
    expected = sampleValue(multiway.s, multiway.price, 48, true);
  for (const opponent of multiway.s.players.slice(1))
    Object.defineProperty(opponent, 'hole', {
      get() {
        throw Error('Hidden opponent cards read');
      },
    });
  for (const field of ['futureDeck', 'winners'])
    Object.defineProperty(multiway.s, field, {
      get() {
        throw Error(`${field} read`);
      },
    });
  assert.deepEqual(sampleValue(multiway.s, multiway.price, 48, true), expected);
});
