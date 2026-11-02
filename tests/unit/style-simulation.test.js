import test from 'node:test';
import assert from 'node:assert/strict';
import * as engine from '../../src/engine/poker.js';
import {
  freshSimulationGame,
  carrySimulationMemory,
} from '../../scripts/style-simulation-game.mjs';

test('independent style samples restore all 5–9 seats after elimination and keep the button rotation', () => {
  for (let count = 5; count <= 9; count++) {
    const prior = freshSimulationGame(engine, count, 0, 'hard');
    engine.startHand(prior);
    prior.players[1].out = true;
    prior.players[1].stack = 0;
    prior.over = { reason: 'finished' };
    for (let hand = 1; hand <= count; hand++) {
      const game = freshSimulationGame(engine, count, hand, 'normal');
      engine.startHand(game);
      assert.equal(game.dealer, hand % count);
      assert.equal(game.hand, hand + 1);
      assert.equal(game.over, null);
      assert.equal(game.emotionMode, 'off');
      assert.equal(game.players.filter((p) => !p.out && p.hole.length === 2).length, count);
      assert.equal(new Set(game.players.map((p) => engine.seatPosition(game, p.id))).size, count);
      assert.equal(
        game.players.reduce((sum, p) => sum + p.stack + p.total, 0),
        count * game.stakes.startingStack,
      );
    }
  }
});

test('fixed-depth block memory carries visible history and mood without inheriting elimination or future cards', () => {
  const previous = freshSimulationGame(engine, 5, 0, 'hard');
  previous.players[1].publicReads = [{ hands: 1, raisingHands: 1 }];
  previous.players[1].botMood.kind = 'reactive';
  previous.players[1].out = true;
  previous.players[1].stack = 0;
  previous.players[1].hole = [{ rank: 14, suit: 0 }];
  const next = freshSimulationGame(engine, 5, 1, 'hard');
  carrySimulationMemory(previous, next);
  assert.deepEqual(next.players[1].publicReads, previous.players[1].publicReads);
  assert.equal(next.players[1].botMood.kind, 'reactive');
  assert.equal(next.players[1].out, false);
  assert.equal(next.players[1].stack, next.stakes.startingStack);
  assert.deepEqual(next.players[1].hole, []);
  next.players[1].publicReads[0].raisingHands = 0;
  assert.equal(previous.players[1].publicReads[0].raisingHands, 1);
});
