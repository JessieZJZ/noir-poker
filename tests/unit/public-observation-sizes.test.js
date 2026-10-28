import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, startHand, act, botDecision } from '../../src/engine/poker.js';
import { preparePublicRanges } from '../../src/engine/public-ranges.js';
import {
  publicHandObservations,
  PUBLIC_LARGE_PREFLOP_BB,
} from '../../src/engine/public-observations.js';
import { riverStory } from '../fixtures/story-line-decisions.js';
import { clarityRandom } from '../fixtures/review-clarity-followup.js';

const read = {
  hands: 24,
  voluntaryHands: 24,
  raisingHands: 24,
  largeRaiseHands: 2,
  largeCallHands: 2,
  postActions: 80,
  postRaises: 80,
};
function openView(size, caller = false, observations = read) {
  const game = newGame(5);
  game.difficulty = 'hard';
  game.emotionMode = 'off';
  const saved = Math.random;
  Math.random = clarityRandom(81201);
  try {
    startHand(game);
  } finally {
    Math.random = saved;
  }
  const opener = game.actor;
  game.players[opener].publicReads = [observations];
  act(game, opener, 'raise', size * game.bigBlind);
  let subject = opener;
  if (caller) {
    subject = game.actor;
    game.players[subject].publicReads = [observations];
    act(game, subject, 'call');
  }
  return preparePublicRanges(botDecision(game, clarityRandom(73)).trace.view).find(
    (r) => r.id === subject,
  );
}

test('a later shove cannot retroactively classify an earlier 6BB call as a large preflop call', () => {
  const rows = [];
  for (const shove of [false, true]) {
    const game = riverStory({ shove });
    game.players[0].publicReads = [read];
    const view = botDecision(game, clarityRandom(71)).trace.view;
    const range = preparePublicRanges(view)[0];
    assert.equal(range.preflop.action, 'call');
    assert.equal(range.preflop.amountBB, 6);
    assert.equal(range.rangeObservation.kind, 'voluntaryHands');
    assert.equal(range.rangeObservation.events, 24);
    rows.push({ equity: view.publicEquity.equity, price: view.callPrice });
  }
  assert.deepEqual(rows[0].price, rows[1].price);
  assert.ok(Math.abs(rows[0].equity - rows[1].equity) < 1e-12);
});

test('preflop raising observations use the actual wager size on both sides of the boundary', () => {
  const below = openView(PUBLIC_LARGE_PREFLOP_BB - 0.5);
  const at = openView(PUBLIC_LARGE_PREFLOP_BB);
  assert.equal(below.rangeObservation.kind, 'raisingHands');
  assert.equal(below.rangeObservation.events, 24);
  assert.equal(at.rangeObservation.kind, 'largeRaiseHands');
  assert.equal(at.rangeObservation.events, 2);
});

test('preflop call observations and event counting use the same inclusive size boundary', () => {
  for (const size of [PUBLIC_LARGE_PREFLOP_BB - 0.5, PUBLIC_LARGE_PREFLOP_BB]) {
    const large = size >= PUBLIC_LARGE_PREFLOP_BB;
    const range = openView(size, true);
    assert.equal(range.preflop.action, 'call');
    assert.equal(range.rangeObservation.kind, large ? 'largeCallHands' : 'voluntaryHands');
    for (const bigBlind of [50, 200, 20000, 100000]) {
      const counts = publicHandObservations({
        dealtIds: [0, 1],
        bigBlind,
        history: [
          { id: 0, street: 0, action: 'raise', amount: size * bigBlind },
          { id: 1, street: 0, action: 'call', amount: size * bigBlind },
        ],
      });
      assert.equal(counts.get(0).largeRaiseHands, Number(large));
      assert.equal(counts.get(1).largeCallHands, Number(large));
    }
  }
});

test('size classification uses the first completed observation with bounded confidence', () => {
  for (const size of [7.5, 8, 20]) {
    const first = openView(size, false, {
      hands: 1,
      voluntaryHands: 1,
      raisingHands: 1,
      largeRaiseHands: Number(size >= 8),
    }).rangeObservation;
    assert.equal(first.hands, 1);
    assert.equal(first.kind, size < 8 ? 'raisingHands' : 'largeRaiseHands');
    assert.ok(first.confidence > 0 && first.confidence < 0.2);
  }
});
