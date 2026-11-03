import test from 'node:test';
import assert from 'node:assert/strict';
import * as engine from '../../src/engine/poker.js';
import { freshSimulationGame } from '../../scripts/style-simulation-game.mjs';
import {
  interactionPlacement,
  validateInteractionLedger,
} from '../../scripts/style-interaction-audit.mjs';

test('short audits cover each target and Hero position instead of advancing mostly through blind seats', () => {
  for (const count of [5, 6, 7, 8, 9]) {
    const targetCounts = {},
      heroCounts = {};
    for (let hand = 0; hand < 20; hand++) {
      const g = freshSimulationGame(engine, count, hand, 'normal');
      const p = interactionPlacement(count, hand);
      g.dealer = p.beforeDealer;
      engine.startHand(g);
      const tp = engine.seatPosition(g, p.target),
        hp = engine.seatPosition(g, 0);
      targetCounts[tp] = (targetCounts[tp] || 0) + 1;
      heroCounts[hp] = (heroCounts[hp] || 0) + 1;
      validateInteractionLedger(engine, g, count * g.stakes.startingStack);
    }
    for (const counts of [targetCounts, heroCounts]) {
      assert.equal(Object.keys(counts).length, count);
      assert(Math.min(...Object.values(counts)) >= Math.floor(20 / count));
      assert(Math.max(...Object.values(counts)) <= Math.ceil(20 / count));
    }
  }
});
