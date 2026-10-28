import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, compare, deckOfCards } from '../../src/engine/poker.js';
import { botBoardFeatures } from '../../src/engine/bot-profiles.js';
import { preparePublicRanges, publicComboWeight } from '../../src/engine/public-ranges.js';
import {
  createPublicPairSampler,
  estimatePublicEquity,
  publicHandData,
} from '../../src/engine/public-equity.js';
import { cards, deceptiveView } from '../fixtures/deceptive-decisions.js';

const random = (seed) => () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
function narrowView() {
  return deceptiveView('Qs Qd', 'Js 7h 2c', {
    id: 0,
    bigBlind: 200,
    chipUnit: 100,
    position: 'BB',
    stack: 20000,
    pot: 20000,
    currentBet: 18000,
    rivals: 1,
    opponents: [{ id: 1, position: 'BTN', stack: 20000, total: 18000, bet: 18000, allin: false }],
    history: [
      { id: 0, street: 0, action: 'raise', amount: 600 },
      { id: 1, street: 0, action: 'raise', amount: 2000 },
      { id: 0, street: 0, action: 'raise', amount: 6000 },
      { id: 1, street: 0, action: 'call', amount: 6000 },
      { id: 1, street: 1, action: 'raise', amount: 18000 },
    ],
    legal: {
      enabled: true,
      chipUnit: 100,
      canRaise: false,
      canCheck: false,
      toCall: 18000,
      callAmount: 18000,
      minRaiseTo: 36000,
      maxRaiseTo: 20000,
    },
  });
}

test('single-street narrow posteriors avoid expensive full enumeration across independent seeds without changing trial budget', () => {
  const view = narrowView();
  const rows = [];
  for (const seed of [71, ...Array.from({ length: 63 }, (_, i) => i + 1)]) {
    let calls = 0;
    const result = estimatePublicEquity(view, preparePublicRanges(view), {
      deck: deckOfCards(),
      evaluate: (input) => {
        calls++;
        return evaluate(input);
      },
      compare,
      features: botBoardFeatures,
      trials: 52,
      random: random(seed),
    });
    assert.equal(result.samples, 52);
    assert.equal(result.cdfFallbacks, 0, `seed ${seed}`);
    rows.push(calls);
  }
  assert.ok(
    rows.every((calls) => calls < 400),
    `Peak candidate evaluations: ${Math.max(...rows)}`,
  );
  assert.ok(rows.reduce((sum, calls) => sum + calls, 0) / rows.length < 300);
});

test('the extended ordinary rejection window still has a bounded exact fallback rather than truncating or sampling uniformly', () => {
  const pool = cards('As Ah 2d');
  const board = cards('Ac Kc Qh');
  const descriptor = {
    board,
    street: 1,
    preflop: { action: null, raises: 0, amountBB: 1 },
    postflopLine: [{ street: 1, action: 'bet', ratio: 9, board }],
  };
  const stats = {};
  let calls = 0;
  const pair = createPublicPairSampler(pool, descriptor, {
    evaluate,
    compare,
    features: botBoardFeatures,
  })({
    random: () => (++calls <= 256 ? 0.9999 : 0),
    stats,
  });
  assert.equal(stats.proposals, 64);
  assert.equal(stats.cdfFallbacks, 1);
  assert.equal(calls, 257);
  assert.deepEqual(pair, cards('As Ah'));
  assert.deepEqual(pool, cards('As Ah 2d'));
});

test('single-street rank proposals and fallback preserve the exact physical-pair posterior under blockers', () => {
  const pool = cards('As Ah Kd Kh Qc Jd 9s 8h');
  const descriptor = preparePublicRanges(narrowView())[0];
  const context = { evaluate, compare, features: botBoardFeatures, cache: new Map() };
  const data = (hole, board) => publicHandData(hole, board, context);
  const entries = [];
  for (let a = 0; a < pool.length - 1; a++)
    for (let b = a + 1; b < pool.length; b++) {
      const pair = [pool[a], pool[b]];
      const weight = publicComboWeight(pair, descriptor, {
        board: descriptor.board,
        ...data(pair, descriptor.board),
        compare,
        handData: data,
      });
      entries.push({
        key: pair
          .map((card) => card.key)
          .sort()
          .join('|'),
        weight,
      });
    }
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
  const draws = new Map();
  const sampler = createPublicPairSampler(pool, descriptor, context);
  const rng = random(911);
  for (let i = 0; i < 32000; i++) {
    const pair = sampler({ random: rng });
    const key = pair
      .map((card) => card.key)
      .sort()
      .join('|');
    draws.set(key, (draws.get(key) || 0) + 1);
  }
  const variation =
    entries.reduce(
      (sum, entry) => sum + Math.abs((draws.get(entry.key) || 0) / 32000 - entry.weight / total),
      0,
    ) / 2;
  assert.equal(entries.length, 28);
  assert.ok(variation < 0.025, `Physical-pair posterior total variation: ${variation}`);
});
