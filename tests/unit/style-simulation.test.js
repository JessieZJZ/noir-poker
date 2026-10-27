import test from 'node:test';
import assert from 'node:assert/strict';
import * as engine from '../../src/engine/poker.js';
import { freshSimulationGame } from '../../scripts/style-simulation-game.mjs';

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
