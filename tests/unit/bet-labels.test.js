import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  newGame,
  startHand,
  act,
  advanceStreet,
  legalActions,
  potSize,
  restartHand,
} from '../../src/engine/poker.js';
import { nextBetLevel, actionLabel, historyActionLabel } from '../../src/engine/action-labels.js';

const wealth = (g) =>
  g.players.reduce((sum, p) => sum + p.stack, 0) + (g.phase === 'done' ? 0 : potSize(g));
const nextLabel = (g, amount) =>
  actionLabel({ ...g, legal: legalActions(g), action: 'raise', amount });

test('preflop 2/3/4-bets survive intervening calls and before-action review snapshots', () => {
  const g = newGame();
  g.dealer = 5;
  startHand(g, () => 0.5);
  while (g.actor !== 0) act(g, g.actor, 'fold');
  assert.equal(nextLabel(g, 150), '2-bet 开池至 150');
  act(g, 0, 'raise', 150);
  act(g, 1, 'call');
  assert.equal(nextLabel(g, 650), '3-bet 加注至 650');
  act(g, 2, 'raise', 650);
  act(g, 0, 'call');
  assert.equal(nextLabel(g, 1800), '4-bet 加注至 1,800');
  act(g, 1, 'raise', 1800);
  act(g, 2, 'call');
  act(g, 0, 'call');
  assert.equal(actionLabel(g.decisions[0]), '2-bet 开池至 150');
  assert.equal(actionLabel(g.decisions[2], 'raise', 3000), '5-bet 加注至 3,000');
  assert.deepEqual(
    g.history.filter((a) => a.action === 'raise').map((a) => a.betLabel),
    ['2-bet 开池至', '3-bet 加注至', '4-bet 加注至'],
  );
  assert.ok(g.logs.some((a) => a.text.includes('3-bet 加注至 650')));
  assert.equal(wealth(g), 30000);

  advanceStreet(g);
  assert.equal(nextLabel(g, 100), '1-bet 下注至 100');
  act(g, 1, 'check');
  act(g, 2, 'raise', 100);
  act(g, 0, 'call');
  assert.equal(nextLabel(g, 300), '2-bet 加注至 300');
  act(g, 1, 'raise', 300);
  act(g, 2, 'call');
  act(g, 0, 'call');
  advanceStreet(g);
  assert.equal(nextLabel(g, 100), '1-bet 下注至 100');
  assert.equal(wealth(g), 30000);
});

test('short all-in has an ordinal without reopening a prior bettor; all-in calls add no level', () => {
  const g = newGame();
  g.dealer = 5;
  g.players[2].stack = 175;
  g.players[3].stack = 100;
  const chips = wealth(g);
  startHand(g, () => 0.5);
  while (g.phase === 'playing') act(g, g.actor, 'call');
  advanceStreet(g);
  act(g, 1, 'raise', 100);
  assert.equal(nextLabel(g, 125), '2-bet 短全下至 125');
  act(g, 2, 'raise', 125);
  assert.equal(g.players[2].action, '2-bet 短全下至 125');
  assert.equal(g.minRaise, 100);
  act(g, 3, 'call');
  assert.equal(nextBetLevel(g), 3);
  act(g, 4, 'call');
  act(g, 5, 'call');
  act(g, 0, 'call');
  assert.equal(g.actor, 1);
  assert.equal(legalActions(g).raiseReopened, false);
  assert.equal(legalActions(g).canRaise, false);
  assert.equal(
    historyActionLabel(
      g.history,
      g.history.findIndex((a) => a.betLabel?.includes('短全下')),
    ),
    '2-bet 短全下至 125',
  );
  assert.equal(wealth(g), chips);
});

test('historical ordinals use the complete street before truncation; other streets and folds do not count', () => {
  const history = [{ street: 0, action: 'raise', amount: 150 }];
  for (let i = 1; i <= 6; i++) {
    history.push({ street: 1, action: 'raise', amount: 100 * i });
    history.push({ street: 1, action: 'call', amount: 100 });
    history.push({ street: 1, action: 'fold', amount: 0 });
  }
  const tail = history.map((a, index) => historyActionLabel(history, index)).slice(-6);
  assert.deepEqual(tail, [
    '5-bet 加注至 500',
    '跟注 100',
    '弃牌',
    '6-bet 加注至 600',
    '跟注 100',
    '弃牌',
  ]);
  assert.equal(nextBetLevel({ street: 2, history }), 1);
});

test('retry clears prior raise sequence and starts again at 2-bet', () => {
  const g = newGame();
  g.dealer = 2;
  startHand(g, () => 0.5);
  act(g, 0, 'raise', 150);
  while (g.phase === 'playing') act(g, g.actor, 'fold');
  restartHand(g);
  assert.equal(g.history.length, 0);
  assert.equal(nextLabel(g, 150), '2-bet 开池至 150');
  assert.equal(wealth(g), 30000);
});
