import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  newGame,
  startHand,
  act,
  advanceStreet,
  completeBoardForPractice,
  restartHand,
} from '../../src/engine/poker.js';
import { createReviewInput } from '../../src/review/analysis.js';

const copy = (g) => JSON.parse(JSON.stringify(g));
const withoutDisplay = (g) => {
  const state = copy(g);
  delete state.practiceBoard;
  delete state.logs;
  delete state.replayAttempt;
  return state;
};
function finishByCalls(g) {
  while (g.phase !== 'done') {
    if (g.phase === 'between') advanceStreet(g);
    else act(g, g.actor, 'call');
  }
}

for (const street of [0, 1, 2, 3]) {
  test(`fold-win on street ${street}: practice runout matches original river and leaves settlement/review untouched`, () => {
    const g = newGame(9, { smallBlind: 25, bigBlind: 50, startingStack: 5000, chipUnit: 25 });
    g.dealer = 5;
    startHand(g);
    const original = copy(g),
      river = copy(g);
    finishByCalls(river);
    while (g.street < street) {
      while (g.phase === 'playing') act(g, g.actor, 'call');
      advanceStreet(g);
    }
    if (street > 0) act(g, g.actor, 'raise', 100);
    while (g.actor !== 0) act(g, g.actor, 'fold');
    act(g, 0, 'fold');
    while (g.phase === 'playing') act(g, g.actor, 'fold');
    assert.equal(g.phase, 'done');
    assert.equal(g.showdown, false);
    const settled = withoutDisplay(g),
      review = createReviewInput(g),
      chips = g.players.reduce((sum, p) => sum + p.stack, 0);
    completeBoardForPractice(g);
    assert.deepEqual(g.practiceBoard || g.board, river.board);
    assert.equal(new Set((g.practiceBoard || g.board).map((c) => c.key)).size, 5);
    assert.deepEqual(withoutDisplay(g), settled);
    assert.deepEqual(createReviewInput(g), review);
    assert.equal(
      g.players.reduce((sum, p) => sum + p.stack, 0),
      chips,
    );
    assert.equal(chips, 45000);
    const once = copy(g);
    completeBoardForPractice(g);
    assert.deepEqual(g, once);
    assert.throws(() => advanceStreet(g));
    restartHand(g);
    assert.equal(g.practiceBoard, null);
    const restored = withoutDisplay(g),
      baseline = withoutDisplay(original);
    assert.ok(restored.playerObservationRevision > baseline.playerObservationRevision);
    restored.playerObservationRevision = baseline.playerObservationRevision;
    assert.deepEqual(restored, baseline);
    finishByCalls(g);
    assert.deepEqual(g.board, river.board);
    startHand(g);
    assert.equal(g.practiceBoard, null);
  });
}

test('practice runout cannot expose a live deck; a normal showdown stays unchanged', () => {
  const g = newGame(undefined, { smallBlind: 25, bigBlind: 50, startingStack: 5000, chipUnit: 25 });
  assert.throws(() => completeBoardForPractice(g));
  startHand(g);
  let before = copy(g);
  assert.throws(() => completeBoardForPractice(g));
  assert.deepEqual(g, before);
  while (g.phase === 'playing') act(g, g.actor, 'call');
  before = copy(g);
  assert.throws(() => completeBoardForPractice(g));
  assert.deepEqual(g, before);
  finishByCalls(g);
  before = copy(g);
  completeBoardForPractice(g);
  assert.deepEqual(g, before);
});
