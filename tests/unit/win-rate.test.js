import test from 'node:test';
import assert from 'node:assert/strict';
import { compare, deckOfCards, evaluate } from '../../src/engine/poker.js';
import {
  calculateOuts,
  cardMasks,
  createWinRateRun,
  handStrength,
} from '../../src/engine/win-rate.js';
import { createWinRateSession, MAX_WIN_RATE_PLAYERS } from '../../src/engine/win-rate-session.js';

const SUIT = { s: 0, h: 1, c: 2, d: 3 };
const RANK = { T: 10, J: 11, Q: 12, K: 13, A: 14 };
const deck = deckOfCards();
const card = (text) => {
  const rank = RANK[text[0]] ?? Number(text[0]);
  return deck.find((entry) => entry.rank === rank && entry.suit === SUIT[text[1]]);
};
const cards = (text) => text.split(' ').map(card);
const finish = (run) => {
  while (!run.step(4096));
  return run.result();
};
const score = (hand) => handStrength(...cardMasks(hand));
const percent = (value) => Number((value * 100).toFixed(2));
function seeded(seed) {
  let value = seed;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 2 ** 32;
  };
}
function draw(random, count) {
  const pool = [...deck];
  return Array.from({ length: count }, () => {
    const index = Math.floor(random() * pool.length);
    return pool.splice(index, 1)[0];
  });
}

test('packed hand strength orders hands exactly like the settlement evaluator', () => {
  const random = seeded(20261101);
  for (const size of [5, 6, 7])
    for (let i = 0; i < 4000; i++) {
      const a = draw(random, size),
        b = draw(random, size);
      assert.equal(
        Math.sign(score(a) - score(b)),
        compare(evaluate(a).score, evaluate(b).score),
        `${a.map((c) => c.key)} vs ${b.map((c) => c.key)}`,
      );
    }
});

test('packed hand strength keeps every ranking boundary', () => {
  const ladder = [
    '2s 3h 4c 5d 7s 9h Jc',
    '2s 2h 4c 5d 7s 9h Jc',
    '2s 2h 4c 4d 7s 9h Jc',
    '2s 2h 2c 5d 7s 9h Jc',
    'As 2h 3c 4d 5s 9h Jc',
    '6s 7h 8c 9d Ts 2h 3c',
    'Ts Jh Qc Kd As 2h 3c',
    '2s 4s 6s 8s Ts Kh 3c',
    '2s 2h 2c 3d 3s 9h Jc',
    '2s 2h 2c 3d 3s 3h Jc',
    '2s 2h 2c 2d 3s 9h Jc',
    'As 2s 3s 4s 5s 9h Jc',
    '6s 7s 8s 9s Ts 2h 3c',
    'Ts Js Qs Ks As 2h 3c',
  ].map((hand) => score(cards(hand)));
  for (let i = 1; i < ladder.length; i++) assert.ok(ladder[i] > ladder[i - 1], `step ${i}`);
  assert.equal(score(cards('As Ks Qd Jd 9c 3h 2h')), score(cards('Ah Kd Qc Js 9d 8h 7h')) - 0);
});

test('exact equity matches a settlement brute force on the reference flop', () => {
  const hands = [cards('As Ks'), cards('8s 7s'), cards('Tc Th')],
    board = cards('6s Js Jc'),
    result = finish(createWinRateRun({ hands, board }));
  const known = new Set([...hands.flat(), ...board].map((c) => c.key)),
    rest = deck.filter((c) => !known.has(c.key));
  const wins = [0, 0, 0],
    ties = [0, 0, 0];
  let total = 0;
  for (let i = 0; i < rest.length; i++)
    for (let j = i + 1; j < rest.length; j++) {
      const scores = hands.map((hand) => evaluate([...hand, ...board, rest[i], rest[j]]).score);
      const top = scores.reduce((best, entry) => (compare(entry, best) > 0 ? entry : best));
      const winners = scores.flatMap((entry, id) => (compare(entry, top) === 0 ? [id] : []));
      if (winners.length === 1) wins[winners[0]]++;
      else winners.forEach((id) => ties[id]++);
      total++;
    }
  assert.equal(result.samples, 903);
  assert.equal(total, result.samples);
  result.players.forEach((player, i) => {
    assert.equal(player.win, wins[i] / total);
    assert.equal(player.tie, ties[i] / total);
  });
  // The reference video counts ties as wins, so its row equals win + tie.
  assert.deepEqual(
    result.players.map((player) => percent(player.win + player.tie)),
    [45.18, 3.32, 52.16],
  );
  assert.ok(Math.abs(result.players.reduce((sum, p) => sum + p.equity, 0) - 1) < 1e-9);
});

test('exact preflop equity counts every runout', () => {
  const result = finish(createWinRateRun({ hands: [cards('As Ks'), cards('8s 7s')], board: [] }));
  assert.equal(result.samples, 1712304);
  assert.deepEqual(
    result.players.map((player) => percent(player.win + player.tie)),
    [63.79, 36.75],
  );
});

test('sampling stays inside its stated margin of the exact answer', () => {
  const input = { hands: [cards('As Ks'), cards('8s 7s'), cards('Tc Th')], board: [] },
    exact = finish(createWinRateRun({ hands: input.hands, board: cards('6s') })),
    run = createWinRateRun({ hands: input.hands, board: cards('6s') }, { trials: 60000, seed: 7 }),
    sampled = finish(run);
  assert.equal(sampled.method, 'sampling');
  assert.equal(sampled.samples, 60000);
  sampled.players.forEach((player, i) =>
    assert.ok(Math.abs(player.equity - exact.players[i].equity) < sampled.margin),
  );
});

test('a complete board settles immediately and dead cards leave the runout', () => {
  const river = finish(
    createWinRateRun({ hands: [cards('As Ah'), cards('Ks Kh')], board: cards('2c 7d 9h Jc 3s') }),
  );
  assert.equal(river.samples, 1);
  assert.equal(river.players[0].win, 1);
  const chop = finish(
    createWinRateRun({ hands: [cards('2s 3h'), cards('2h 3s')], board: cards('Ac Kc Qc Jc Tc') }),
  );
  assert.deepEqual(
    chop.players.map(({ win, tie, equity }) => [win, tie, equity]),
    [
      [0, 1, 0.5],
      [0, 1, 0.5],
    ],
  );
  const dead = finish(
    createWinRateRun({
      hands: [cards('As Ks'), cards('8s 7s')],
      board: cards('6s Js Jc'),
      dead: [card('Qs')],
    }),
  );
  assert.equal(dead.samples, 946);
});

test('outs list the cards that take the outright lead, sorted like the picker', () => {
  const hands = [cards('As Ks'), cards('8s 7s'), cards('Tc Th')];
  const outs = calculateOuts({ hands, board: cards('6s Js Jc') });
  assert.equal(outs[2], null);
  assert.deepEqual(outs[1], []);
  assert.deepEqual(
    outs[0].map((c) => c.key),
    ['0-12', '0-9', '0-5', '0-4', '0-3', '0-2', '1-14', '1-13', '2-14', '2-13', '3-14', '3-13'],
  );
  assert.equal(outs[0].length, 12);
  assert.ok(!outs[0].some((c) => c.key === '0-10'), 'T♠ fills up the leader, so it is not an out');
  assert.deepEqual(calculateOuts({ hands, board: [] }), [null, null, null]);
  assert.deepEqual(calculateOuts({ hands, board: cards('6s Js Jc 2d 3d') }), [null, null, null]);
  // Tied hands both still need a card, so neither is reported as the leader.
  const level = calculateOuts({
    hands: [cards('Qh 4s'), cards('Qd 4c')],
    board: cards('Ah Kc 9d'),
  });
  assert.ok(level.every(Array.isArray));
});

function fakeClock(step) {
  let time = 0,
    id = 0;
  const pending = new Map();
  return {
    now: () => (time += step),
    setTimer(callback) {
      pending.set(++id, callback);
      return id;
    },
    clearTimer: (timer) => pending.delete(timer),
    pending,
    runNext() {
      const [[timer, callback]] = pending;
      pending.delete(timer);
      callback();
    },
  };
}
function pickAll(session, ...texts) {
  for (const text of texts) session.pick(card(text));
}

test('session auto-advances within a hand and the flop, then returns to the table', () => {
  const session = createWinRateSession();
  session.openPlayer(0, 0);
  session.pick(card('As'));
  assert.deepEqual(session.view().target, { type: 'player', id: 0, index: 1 });
  session.pick(card('As'));
  assert.deepEqual(session.view().target, { type: 'player', id: 0, index: 1 }, 'used card ignored');
  session.pick(card('Ks'));
  assert.equal(session.view().target, null);
  assert.equal(session.view().status, 'idle');
  session.openPlayer(1, 0);
  pickAll(session, '8s', '7s');
  assert.equal(session.view().status, 'computing');
  session.pause();
  session.openBoard(4);
  assert.deepEqual(
    session.view().target,
    { type: 'board', index: 0 },
    'empty streets deal in order',
  );
  pickAll(session, '6s', 'Js', 'Jc');
  assert.equal(session.view().target, null);
  session.openBoard(3);
  session.pick(card('2d'));
  assert.equal(session.view().target, null, 'the turn is a single street');
  session.openBoard(0);
  session.pick(card('6h'));
  assert.equal(session.view().target, null);
  session.openBoard(0);
  session.clearTarget();
  assert.equal(session.view().board[0], null);
  assert.equal(session.view().used.includes('1-6'), false);
});

test('session keeps at least one opponent, caps the table and clears cleanly', () => {
  const session = createWinRateSession();
  assert.equal(session.view().players[1].removable, false);
  session.removeOpponent(1);
  assert.equal(session.view().players.length, 2);
  while (session.view().canAdd) session.addOpponent();
  assert.equal(session.view().players.length, MAX_WIN_RATE_PLAYERS);
  session.addOpponent();
  assert.equal(session.view().players.length, MAX_WIN_RATE_PLAYERS);
  const { players } = session.view();
  assert.equal(players[0].removable, false);
  assert.ok(players.slice(1).every((player) => player.removable));
  session.removeOpponent(players[0].id);
  assert.equal(session.view().players.length, MAX_WIN_RATE_PLAYERS);
  session.removeOpponent(players[3].id);
  assert.deepEqual(
    session.view().players.map((player) => player.number),
    [0, 1, 2, 3, 4, 5, 6, 7],
  );
  session.clear();
  assert.equal(session.view().players.length, 2);
  assert.equal(session.view().used.length, 0);
});

test('session finishes flops in the first slice and ignores unfinished rows', () => {
  const session = createWinRateSession();
  session.openBoard(0);
  pickAll(session, '6s', 'Js', 'Jc');
  session.openPlayer(0, 0);
  pickAll(session, 'As', 'Ks');
  session.openPlayer(1, 0);
  pickAll(session, 'Tc', 'Th');
  let view = session.view();
  assert.equal(view.status, 'ready');
  assert.equal(view.method, 'exact');
  assert.equal(view.players[1].result.outs, null);
  const heads = view.players[0].result.win;
  session.addOpponent();
  assert.equal(session.view().status, 'ready');
  assert.equal(session.view().players[2].result, null);
  assert.equal(session.view().players[0].result.win, heads, 'a blank row changes nothing');
  const third = session.view().players[2].id;
  session.openPlayer(third, 0);
  session.pick(card('8s'));
  session.closePicker();
  assert.equal(session.view().samples, 946, 'a held card leaves the runout');
  session.openPlayer(third, 1);
  session.pick(card('7s'));
  view = session.view();
  assert.equal(view.samples, 903);
  assert.deepEqual(
    view.players.map((player) => percent(player.result.win + player.result.tie)),
    [45.18, 52.16, 3.32],
  );
  session.removeOpponent(third);
  assert.equal(session.view().samples, 990);
  assert.equal(session.view().players[0].result.win, heads);
});

function preflopSession(clock, onChange) {
  const session = createWinRateSession({ ...clock, onChange });
  session.openPlayer(0, 0);
  pickAll(session, 'As', 'Ks');
  session.openPlayer(1, 0);
  pickAll(session, '8s', '7s');
  return session;
}

test('session slices long runs and cancels them when the input or page changes', () => {
  const clock = fakeClock(1);
  const session = preflopSession(clock);
  assert.equal(session.view().status, 'computing');
  assert.equal(session.view().players[0].result, null);
  assert.equal(clock.pending.size, 1);
  const stale = [...clock.pending.keys()][0];
  session.openBoard(0);
  session.pick(card('2d'));
  assert.equal(clock.pending.has(stale), false, 'a new card cancels the running slice');
  assert.equal(clock.pending.size, 1);
  session.pause();
  assert.equal(clock.pending.size, 0, 'closing the page leaves no timer');
  assert.equal(session.view().status, 'idle');
  session.resume();
  assert.equal(session.view().status, 'computing');
  session.clear();
  assert.equal(clock.pending.size, 0);
  assert.equal(session.view().status, 'idle');
});

test('session finishes a sliced exact run and reports the final result once', () => {
  const clock = fakeClock(0.01);
  let changes = 0;
  const session = preflopSession(clock, () => changes++);
  const before = changes;
  while (clock.pending.size) clock.runNext();
  assert.equal(changes, before + 1);
  const view = session.view();
  assert.equal(view.status, 'ready');
  assert.equal(view.method, 'exact');
  assert.equal(view.samples, 1712304);
});

test('session falls back to labelled sampling on a runtime too slow to enumerate', () => {
  const clock = fakeClock(25);
  const session = preflopSession(clock);
  while (clock.pending.size) clock.runNext();
  const view = session.view();
  assert.equal(view.status, 'ready');
  assert.equal(view.method, 'sampling');
  assert.ok(view.samples > 0 && view.samples < 400000);
  assert.ok(view.margin > 0);
  assert.ok(Math.abs(view.players.reduce((sum, p) => sum + p.result.equity, 0) - 1) < 1e-9);
});
