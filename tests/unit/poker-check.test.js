import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  deckOfCards,
  evaluate,
  compare,
  newGame,
  startHand,
  act,
  advanceStreet,
  legalActions,
  potSize,
  settle,
  botDecision,
} from '../../src/engine/poker.js';
const deck = deckOfCards(),
  cards = (s) =>
    s.split(' ').map((v) => {
      const ranks = '23456789TJQKA',
        suits = 'shcd';
      return deck.find((c) => c.rank === ranks.indexOf(v[0]) + 2 && c.suit === suits.indexOf(v[1]));
    });
let cases = 0;
const check = (name, fn) => test(name, fn);
check('52 unique cards', () => assert.equal(new Set(deck.map((c) => c.key)).size, 52));
for (const [input, category] of [
  ['As Ks Qs Js Ts 2h 3c', 8],
  ['Ac Ah As Ad Kh 2s 3s', 7],
  ['Ac Ah As Kd Kh Qs Qh', 6],
  ['As Js 9s 5s 3s Kh Qh', 5],
  ['As 2h 3c 4d 5s Kh Qh', 4],
  ['As Ah Ac 9d 8s 2h 3h', 3],
  ['As Ah Kc Kd Qs 2h 3h', 2],
  ['As Ah Kc Qd 9s 2h 3h', 1],
  ['As Kh Qc Jd 9s 2h 3h', 0],
])
  check('rank ' + category, () => assert.equal(evaluate(cards(input)).score[0], category));
check('wheel loses to six high', () =>
  assert.equal(
    compare(evaluate(cards('As 2h 3c 4d 5s')).score, evaluate(cards('2s 3h 4c 5d 6s')).score),
    -1,
  ),
);
check('best full house from two trips', () =>
  assert.deepEqual(evaluate(cards('As Ah Ac Ks Kh Kc 2s')).score, [6, 14, 13]),
);
check('kicker decides', () =>
  assert.equal(
    compare(evaluate(cards('As Ah Kc Qd 9s')).score, evaluate(cards('Ad Ac Kd Jh 9h')).score),
    1,
  ),
);
check('blinds and big blind option', () => {
  const g = newGame();
  startHand(g);
  assert.equal(g.actor, 3);
  assert.equal(potSize(g), 75);
  for (let i = 0; i < 6; i++) act(g, g.actor, 'call');
  assert.equal(g.phase, 'between');
  assert.equal(potSize(g), 300);
  advanceStreet(g);
  assert.equal(g.board.length, 3);
  assert.equal(g.actor, 1);
});
check('folds award pot without board', () => {
  const g = newGame();
  startHand(g);
  for (let i = 0; i < 5; i++) act(g, g.actor, 'fold');
  assert.equal(g.phase, 'done');
  assert.equal(g.winners[0].id, 2);
  assert.equal(
    g.players.reduce((s, p) => s + p.stack, 0),
    30000,
  );
});
check('side pots and uncalled return', () => {
  const g = newGame();
  g.board = cards('2c 3d 7s 9h Jc');
  const hands = ['As Ah', 'Ks Kh', 'Qs Qh'];
  g.players.forEach((p, i) => {
    p.folded = i > 2;
    p.total = [100, 300, 500, 0, 0, 0][i];
    p.stack = 5000 - p.total;
    p.hole = i < 3 ? cards(hands[i]) : cards('4s 5h');
  });
  settle(g, true);
  assert.deepEqual(g.payouts, [300, 400, 200, 0, 0, 0]);
  assert.equal(
    g.players.reduce((s, p) => s + p.stack, 0),
    30000,
  );
});
check('board tie splits main pot', () => {
  const g = newGame();
  g.board = cards('As Ks Qs Js Ts');
  g.players.forEach((p, i) => {
    p.folded = i > 1;
    p.total = i < 2 ? 100 : 0;
    p.stack = 5000 - p.total;
    p.hole = cards(i === 0 ? '2h 3h' : '4c 5c');
  });
  settle(g, true);
  assert.deepEqual(g.payouts, [100, 100, 0, 0, 0, 0]);
});
check('short allin does not reopen completed raise', () => {
  const g = newGame();
  g.phase = 'playing';
  g.street = 1;
  g.currentBet = 100;
  g.minRaise = 100;
  g.actor = 1;
  g.pending = [1, 2];
  g.players.forEach((p, i) => {
    p.folded = i > 2;
    p.bet = i < 3 ? 100 : 0;
    p.total = p.bet;
    p.stack = i === 1 ? 50 : 1000;
    p.actedTo = i === 0 ? 100 : null;
  });
  act(g, 1, 'raise', 150);
  act(g, 2, 'call');
  assert.equal(g.actor, 0);
  assert.equal(legalActions(g, 0).canRaise, false);
  assert.throws(() => act(g, 0, 'raise', 250));
  act(g, 0, 'call');
  assert.equal(g.phase, 'between');
});
check('invalid action preserves state', () => {
  const g = newGame();
  startHand(g);
  const before = JSON.stringify(g);
  assert.throws(() => act(g, 0, 'call'));
  assert.equal(JSON.stringify(g), before);
  assert.throws(() => act(g, 3, 'check'));
  assert.equal(JSON.stringify(g), before);
});
check('200 randomized hands conserve chips and end', () => {
  for (let trial = 0; trial < 200; trial++) {
    const g = newGame();
    startHand(g);
    let turns = 0;
    while (g.phase !== 'done') {
      assert.ok(turns++ < 600, 'hand stalled');
      if (g.phase === 'between') {
        advanceStreet(g);
        continue;
      }
      const id = g.actor,
        l = legalActions(g),
        r = Math.random();
      assert.ok(l.enabled);
      if (r < 0.16) act(g, id, 'fold');
      else if (r < 0.43 && l.canRaise) {
        const amount = Math.random() < 0.25 ? l.maxRaiseTo : l.minRaiseTo;
        act(g, id, 'raise', amount);
      } else act(g, id, 'call');
      for (const p of g.players) {
        assert.ok(p.stack >= 0);
        for (const value of [p.stack, p.bet, p.total]) assert.equal(value % 25, 0);
      }
      assert.equal(
        g.players.reduce((s, p) => s + p.stack, 0) + (g.phase === 'done' ? 0 : potSize(g)),
        30000,
      );
    }
    assert.equal(
      g.players.reduce((s, p) => s + p.stack, 0),
      30000,
    );
  }
});
check('actual bot decisions are legal for 12 hands', () => {
  for (let trial = 0; trial < 12; trial++) {
    const g = newGame();
    startHand(g);
    let guard = 0;
    while (g.phase !== 'done') {
      assert.ok(guard++ < 300);
      if (g.phase === 'between') advanceStreet(g);
      else {
        const d = botDecision(g);
        act(g, g.actor, d.action, d.amount);
      }
    }
    assert.equal(
      g.players.reduce((s, p) => s + p.stack, 0),
      30000,
    );
  }
});
