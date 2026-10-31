import test from 'node:test';
import assert from 'node:assert/strict';
import { deckOfCards, evaluate, compare, botDecision } from '../../src/engine/poker.js';
import { publicHandData, createPublicPairSampler } from '../../src/engine/public-equity.js';
import { preparePublicRanges, publicComboWeight } from '../../src/engine/public-ranges.js';
import { observedRangeModel } from '../../src/engine/public-observations.js';
import { handFeatures } from '../../src/engine/hand-features.js';
import { startingPercentile } from '../../src/engine/starting-range.js';
import { riverStory } from '../fixtures/story-line-decisions.js';
import { clarityRandom } from '../fixtures/review-clarity-followup.js';
import { cards } from '../fixtures/deceptive-decisions.js';

const read = {
  hands: 24,
  voluntaryHands: 24,
  raisingHands: 24,
  largeRaiseHands: 16,
  postActions: 33,
  postRaises: 33,
};
const prior = {
  allIn: false,
  street: 0,
  role: 'raiser',
  line: 'open',
  depthBB: 100,
  position: 'BTN',
  board: [],
  publicStyle: 'rook',
  publicAxes: [85, 96, 88, 62, 8],
  seatedCount: 5,
  committedCount: 0,
  opponentCount: 1,
  waitingCount: 0,
  preflop: { action: 'raise', raises: 1, amountBB: 3, facedBB: 1 },
  postflopLine: [],
};
const ace = (pair) => pair.some((card) => card.rank === 14);
const topFifth = (pair) => startingPercentile(pair) <= 0.2;
function riverRange() {
  const game = riverStory();
  game.players[0].publicReads = [read];
  return preparePublicRanges(botDecision(game, clarityRandom(71)).trace.view)[0];
}
const scenarios = [
  ['warm complete river', riverRange, ace],
  ['visible wide-style preflop', () => structuredClone(prior), topFifth],
  [
    'single late short shove',
    () => ({
      ...structuredClone(prior),
      publicStyle: null,
      publicAxes: null,
      allIn: true,
      role: 'shover',
      line: 'cold-shove',
      depthBB: 20,
      seatedCount: 3,
      committedCount: 1,
    }),
    topFifth,
  ],
  [
    'warm single-street flop',
    () => ({
      ...structuredClone(prior),
      publicStyle: null,
      publicAxes: null,
      street: 1,
      board: cards('5h 6h Ac'),
      publicRead: { ...read },
      rangeObservation: observedRangeModel(read, { action: 'raise' }),
      postflop: { street: 1, action: 'raise', ratio: 1 },
    }),
    ace,
  ],
];

for (const [name, create, target] of scenarios) {
  test(`public sampler preserves complete descriptor weights: ${name}`, () => {
    const descriptor = create(),
      board = descriptor.board;
    const known = [...board, ...cards('Jc Js')];
    const pool = deckOfCards().filter((card) => !known.some((other) => other.key === card.key));
    const options = { evaluate, compare, features: handFeatures, cache: new Map() };
    const data = (hole, community) => publicHandData(hole, community, options);
    const boardScore = board.length === 5 ? data([], board).score : null;
    let mass = 0,
      targetMass = 0;
    for (let a = 0; a < pool.length; a++)
      for (let b = a + 1; b < pool.length; b++) {
        const pair = [pool[a], pool[b]];
        const weight = publicComboWeight(pair, descriptor, {
          board,
          ...(board.length >= 3 ? data(pair, board) : {}),
          boardScore,
          compare,
          handData: data,
        });
        mass += weight;
        if (target(pair)) targetMass += weight;
      }
    const sampler = createPublicPairSampler(pool, descriptor, options);
    const random = clarityRandom(821045),
      samples = 8000;
    let hits = 0;
    for (let n = 0; n < samples; n++) if (target(sampler({ random }))) hits++;
    // A fixed-seed distribution regression, not a completed-hand strength test.
    // Hoeffding's bound uses one target per scenario and a 1e-6 error budget.
    const tolerance = Math.sqrt(Math.log(2 / 1e-6) / (2 * samples));
    assert.ok(
      Math.abs(hits / samples - targetMass / mass) <= tolerance,
      JSON.stringify({ name, expected: targetMass / mass, actual: hits / samples, tolerance }),
    );
  });
}

test('prepared sampler detaches mutable public tendencies and style axes', () => {
  const descriptor = riverRange();
  descriptor.publicStyle = 'rook';
  descriptor.publicAxes = [85, 96, 88, 62, 8];
  const options = { evaluate, compare, features: handFeatures, cache: new Map() };
  const known = [...descriptor.board, ...cards('Jc Js')];
  const pool = deckOfCards().filter((card) => !known.some((other) => other.key === card.key));
  const prepared = createPublicPairSampler(pool, descriptor, options);
  const reference = createPublicPairSampler(pool, structuredClone(descriptor), options);
  descriptor.publicStyle = 'owen';
  descriptor.publicAxes.fill(0);
  Object.keys(descriptor.publicRead).forEach((key) => {
    descriptor.publicRead[key] = 0;
  });
  descriptor.rangeObservation.width = 0.025;
  descriptor.rangeObservation.confidence = 1;
  const one = clarityRandom(55291),
    two = clarityRandom(55291);
  for (let n = 0; n < 40; n++)
    assert.deepEqual(prepared({ random: one }), reference({ random: two }));
});
