import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  newGame,
  startHand,
  seatPosition,
  act,
  advanceStreet,
  legalActions,
  botDecision,
  deckOfCards,
  settle,
  potSize,
} from '../../src/engine/poker.js';
import { winningScenes, HAND_MOTIONS } from '../../src/ui/showdown.js';
const deck = deckOfCards(),
  cards = (s) =>
    s
      .split(' ')
      .map((v) =>
        deck.find(
          (c) => c.rank === '23456789TJQKA'.indexOf(v[0]) + 2 && c.suit === 'shcd'.indexOf(v[1]),
        ),
      );
let passed = 0;
const check = (name, fn) => test(name, fn);
check('six seats by default; unsupported counts rejected', () => {
  assert.equal(newGame().players.length, 6);
  for (const n of [4, 10, 6.5, '9', NaN]) assert.throws(() => newGame(n));
});
for (let n = 5; n <= 9; n++)
  for (let d = 0; d < n; d++)
    check(`${n} players button ${d}: all four rounds and immediate river reveal`, () => {
      const g = newGame(n);
      g.dealer = (d + n - 1) % n;
      startHand(g);
      assert.equal(g.dealer, d);
      assert.equal(g.players[(d + 1) % n].bet, 25);
      assert.equal(g.players[(d + 2) % n].bet, 50);
      assert.equal(seatPosition(g, (d + 1) % n), 'SB');
      assert.equal(seatPosition(g, (d + 2) % n), 'BB');
      assert.equal(seatPosition(g, (d + n - 1) % n), 'CO');
      assert.equal(new Set(g.players.flatMap((p) => p.hole).map((c) => c.key)).size, 2 * n);
      assert.equal(g.deck.length, 52 - 2 * n);
      for (let i = 0; i < n; i++) {
        assert.equal(g.actor, (d + 3 + i) % n);
        act(g, g.actor, 'call');
      }
      assert.equal(g.revealed, false);
      for (let street = 1; street <= 3; street++) {
        advanceStreet(g);
        for (let i = 0; i < n; i++) {
          assert.equal(g.actor, (d + 1 + i) % n);
          assert.equal(legalActions(g).canCheck, true);
          assert.equal(g.revealed, false);
          act(g, g.actor, 'check');
        }
        assert.equal(g.revealed, street === 3);
      }
      assert.equal(g.phase, 'between');
      advanceStreet(g);
      assert.equal(g.phase, 'done');
      assert.equal(g.payouts.length, n);
      assert.equal(
        g.players.reduce((a, p) => a + p.stack, 0),
        n * 5000,
      );
      assert.equal(g.deck.length, 44 - 2 * n);
    });
for (let n = 5; n <= 9; n++)
  check(`${n} players actual bots and random legal hands`, () => {
    for (let h = 0; h < 30; h++) {
      const g = newGame(n);
      startHand(g);
      let count = 0;
      while (g.phase !== 'done') {
        assert.ok(++count < 1000);
        if (g.phase === 'between') {
          advanceStreet(g);
          continue;
        }
        const legal = legalActions(g);
        let action;
        if (h < 2 && g.actor !== 0) action = botDecision(g);
        else {
          const r = Math.random();
          action =
            r < 0.13
              ? { action: 'fold' }
              : r > 0.8 && legal.canRaise
                ? { action: 'raise', amount: legal.maxRaiseTo }
                : { action: legal.canCheck ? 'check' : 'call' };
        }
        act(g, g.actor, action.action, action.amount);
      }
      assert.equal(
        g.players.reduce((a, p) => a + p.stack, 0),
        n * 5000,
      );
      assert.equal(
        g.payouts.reduce((a, b) => a + b, 0),
        potSize(g),
      );
    }
  });
for (let n = 5; n <= 9; n++)
  check(`${n} player royal board tie, all button positions odd chip order`, () => {
    for (let d = 0; d < n; d++) {
      const g = newGame(n);
      g.dealer = d;
      g.phase = 'between';
      g.street = 3;
      g.board = cards('Ts Js Qs Ks As');
      const rest = deck.filter((c) => !g.board.some((b) => b.key === c.key));
      g.players.forEach((p, i) => {
        p.hole = rest.slice(i * 2, i * 2 + 2);
        p.folded = i >= 3;
        p.total = i < 2 ? 100 : i === 2 ? 101 : 0;
        p.stack = 5000 - p.total;
      });
      settle(g);
      const main = g.pots[0];
      assert.equal(main.amount, 300);
      assert.equal(main.awards.length, 3);
      assert.equal(g.refunds[0].amount, 1);
      assert.equal(
        main.awards[0].id,
        [0, 1, 2].sort((a, b) => ((a - d + n - 1) % n) - ((b - d + n - 1) % n))[0],
      );
    }
  });
for (let n = 5; n <= 9; n++)
  check(`${n}: independent side-pot odd chip always follows button`, () => {
    for (let d = 0; d < n; d++) {
      const g = newGame(n);
      g.phase = 'between';
      g.street = 3;
      g.dealer = d;
      g.board = cards('2c 3d 4h 7s 8c');
      const rest = deck.filter(
        (c) =>
          !g.board.some((b) => b.key === c.key) &&
          !cards('As Ah Ks Kh Kc Kd').some((b) => b.key === c.key),
      );
      g.players.forEach((p, i) => {
        p.total = [100, 301, 301, 101][i] || 0;
        p.stack = 5000 - p.total;
        p.folded = i >= 3;
        p.hole =
          i === 0
            ? cards('As Ah')
            : i === 1
              ? cards('Ks Kh')
              : i === 2
                ? cards('Kc Kd')
                : rest.splice(0, 2);
      });
      settle(g);
      assert.equal(g.pots[1].amount, 403);
      assert.equal(g.pots[1].awards.length, 2);
      assert.deepEqual(
        g.pots[1].awards.map((a) => a.amount),
        [202, 201],
      );
      assert.equal(
        g.pots[1].awards[0].id,
        [1, 2].sort((a, b) => ((a - d + n - 1) % n) - ((b - d + n - 1) % n))[0],
      );
      assert.equal(
        g.players.reduce((sum, p) => sum + p.stack, 0),
        n * 5000,
      );
    }
  });
const cases = [
  ['As 4h', '2c 7d 9h Js Qc', 'high'],
  ['As Ah', '2c 7d 9h Js Qc', 'pair'],
  ['As Ah', '2c 2d 9h Js Qc', 'two-pair'],
  ['As Ah', 'Ac 7d 9h Js Qc', 'trips'],
  ['As 5h', '2c 3d 4h Js Qc', 'straight'],
  ['As 5s', '2s 7s 9s Jh Qc', 'flush'],
  ['As Ah', 'Ac 7d 7h Js Qc', 'full-house'],
  ['As Ah', 'Ac Ad 9h Js Qc', 'quads'],
  ['5s 6s', '2s 3s 4s Jh Qc', 'straight-flush'],
  ['As Ks', 'Ts Js Qs 2h 3c', 'royal'],
];
for (const [hole, board, motion] of cases)
  check(`best-five scene ${motion}`, () => {
    const g = newGame();
    g.phase = 'done';
    g.showdown = true;
    g.board = cards(board);
    g.players[0].hole = cards(hole);
    g.pots = [{ label: '主池', awards: [{ id: 0, amount: 100 }] }];
    const scenes = winningScenes(g);
    assert.equal(scenes[0].motion, motion);
    assert.equal(scenes[0].cards.length, 5);
    assert.equal(new Set(scenes[0].cards.map((c) => c.key)).size, 5);
  });
check('each contested side pot and tied award gets its own winner scene', () => {
  const g = newGame(9);
  g.phase = 'done';
  g.showdown = true;
  g.board = cards('2s 3s 4s 5s 6s');
  g.players.forEach((p, i) => (p.hole = deck.filter((c) => c.suit !== 0).slice(i * 2, i * 2 + 2)));
  g.pots = [
    {
      label: '主池',
      awards: [
        { id: 0, amount: 100 },
        { id: 8, amount: 100 },
      ],
    },
    { label: '边池 1', awards: [{ id: 7, amount: 200 }] },
  ];
  assert.equal(winningScenes(g).length, 3);
  assert.equal(winningScenes(g)[0].split, true);
  assert.equal(winningScenes(g)[2].pot, '边池 1');
  g.showdown = false;
  assert.deepEqual(winningScenes(g), []);
  assert.equal(new Set(HAND_MOTIONS).size, 9);
});
