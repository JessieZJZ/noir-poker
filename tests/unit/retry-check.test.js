import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  newGame,
  startHand,
  act,
  advanceStreet,
  legalActions,
  restartHand,
  canRestartHand,
  potSize,
  deckOfCards,
} from '../../src/engine/poker.js';
import { createReviewInput } from '../../src/review/analysis.js';
let passed = 0;
const check = (name, fn) => test(name, fn);
const copy = (g) => JSON.parse(JSON.stringify(g)),
  withoutRetry = (g) => {
    const clone = copy(g);
    delete clone.logs;
    delete clone.replayAttempt;
    return clone;
  };
function finish(g, action = 'call') {
  let limit = 0;
  while (g.phase !== 'done') {
    assert.ok(++limit < 1000);
    if (g.phase === 'between') advanceStreet(g);
    else act(g, g.actor, action);
  }
}
function seeded(seed) {
  let n = seed >>> 0;
  return () => {
    n = (Math.imul(n, 1664525) + 1013904223) >>> 0;
    return n / 4294967296;
  };
}
check('restart rejects idle, active and between streets without changing state', () => {
  const g = newGame(undefined, { smallBlind: 25, bigBlind: 50, startingStack: 5000, chipUnit: 25 });
  assert.equal(canRestartHand(g), false);
  assert.throws(() => restartHand(g));
  startHand(g);
  const before = copy(g);
  assert.throws(() => restartHand(g));
  assert.deepEqual(g, before);
  while (g.phase === 'playing') act(g, g.actor, 'call');
  const between = copy(g);
  assert.throws(() => restartHand(g));
  assert.deepEqual(g, between);
});
check('pocket queens all-in folds: same deal, button, stacks and pre-hand statistics', () => {
  const rand = Math.random;
  let g;
  try {
    for (let seed = 1; seed < 5000; seed++) {
      Math.random = seeded(seed);
      g = newGame(undefined, { smallBlind: 25, bigBlind: 50, startingStack: 5000, chipUnit: 25 });
      g.dealer = 2;
      g.stats = { hands: 9, wins: 4, buyin: 10000 };
      g.players[0].stack = 14000;
      startHand(g);
      if (g.players[0].hole.every((c) => c.rank === 12)) break;
    }
    assert.ok(g.players[0].hole.every((c) => c.rank === 12));
  } finally {
    Math.random = rand;
  }
  assert.equal(g.actor, 0);
  const baseline = copy(g),
    legal = legalActions(g);
  act(g, 0, 'raise', legal.maxRaiseTo);
  while (g.phase === 'playing') act(g, g.actor, 'fold');
  assert.equal(g.phase, 'done');
  assert.equal(g.showdown, false);
  assert.equal(g.stats.hands, 10);
  assert.ok(g.refunds.length > 0);
  assert.ok(g.players[0].stack > baseline.players[0].stack);
  Math.random = () => {
    throw Error('must not shuffle during restart');
  };
  try {
    restartHand(g);
  } finally {
    Math.random = rand;
  }
  assert.deepEqual(withoutRetry(g), withoutRetry(baseline));
  assert.equal(g.replayAttempt, 1);
  assert.equal(g.players[0].total, 0);
  assert.equal(potSize(g), 75);
  assert.equal(g.stats.hands, 9);
  assert.equal(g.stats.wins, 4);
  assert.equal(g.players[0].stack, 14000);
  assert.equal(g.revealed, false);
  assert.equal(g.decisions.length, 0);
  assert.equal(g.history.length, 0);
  assert.equal(g.payouts.length, 0);
  assert.equal(g.winners.length, 0);
  act(g, 0, 'raise', 150);
  assert.equal(g.decisions.length, 1);
  assert.equal(g.decisions[0].amount, 150);
  assert.equal(g.players[0].allin, false);
});
for (let n = 5; n <= 9; n++)
  check(`${n} players all button rotations replay correctly`, () => {
    for (let d = 0; d < n; d++) {
      const g = newGame(n, { smallBlind: 25, bigBlind: 50, startingStack: 5000, chipUnit: 25 });
      g.dealer = (d + n - 1) % n;
      g.players.forEach((p, i) => (p.stack = 1000 + i * 125));
      g.stats = { hands: 7, wins: 3, buyin: 1000 };
      startHand(g);
      const baseline = copy(g);
      finish(g, 'fold');
      assert.equal(canRestartHand(g), true);
      restartHand(g);
      assert.deepEqual(withoutRetry(g), withoutRetry(baseline));
      assert.equal(g.dealer, d);
      assert.equal(g.hand, 1);
      assert.equal(
        g.players.reduce((s, p) => s + p.stack, 0) + potSize(g),
        baseline.players.reduce((s, p) => s + p.stack, 0) + 75,
      );
    }
  });
check('full river runout stays identical after different earlier choices', () => {
  const g = newGame(undefined, { smallBlind: 25, bigBlind: 50, startingStack: 5000, chipUnit: 25 });
  startHand(g);
  const baseline = copy(g);
  finish(g);
  const board = g.board.map((c) => c.key),
    review = createReviewInput(g);
  assert.ok(review.decisions.length > 0);
  restartHand(g);
  assert.deepEqual(g.deck, baseline.deck);
  assert.throws(() => createReviewInput(g));
  act(g, g.actor, 'raise', 100);
  finish(g);
  assert.deepEqual(
    g.board.map((c) => c.key),
    board,
  );
  assert.equal(g.stats.hands, 1);
  assert.equal(g.decisions[0].history[0].action, 'raise');
  assert.equal(review.decisions[0].history[0].action, 'call');
  assert.equal(g.decisions[0].currentBet, 100);
  assert.equal(review.decisions[0].currentBet, 50);
});
check('nine unequal all-ins retract eight contested pots and one refund', () => {
  const g = newGame(9, { smallBlind: 25, bigBlind: 50, startingStack: 5000, chipUnit: 25 });
  g.players.forEach((p, i) => (p.stack = (i + 1) * 100));
  startHand(g);
  const baseline = copy(g);
  while (g.phase === 'playing') {
    const legal = legalActions(g);
    act(
      g,
      g.actor,
      legal.canRaise ? 'raise' : 'call',
      legal.canRaise ? legal.maxRaiseTo : undefined,
    );
  }
  finish(g);
  assert.equal(g.pots.length, 8);
  assert.equal(g.refunds.length, 1);
  assert.equal(
    g.players.reduce((s, p) => s + p.stack, 0),
    4500,
  );
  restartHand(g);
  assert.deepEqual(withoutRetry(g), withoutRetry(baseline));
  assert.equal(g.players.reduce((s, p) => s + p.stack, 0) + potSize(g), 4500);
});
check('rebuy and short blind restore once with original actual blind amounts', () => {
  const g = newGame(undefined, { smallBlind: 25, bigBlind: 50, startingStack: 5000, chipUnit: 25 });
  g.players[0].stack = 0;
  g.players[1].stack = 25;
  g.players[2].stack = 25;
  startHand(g);
  const baseline = copy(g);
  assert.equal(g.stats.buyin, 10000);
  assert.equal(g.players[1].bet, 25);
  assert.equal(g.players[2].bet, 25);
  assert.equal(g.currentBet, 50);
  finish(g);
  restartHand(g);
  assert.deepEqual(withoutRetry(g), withoutRetry(baseline));
  assert.equal(g.stats.buyin, 10000);
  assert.equal(g.players[1].allin, true);
  assert.equal(potSize(g), 50);
});
check('repeated retries keep baseline immutable and count only latest final attempt', () => {
  const g = newGame(undefined, { smallBlind: 25, bigBlind: 50, startingStack: 5000, chipUnit: 25 });
  startHand(g);
  const baseline = copy(g);
  for (let attempt = 1; attempt <= 20; attempt++) {
    finish(g, attempt % 2 ? 'fold' : 'call');
    assert.equal(g.stats.hands, 1);
    restartHand(g);
    assert.equal(g.replayAttempt, attempt);
    assert.deepEqual(withoutRetry(g), withoutRetry(baseline));
    if (attempt === 1) {
      g.players[0].hole[0].symbol = 'mutated';
      g.deck[0].symbol = 'mutated';
    }
  }
  g.difficulty = 'hard';
  finish(g);
  restartHand(g);
  assert.equal(g.difficulty, 'hard');
  assert.equal(g.replayAttempt, 21);
  assert.equal(g.stats.hands, 0);
  finish(g);
  assert.equal(g.stats.hands, 1);
});
check('next hand replaces replay baseline and resets retry counter', () => {
  const g = newGame(undefined, { smallBlind: 25, bigBlind: 50, startingStack: 5000, chipUnit: 25 });
  startHand(g);
  finish(g, 'fold');
  restartHand(g);
  finish(g, 'fold');
  const previousDealer = g.dealer;
  startHand(g);
  const second = copy(g);
  assert.equal(g.hand, 2);
  assert.equal(g.dealer, (previousDealer + 1) % 6);
  assert.equal(g.replayAttempt, 0);
  finish(g);
  restartHand(g);
  assert.deepEqual(withoutRetry(g), withoutRetry(second));
  assert.equal(g.hand, 2);
  assert.equal(g.stats.hands, 1);
  assert.ok(JSON.stringify(g).length < 12000);
  assert.equal(
    Object.keys(g).some((k) => /snapshot|handStart|original/i.test(k)),
    false,
  );
});
