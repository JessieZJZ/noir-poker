import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluate,
  compare,
  deckOfCards,
  newGame,
  startHand,
  act,
  advanceStreet,
  legalActions,
} from '../../src/engine/poker.js';
import { stakesFromSmallBlind } from '../../src/engine/stakes.js';
import { legacyEvaluate } from '../fixtures/legacy-hand-evaluation.js';
import { cards } from '../fixtures/deceptive-decisions.js';
const random = (seed) => () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;

test('fast Holdem ranking retains the exact winning five and order at category boundaries', () => {
  for (const text of [
    'As Ks Qs Js Ts 2d 3h',
    'As 2s 3s 4s 5s Kh Kd',
    'Ah Ad Ac As Kc Kh Qh',
    'Ah Ad Ac Kh Kd Kc Qh',
    '2h 2d 2c As Ad Ac Kh',
    'As Qs Js 9s 8s 4s 2s',
    'As 2h 3c 4d 5s 6h 7c',
    'Ah Ad Kh Kd Qh Qd Js',
    'Ah Ad Kh Kd Qh Qd Ac',
    'As Ah Kd Qc Jh Ts 9c',
    'Ac Ad Kh Qs Jc 9d 8h',
    'As Kd Qc Jh 9s 8d 2c',
    '2s 2h 2c 3d 3s',
    'As 2h',
    'As Kd Qc Jh Ts 9s 8d 7h',
  ]) {
    const hand = cards(text);
    assert.deepEqual(evaluate(hand), legacyEvaluate(hand), text);
  }
});

test('all 2598960 physical five-card hands have the established category frequencies', () => {
  const deck = deckOfCards(),
    frequencies = Array(9).fill(0);
  for (let a = 0; a < 48; a++)
    for (let b = a + 1; b < 49; b++)
      for (let c = b + 1; c < 50; c++)
        for (let d = c + 1; d < 51; d++)
          for (let e = d + 1; e < 52; e++)
            frequencies[evaluate([deck[a], deck[b], deck[c], deck[d], deck[e]]).score[0]]++;
  assert.deepEqual(frequencies, [1302540, 1098240, 123552, 54912, 10200, 5108, 3744, 624, 40]);
});

test('60000 seeded six/seven-card deals match the historical subset oracle exactly', () => {
  const rng = random(20261026),
    deck = deckOfCards();
  for (let i = 0; i < 60000; i++) {
    const pool = [...deck],
      hand = [];
    for (let j = 0; j < 6 + (i % 2); j++)
      hand.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
    assert.deepEqual(evaluate(hand), legacyEvaluate(hand), hand.map((c) => c.key).join(' '));
  }
});

for (const count of [5, 6, 7, 8, 9])
  test(`${count}-seat all-in settlements preserve oracle winners and whole-chip bankrolls`, () => {
    for (const smallBlind of [25, 100, 50000]) {
      const g = newGame(count, stakesFromSmallBlind(smallBlind));
      const rng = random(20261026 + count + smallBlind);
      const bankroll = g.players.reduce((sum, p) => sum + p.stack, 0);
      startHand(g, rng);
      while (g.phase !== 'done') {
        if (g.phase === 'between') advanceStreet(g);
        else {
          const legal = legalActions(g);
          act(
            g,
            g.actor,
            legal.canRaise ? 'raise' : legal.canCheck ? 'check' : 'call',
            legal.maxRaiseTo,
          );
        }
      }
      const scores = g.players.map((p) => legacyEvaluate([...p.hole, ...g.board]).score);
      const best = scores.reduce((a, b) => (compare(a, b) >= 0 ? a : b));
      assert.deepEqual(
        g.winners.map((w) => w.id).sort(),
        scores.flatMap((s, id) => (compare(s, best) === 0 ? [id] : [])).sort(),
      );
      assert.equal(
        g.players.reduce((sum, p) => sum + p.stack, 0),
        bankroll,
      );
      assert.ok(g.players.every((p) => p.stack % g.chipUnit === 0));
    }
  });
