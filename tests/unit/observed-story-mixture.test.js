import test from 'node:test';
import assert from 'node:assert/strict';
import { publicStoryWeight } from '../../src/engine/public-story.js';
import { publicHandData } from '../../src/engine/public-equity.js';
import { observedAggressiveLikelihood } from '../../src/engine/public-observations.js';
import { handFeatures } from '../../src/engine/hand-features.js';
import * as engine from '../../src/engine/poker.js';
import { riverStory } from '../fixtures/story-line-decisions.js';
import { cards } from '../fixtures/deceptive-decisions.js';
import { clarityRandom } from '../fixtures/review-clarity-followup.js';

const read = {
  hands: 24,
  voluntaryHands: 24,
  raisingHands: 24,
  largeRaiseHands: 16,
  postActions: 33,
  postRaises: 33,
};
const options = {
  evaluate: engine.evaluate,
  compare: engine.compare,
  features: handFeatures,
  cache: new Map(),
};
const data = (hole, board) => publicHandData(hole, board, options);
const board = cards('Kc Kd As Th Ks');
const line = [1, 2, 3].map((street) => ({
  street,
  action: 'bet',
  ratio: 0.5,
  board: board.slice(0, street + 2),
}));

test('absent betting evidence and passive observations do not alter candidate action-line weights', () => {
  const pool = engine.deckOfCards().filter((c) => !board.some((b) => b.key === c.key));
  for (const observation of [
    { ...read, hands: 0 },
    { ...read, postActions: 0, postRaises: 0 },
    { ...read, postRaises: 0 },
  ]) {
    assert.equal(observedAggressiveLikelihood(observation), 0);
    for (let a = 0; a < pool.length; a++)
      for (let b = a + 1; b < pool.length; b++) {
        const pair = [pool[a], pool[b]];
        assert.equal(
          publicStoryWeight(pair, line, data, observation),
          publicStoryWeight(pair, line, data),
        );
      }
  }
});

test('repeated known indiscriminate aggression retains weak holdings without erasing call evidence or value hands', () => {
  const air = cards('8d 2c'),
    strong = cards('Ah Ad');
  const once = publicStoryWeight(air, line.slice(0, 1), data, read);
  const repeated = publicStoryWeight(air, line, data, read);
  assert.ok(
    repeated >= once * 0.7,
    'Repeated aggression is not independent proof of a strong hand',
  );
  assert.ok(repeated < publicStoryWeight(strong, line, data, read));
  const withCall = [...line.slice(0, 2), { ...line[1], action: 'call', ratio: 1 }, line[2]];
  assert.ok(publicStoryWeight(air, withCall, data, read) < repeated * 0.05);
  for (const hole of [air, strong]) {
    const weight = publicStoryWeight(hole, line, data, read);
    assert.ok(Number.isFinite(weight) && weight > 0 && weight <= 1);
  }
});

test('warm complete decisions ignore secret cards and future deck and retain legal chip conservation at stake boundaries', () => {
  for (const smallBlind of [25, 100, 10000, 50000]) {
    const game = riverStory({ smallBlind });
    game.players[0].publicReads = [read];
    const wealth = game.players.reduce((sum, p) => sum + p.stack + p.total, 0);
    const expected = engine.botDecision(game, clarityRandom(71));
    const saved = game.players.filter((p) => p.id !== game.actor).map((p) => [p, p.hole]);
    const deck = game.deck;
    try {
      for (const [p] of saved)
        Object.defineProperty(p, 'hole', {
          configurable: true,
          get() {
            throw Error('Hidden rival cards accessed');
          },
        });
      Object.defineProperty(game, 'deck', {
        configurable: true,
        get() {
          throw Error('Future deck accessed');
        },
      });
      assert.deepEqual(engine.botDecision(game, clarityRandom(71)), expected);
    } finally {
      for (const [p, hole] of saved)
        Object.defineProperty(p, 'hole', { value: hole, writable: true, configurable: true });
      Object.defineProperty(game, 'deck', { value: deck, writable: true, configurable: true });
    }
    engine.act(game, game.actor, expected.action, expected.amount);
    while (game.phase !== 'done') {
      if (game.phase === 'between') engine.advanceStreet(game);
      else engine.act(game, game.actor, engine.legalActions(game).canCheck ? 'check' : 'fold');
    }
    assert.equal(
      game.players.reduce((sum, p) => sum + p.stack, 0),
      wealth,
    );
    for (const p of game.players) assert.equal(p.stack % game.chipUnit, 0);
  }
});

test('a frequent aggressor does not force a costly high-card catch when the draw completes', () => {
  const game = riverStory({ hole: '8d 9c', river: '2h', betBB: 150, defenderBB: 250 });
  game.players[0].publicReads = [read];
  const result = engine.botDecision(game, clarityRandom(71));
  assert.equal(result.action, 'fold');
  assert.ok(result.trace.rawEquity + result.trace.callTolerance < result.trace.requiredEquity);
});
