import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  newGame,
  deckOfCards,
  partitionPots,
  contestableAfterCall,
  settle,
  act,
  advanceStreet,
  legalActions,
  potSize,
} from '../../src/engine/poker.js';
const deck = deckOfCards();
const cards = (s) =>
  s
    .split(' ')
    .map((v) =>
      deck.find(
        (c) => c.rank === '23456789TJQKA'.indexOf(v[0]) + 2 && c.suit === 'shcd'.indexOf(v[1]),
      ),
    );
const hands = ['As Ah', 'Ks Kh', 'Qs Qh', 'Js Jh', 'Ts Th', '9s 9h'];
let passed = 0;
const check = (name, fn) => test(name, fn);
function fixture(totals, folded = [], custom = hands) {
  const g = newGame();
  g.phase = 'between';
  g.street = 3;
  g.board = cards('2c 3d 4h 7s 8c');
  g.players.forEach((p, i) => {
    p.total = totals[i] || 0;
    p.bet = p.total;
    p.stack = 5000 - p.total;
    p.hole = cards(custom[i] || hands[i]);
    p.folded = p.total === 0 || folded.includes(i);
  });
  return g;
}
function conserve(g, before) {
  assert.equal(
    g.players.reduce((s, p) => s + p.stack, 0),
    before,
  );
  assert.equal(
    g.pots.reduce((s, p) => s + p.amount, 0) + g.refunds.reduce((s, r) => s + r.amount, 0),
    potSize(g),
  );
  for (const pot of g.pots) {
    for (const amount of [
      pot.amount,
      ...pot.awards.map((a) => a.amount),
      ...pot.contributions.map((c) => c.amount),
    ])
      assert.equal(amount % 25, 0);
    assert.equal(
      pot.awards.reduce((s, a) => s + a.amount, 0),
      pot.amount,
    );
    assert.equal(
      pot.contributions.reduce((s, c) => s + c.amount, 0),
      pot.amount,
    );
    assert.ok(pot.awards.every((a) => pot.eligible.includes(a.id)));
  }
  for (const amount of [...g.players.map((p) => p.stack), ...g.refunds.map((r) => r.amount)])
    assert.equal(amount % 25, 0);
}
check('four players: one main pot and two side pots have different winners', () => {
  const g = fixture([100, 300, 500, 500]);
  const preview = partitionPots(g);
  assert.deepEqual(
    preview.pots.map((p) => p.amount),
    [400, 600, 400],
  );
  assert.deepEqual(
    preview.pots.map((p) => p.eligible),
    [
      [0, 1, 2, 3],
      [1, 2, 3],
      [2, 3],
    ],
  );
  settle(g);
  assert.deepEqual(g.payouts, [400, 600, 400, 0, 0, 0]);
  assert.deepEqual(
    g.pots.map((p) => p.awards[0].id),
    [0, 1, 2],
  );
  conserve(g, 30000);
});
check('six players: five contested pots plus a refund', () => {
  const g = fixture([100, 200, 300, 400, 500, 600]);
  settle(g);
  assert.deepEqual(
    g.pots.map((p) => p.amount),
    [600, 500, 400, 300, 200],
  );
  assert.deepEqual(g.payouts, [600, 500, 400, 300, 200, 100]);
  assert.deepEqual(g.refunds, [{ id: 5, amount: 100 }]);
  assert.equal(
    g.winners.some((w) => w.id === 5),
    false,
  );
  conserve(g, 30000);
});
check('folded chips remain; folded contribution cap does not create a spurious extra pot', () => {
  const g = fixture([100, 300, 500, 500, 200], [4]);
  settle(g);
  assert.deepEqual(
    g.pots.map((p) => p.amount),
    [500, 700, 400],
  );
  assert.ok(g.pots.every((p) => !p.eligible.includes(4)));
  assert.equal(g.payouts[4], 0);
  assert.equal(g.pots[1].contributions.find((c) => c.id === 4).amount, 100);
  conserve(g, 30000);
});
check('folded contributions with no allin stay in a single pot', () => {
  const g = fixture([25, 50, 100, 100], [0, 1]);
  assert.equal(partitionPots(g).pots.length, 1);
  settle(g);
  assert.equal(g.pots[0].amount, 275);
  conserve(g, 30000);
});
check(
  'a side pot can split independently while the main pot and first side pot have single winners',
  () => {
    const g = fixture([100, 300, 500, 500], [], ['As Ah', 'Ks Kh', 'Qs Qh', 'Qc Qd']);
    settle(g);
    assert.deepEqual(g.payouts, [400, 600, 200, 200, 0, 0]);
    assert.deepEqual(
      g.pots.map((p) => p.awards.length),
      [1, 1, 2],
    );
    conserve(g, 30000);
  },
);
check('odd side-pot chip goes to the first tied winner left of the button', () => {
  for (const [dealer, expected] of [
    [0, [400, 250, 225, 0, 0, 0]],
    [1, [400, 225, 250, 0, 0, 0]],
  ]) {
    const g = fixture([100, 325, 325, 125], [3], ['As Ah', 'Ks Kh', 'Kc Kd']);
    g.dealer = dealer;
    settle(g);
    assert.deepEqual(
      g.pots.map((p) => p.amount),
      [400, 475],
    );
    assert.deepEqual(g.payouts, expected);
    conserve(g, 30000);
  }
});
check('uncalled return is separate from pot winnings and never counts as a won hand', () => {
  const g = fixture([800, 100, 300, 500], [], ['Js Jh', 'As Ah', 'Ks Kh', 'Qs Qh']);
  settle(g);
  assert.deepEqual(
    g.pots.map((p) => p.amount),
    [400, 600, 400],
  );
  assert.deepEqual(g.refunds, [{ id: 0, amount: 300 }]);
  assert.deepEqual(g.payouts, [300, 400, 600, 400, 0, 0]);
  assert.equal(g.stats.wins, 0);
  assert.equal(g.potAtShowdown, 1400);
  conserve(g, 30000);
});
check('four actual legal allins form three pots before settlement', () => {
  const g = fixture([0, 0, 0, 0]);
  g.phase = 'playing';
  g.currentBet = 0;
  g.actor = 0;
  g.pending = [0, 1, 2, 3];
  g.players.forEach((p, i) => {
    p.folded = i > 3;
    p.allin = false;
    p.total = 0;
    p.bet = 0;
    p.stack = [100, 300, 500, 500, 5000, 5000][i];
    p.actedTo = null;
  });
  for (const [id, action, amount] of [
    [0, 'raise', 100],
    [1, 'raise', 300],
    [2, 'raise', 500],
    [3, 'call'],
  ])
    act(g, id, action, amount);
  assert.equal(g.phase, 'between');
  assert.equal(g.revealed, true);
  assert.deepEqual(
    partitionPots(g).pots.map((p) => p.amount),
    [400, 600, 400],
  );
  advanceStreet(g);
  assert.deepEqual(g.payouts, [400, 600, 400, 0, 0, 0]);
  conserve(g, 11400);
});
check('short stack is exposed only when the other deep stacks can no longer bet', () => {
  const g = fixture([0, 0, 0]);
  g.phase = 'playing';
  g.street = 1;
  g.board = cards('2c 3d 4h');
  g.deck = cards('5s 6s 7s 8s 9s Ts');
  g.currentBet = 0;
  g.actor = 0;
  g.dealer = 5;
  g.pending = [0, 1, 2];
  g.players.forEach((p, i) => {
    p.folded = i > 2;
    p.stack = [100, 300, 500, 5000, 5000, 5000][i];
    p.bet = 0;
    p.total = 0;
    p.actedTo = null;
  });
  act(g, 0, 'raise', 100);
  act(g, 1, 'call');
  act(g, 2, 'call');
  assert.equal(g.revealed, false);
  advanceStreet(g);
  assert.equal(g.actor, 1);
  act(g, 1, 'raise', 200);
  act(g, 2, 'call');
  assert.equal(g.revealed, true);
  assert.deepEqual(
    partitionPots(g).pots.map((p) => p.amount),
    [300, 400],
  );
  assert.equal(g.players[2].stack, 200);
  advanceStreet(g);
  assert.equal(g.phase, 'between');
  advanceStreet(g);
  conserve(g, 15900);
});
check('pot odds exclude side pots beyond the short stack cap', () => {
  const g = fixture([0, 100, 100]);
  assert.equal(contestableAfterCall(g, 0, 25), 75);
  assert.equal(contestableAfterCall(g, 0, 100), 300);
});
check('several short allins can cumulatively reopen raising', () => {
  const g = fixture([100, 100, 100, 100]);
  g.phase = 'playing';
  g.currentBet = 100;
  g.minRaise = 100;
  g.actor = 1;
  g.pending = [1, 2, 3];
  g.players[0].actedTo = 100;
  g.players[1].stack = 25;
  g.players[2].stack = 100;
  act(g, 1, 'raise', 125);
  act(g, 2, 'raise', 200);
  act(g, 3, 'call');
  assert.equal(g.actor, 0);
  assert.equal(legalActions(g, 0).canRaise, true);
  assert.equal(legalActions(g, 0).fullRaiseTo, 300);
});
check('folded players do not turn one tied pot into multiple odd-chip awards', () => {
  const g = fixture([125, 125, 25, 50, 75, 100], [2, 3, 4, 5], ['As Ah', 'Ac Ad']);
  settle(g);
  assert.equal(g.pots.length, 1);
  assert.equal(g.pots[0].amount, 500);
  assert.deepEqual(g.payouts, [250, 250, 0, 0, 0, 0]);
  conserve(g, 30000);
});
check('settlement cannot award chips twice', () => {
  const g = fixture([100, 300, 500, 500]);
  settle(g);
  const before = JSON.stringify(g);
  assert.throws(() => settle(g), /已经结算/);
  assert.equal(JSON.stringify(g), before);
});

check('three-way ties distribute one or two whole 25 chips in button order', () => {
  for (const foldedAmount of [25, 50]) {
    for (let dealer = 0; dealer < 6; dealer++) {
      const g = fixture([100, 100, 100, foldedAmount], [3]);
      g.board = cards('As Ks Qs Js Ts');
      g.dealer = dealer;
      settle(g);
      assert.equal(g.pots.length, 1);
      assert.equal(g.pots[0].amount, 300 + foldedAmount);
      const order = [0, 1, 2].sort((a, b) => ((a - dealer + 5) % 6) - ((b - dealer + 5) % 6));
      assert.deepEqual(
        g.pots[0].awards.map((a) => a.id),
        order,
      );
      assert.deepEqual(
        g.pots[0].awards.map((a) => a.amount),
        foldedAmount === 25 ? [125, 100, 100] : [125, 125, 100],
      );
      conserve(g, 30000);
    }
  }
});

check('settlement rejects an off-grid ledger without changing balances or results', () => {
  const g = fixture([100, 100, 25], [2]);
  g.players[2].total = 26;
  const before = JSON.stringify(g);
  assert.throws(() => settle(g), /25/);
  assert.equal(JSON.stringify(g), before);
});
