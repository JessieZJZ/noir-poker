import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  deckOfCards,
  newGame,
  startHand,
  act,
  advanceStreet,
  legalActions,
  seatPosition,
  currentPots,
  potSize,
  evaluate,
  compare,
} from '../../src/engine/poker.js';
let passed = 0;
const check = (name, fn) => test(name, fn);
const rotations = [
  {
    d: 0,
    roles: ['BTN', 'SB', 'BB', 'UTG', 'HJ', 'CO'],
    pre: [3, 4, 5, 0, 1, 2],
    post: [1, 2, 3, 4, 5, 0],
    deal: [1, 2, 3, 4, 5, 0],
  },
  {
    d: 1,
    roles: ['CO', 'BTN', 'SB', 'BB', 'UTG', 'HJ'],
    pre: [4, 5, 0, 1, 2, 3],
    post: [2, 3, 4, 5, 0, 1],
    deal: [2, 3, 4, 5, 0, 1],
  },
  {
    d: 2,
    roles: ['HJ', 'CO', 'BTN', 'SB', 'BB', 'UTG'],
    pre: [5, 0, 1, 2, 3, 4],
    post: [3, 4, 5, 0, 1, 2],
    deal: [3, 4, 5, 0, 1, 2],
  },
  {
    d: 3,
    roles: ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'],
    pre: [0, 1, 2, 3, 4, 5],
    post: [4, 5, 0, 1, 2, 3],
    deal: [4, 5, 0, 1, 2, 3],
  },
  {
    d: 4,
    roles: ['BB', 'UTG', 'HJ', 'CO', 'BTN', 'SB'],
    pre: [1, 2, 3, 4, 5, 0],
    post: [5, 0, 1, 2, 3, 4],
    deal: [5, 0, 1, 2, 3, 4],
  },
  {
    d: 5,
    roles: ['SB', 'BB', 'UTG', 'HJ', 'CO', 'BTN'],
    pre: [2, 3, 4, 5, 0, 1],
    post: [0, 1, 2, 3, 4, 5],
    deal: [0, 1, 2, 3, 4, 5],
  },
];
for (const expected of rotations)
  check('dealer ' + expected.d + ': blinds, dealing and all four action rounds', () => {
    const g = newGame();
    g.dealer = expected.d === 0 ? 5 : expected.d - 1;
    const random = Math.random;
    Math.random = () => 0.999999;
    try {
      startHand(g);
    } finally {
      Math.random = random;
    }
    assert.deepEqual(
      g.players.map((p) => seatPosition(g, p.id)),
      expected.roles,
    );
    assert.equal(g.players[expected.post[0]].bet, 25);
    assert.equal(g.players[expected.post[1]].bet, 50);
    const topCards = [...deckOfCards()].reverse();
    for (let i = 0; i < 6; i++)
      assert.deepEqual(
        g.players[expected.deal[i]].hole.map((c) => c.key),
        [topCards[i].key, topCards[i + 6].key],
      );
    assert.equal(g.deck.length, 40);
    for (const id of expected.pre) {
      assert.equal(g.actor, id);
      act(g, id, 'call');
    }
    assert.equal(g.phase, 'between');
    const boardCounts = [3, 4, 5],
      deckCounts = [36, 34, 32];
    for (let street = 0; street < 3; street++) {
      advanceStreet(g);
      assert.equal(g.board.length, boardCounts[street]);
      assert.equal(g.deck.length, deckCounts[street]);
      for (const id of expected.post) {
        assert.equal(g.actor, id);
        assert.equal(legalActions(g).canCheck, true);
        act(g, id, 'check');
      }
      assert.equal(g.phase, 'between');
    }
    assert.deepEqual(
      g.board.map((c) => c.key),
      ['2-14', '2-13', '2-12', '2-10', '2-8'],
    );
    assert.equal(
      new Set([...g.players.flatMap((p) => p.hole), ...g.board, ...g.deck].map((c) => c.key)).size,
      49,
    );
    advanceStreet(g);
    assert.equal(g.phase, 'done');
    assert.equal(
      g.players.reduce((n, p) => n + p.stack, 0),
      30000,
    );
  });
check('button advances one clockwise seat over a full orbit', () => {
  const g = newGame();
  const expected = [0, 1, 2, 3, 4, 5, 0];
  for (const dealer of expected) {
    startHand(g);
    assert.equal(g.dealer, dealer);
    while (g.phase === 'playing') act(g, g.actor, 'fold');
    assert.equal(g.phase, 'done');
  }
});
check('big blind retains raise option after five limps', () => {
  const g = newGame();
  startHand(g);
  for (let i = 0; i < 5; i++) act(g, g.actor, 'call');
  assert.equal(g.actor, 2);
  assert.equal(g.phase, 'playing');
  assert.equal(legalActions(g).canCheck, true);
  assert.equal(legalActions(g).canRaise, true);
  assert.equal(legalActions(g).minRaiseTo, 100);
  act(g, 2, 'raise', 100);
  assert.equal(g.actor, 3);
  const ids = [];
  while (g.phase === 'playing') {
    ids.push(g.actor);
    act(g, g.actor, 'call');
  }
  assert.deepEqual(ids, [3, 4, 5, 0, 1]);
});
check('postflop skips folded small blind and all-in big blind', () => {
  const g = newGame();
  g.players[2].stack = 50;
  startHand(g);
  for (const id of [3, 4, 5, 0]) act(g, id, 'call');
  act(g, 1, 'fold');
  assert.equal(g.phase, 'between');
  advanceStreet(g);
  assert.equal(g.actor, 3);
  const ids = [];
  while (g.phase === 'playing') {
    ids.push(g.actor);
    act(g, g.actor, 'check');
  }
  assert.deepEqual(ids, [3, 4, 5, 0]);
});
check('two survivors in a six-handed deal do not move the blinds to heads-up positions', () => {
  const g = newGame();
  startHand(g);
  for (const id of [3, 4, 5]) act(g, id, 'fold');
  act(g, 0, 'call');
  act(g, 1, 'call');
  act(g, 2, 'fold');
  advanceStreet(g);
  assert.equal(g.actor, 1);
  assert.equal(seatPosition(g, 0), 'BTN');
  assert.equal(seatPosition(g, 1), 'SB');
});
check('short blinds post actual stacks and keep full big blind bring-in', () => {
  const g = newGame();
  g.players[1].stack = 25;
  g.players[2].stack = 25;
  startHand(g);
  assert.equal(g.players[1].bet, 25);
  assert.equal(g.players[1].action, '小盲 25');
  assert.equal(g.players[1].allin, true);
  assert.equal(g.players[2].bet, 25);
  assert.equal(g.players[2].allin, true);
  assert.equal(legalActions(g).callAmount, 50);
  assert.equal(legalActions(g).minRaiseTo, 100);
});
function postflop(stacks = [1000, 1000, 1000, 1000, 1000, 1000]) {
  const g = newGame();
  g.dealer = 5;
  g.phase = 'playing';
  g.street = 1;
  g.currentBet = 0;
  g.minRaise = 50;
  g.pending = [0, 1, 2, 3, 4, 5];
  g.actor = 0;
  g.players.forEach((p, i) => (p.stack = stacks[i]));
  return g;
}
check('ordinary check-raise remains legal after a full opening bet', () => {
  const g = postflop();
  act(g, 0, 'check');
  act(g, 1, 'raise', 100);
  for (const id of [2, 3, 4, 5]) act(g, id, 'call');
  assert.equal(g.actor, 0);
  assert.equal(legalActions(g).canRaise, true);
  assert.equal(legalActions(g).minRaiseTo, 200);
});
check('checking then facing only a sub-minimum all-in does not reopen a raise', () => {
  const g = postflop([1000, 25, 1000, 1000, 1000, 1000]);
  act(g, 0, 'check');
  act(g, 1, 'raise', 25);
  assert.equal(legalActions(g).fullRaiseTo, 75);
  for (const id of [2, 3, 4, 5]) act(g, id, 'call');
  assert.equal(g.actor, 0);
  assert.equal(legalActions(g).canRaise, false);
  assert.equal(legalActions(g).callAmount, 25);
  const before = JSON.stringify(g);
  assert.throws(() => act(g, 0, 'raise', 75));
  assert.equal(JSON.stringify(g), before);
  act(g, 0, 'call');
  assert.equal(g.phase, 'between');
});
check('cumulative sub-minimum opening all-ins reopen the checker at one full blind', () => {
  const g = postflop([1000, 25, 50, 1000, 1000, 1000]);
  act(g, 0, 'check');
  act(g, 1, 'raise', 25);
  act(g, 2, 'raise', 50);
  act(g, 3, 'call');
  act(g, 4, 'call');
  act(g, 5, 'call');
  assert.equal(g.actor, 0);
  assert.equal(legalActions(g).canRaise, true);
  assert.equal(legalActions(g).minRaiseTo, 100);
});
check('TDA raise examples distinguish increment from total', () => {
  const g = postflop();
  act(g, 0, 'raise', 125);
  assert.equal(legalActions(g).minRaiseTo, 250);
  act(g, 1, 'raise', 250);
  act(g, 2, 'raise', 550);
  assert.equal(legalActions(g).minRaiseTo, 850);
  const before = JSON.stringify(g);
  assert.throws(() => act(g, 3, 'raise', 800));
  assert.equal(JSON.stringify(g), before);
});
check('short all-in does not remove the unacted big blind raise option', () => {
  const g = newGame();
  g.players[3].stack = 75;
  startHand(g);
  act(g, 3, 'raise', 75);
  for (const id of [4, 5, 0, 1]) act(g, id, 'call');
  assert.equal(g.actor, 2);
  assert.equal(legalActions(g).canRaise, true);
  assert.equal(legalActions(g).minRaiseTo, 125);
});
check('TDA cumulative short raises reopen A but not an intervening caller C', () => {
  const g = postflop([1000, 125, 1000, 200, 1000, 1000]);
  act(g, 0, 'raise', 100);
  act(g, 1, 'raise', 125);
  act(g, 2, 'call');
  act(g, 3, 'raise', 200);
  act(g, 4, 'call');
  act(g, 5, 'fold');
  assert.equal(g.actor, 0);
  assert.equal(legalActions(g).canRaise, true);
  assert.equal(legalActions(g).minRaiseTo, 300);
  act(g, 0, 'call');
  assert.equal(g.actor, 2);
  assert.equal(legalActions(g).canRaise, false);
  assert.equal(legalActions(g).callAmount, 75);
});
check('one non-all-in player cannot make a dry side pot', () => {
  const g = postflop([1000, 100, 100, 100, 100, 100]);
  act(g, 0, 'raise', 100);
  for (const id of [1, 2, 3, 4, 5]) act(g, id, 'call');
  assert.equal(g.phase, 'between');
  assert.equal(g.revealed, true);
  g.deck = deckOfCards();
  advanceStreet(g);
  assert.equal(g.phase, 'between');
  assert.equal(g.actor, -1);
  assert.equal(legalActions(g, 0).enabled, false);
});
const cards = (s) =>
  s
    .split(' ')
    .map((v) =>
      deckOfCards().find(
        (c) => c.rank === '23456789TJQKA'.indexOf(v[0]) + 2 && c.suit === 'shcd'.indexOf(v[1]),
      ),
    );
check('aces can be low, but cannot wrap K-A-2-3-4', () =>
  assert.equal(evaluate(cards('Ks Ah 2c 3d 4s')).score[0], 0),
);
check('board plays and suits never break a tied five-card hand', () => {
  const board = cards('As Kd Qc Jh Ts');
  assert.equal(
    compare(
      evaluate([...board, ...cards('2s 3s')]).score,
      evaluate([...board, ...cards('9h 8h')]).score,
    ),
    0,
  );
});
check('same category compares every relevant kicker only within best five cards', () => {
  assert.equal(
    compare(
      evaluate(cards('As Ah Ks Qs Js 2c 3c')).score,
      evaluate(cards('Ad Ac Kc Qc Tc 9h 8h')).score,
    ),
    1,
  );
  assert.deepEqual(evaluate(cards('As Ah Ac Ad Ks Qh Jc')).score, [7, 14, 13]);
});
check('blinds and unfinished ordinary raises do not create side pots', () => {
  const g = newGame();
  startHand(g);
  assert.equal(currentPots(g).pots.length, 1);
  act(g, 3, 'raise', 125);
  assert.equal(currentPots(g).pots.length, 1);
  assert.deepEqual(currentPots(g).refunds, [{ id: 3, amount: 75 }]);
  act(g, 4, 'call');
  assert.equal(currentPots(g).pots.length, 1);
  assert.equal(currentPots(g).refunds.length, 0);
  const detail = currentPots(g);
  assert.equal(
    detail.pots.reduce((n, p) => n + p.amount, 0) +
      detail.refunds.reduce((n, r) => n + r.amount, 0),
    potSize(g),
  );
});
check('live pots split only at all-in caps and retain uncalled excess separately', () => {
  const g = newGame();
  g.phase = 'playing';
  g.players.forEach((p, i) => {
    p.total = [100, 300, 500, 500, 0, 0][i];
    p.allin = i < 3;
    p.folded = i > 3;
  });
  const detail = currentPots(g);
  assert.deepEqual(
    detail.pots.map((p) => p.amount),
    [400, 600, 400],
  );
  assert.deepEqual(
    detail.pots.map((p) => p.eligible),
    [
      [0, 1, 2, 3],
      [1, 2, 3],
      [2, 3],
    ],
  );
  g.players[3].total = 800;
  assert.deepEqual(currentPots(g).refunds, [{ id: 3, amount: 300 }]);
  assert.deepEqual(
    currentPots(g).pots.map((p) => p.amount),
    [400, 600, 400],
  );
});
