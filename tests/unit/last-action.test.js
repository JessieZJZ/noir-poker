import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  newGame,
  startHand,
  act,
  advanceStreet,
  restartHand,
  potSize,
  completeBoardForPractice,
} from '../../src/engine/poker.js';
const copy = (value) => JSON.parse(JSON.stringify(value));
const wealth = (g) =>
  g.players.reduce((sum, p) => sum + p.stack, 0) + (g.phase === 'done' ? 0 : potSize(g));

test('preflop all-in sizes and bet level survive every runout street and payout', () => {
  const g = newGame();
  startHand(g);
  const raiser = g.actor;
  act(g, raiser, 'raise', 5000);
  while (g.phase === 'playing') act(g, g.actor, 'call');
  const final = copy(g.players.map((p) => p.lastAction));
  assert.equal(final[raiser].text, '2-bet 全下至 5000');
  while (g.phase !== 'done') {
    advanceStreet(g);
    assert.deepEqual(
      g.players.map((p) => p.lastAction),
      final,
    );
  }
  assert.equal(g.board.length, 5);
  assert.equal(wealth(g), 30000);
  for (const p of g.players) {
    assert.equal(p.lastAction.street, 0);
    assert.equal(p.lastAction.bet, 5000);
    assert.equal(p.bet, 0);
    assert.match(p.lastAction.text, /5000$/);
  }
});

test('a later action replaces the retained action, while street resets preserve call and fold context', () => {
  const g = newGame();
  startHand(g);
  act(g, 3, 'raise', 150);
  act(g, 4, 'call');
  act(g, 5, 'fold');
  while (g.phase === 'playing') act(g, g.actor, 'call');
  advanceStreet(g);
  assert.equal(g.players[4].action, '');
  assert.deepEqual(g.players[4].lastAction, { text: '跟注 150', street: 0, bet: 150 });
  act(g, 1, 'raise', 100);
  act(g, 2, 'call');
  act(g, 3, 'fold');
  act(g, 4, 'call');
  act(g, 0, 'call');
  advanceStreet(g);
  assert.deepEqual(g.players[4].lastAction, { text: '跟注 100', street: 1, bet: 100 });
  assert.deepEqual(g.players[3].lastAction, { text: '弃牌', street: 1, bet: 0 });
  assert.deepEqual(g.players[5].lastAction, { text: '弃牌', street: 0, bet: 0 });
  act(g, 1, 'check');
  assert.deepEqual(g.players[1].lastAction, { text: '过牌', street: 2, bet: 0 });
  assert.equal(wealth(g), 30000);
});

test('uncalled refunds and practice cards retain the original shove; retry and next hand restore fresh actions', () => {
  const g = newGame();
  startHand(g);
  const raiser = g.actor;
  act(g, raiser, 'raise', 5000);
  const shoved = copy(g.players[raiser].lastAction);
  while (g.phase === 'playing') act(g, g.actor, 'fold');
  assert.equal(g.phase, 'done');
  assert.ok(g.refunds.some((r) => r.id === raiser && r.amount > 0));
  assert.deepEqual(g.players[raiser].lastAction, shoved);
  assert.equal(g.board.length, 0);
  completeBoardForPractice(g);
  assert.equal(g.practiceBoard.length, 5);
  assert.equal(g.board.length, 0);
  assert.deepEqual(g.players[raiser].lastAction, shoved);
  restartHand(g);
  assert.equal(g.players[raiser].lastAction, null);
  assert.equal(g.practiceBoard, null);
  assert.equal(g.players.filter((p) => p.lastAction).length, 2);
  while (g.phase === 'playing') act(g, g.actor, 'fold');
  startHand(g);
  assert.equal(g.players.filter((p) => p.lastAction).length, 2);
  assert.ok(
    g.players.filter((p) => p.lastAction).every((p) => /^(小盲|大盲) /.test(p.lastAction.text)),
  );
  assert.equal(wealth(g), 30000);
});
