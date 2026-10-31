import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeDecision } from '../../src/review/analysis.js';
import { compareCandidateActions } from '../../src/review/counterfactual.js';
import { INTERACTIVE_REVIEW_OPTIONS } from '../../src/review/budget.js';
import { heroValueGame } from '../fixtures/review-spots.js';
import { clearReviewCardCache } from '../../src/review/card-cache.js';

test('interactive review retains primary equity, draw and price facts without whole-hand continuations', () => {
  const s = heroValueGame('set-shove').decisions.find((d) => d.street === 1);
  const before = structuredClone(s);
  const full = analyzeDecision(s, { rolloutTrials: 12 });
  clearReviewCardCache();
  const light = analyzeDecision(s, INTERACTIVE_REVIEW_OPTIONS);
  assert.deepEqual(light.metrics, full.metrics);
  assert.deepEqual(light.context.matchups, full.context.matchups);
  assert.deepEqual(light.context.draw, full.context.draw);
  assert.equal(light.simulation, null);
  assert.equal(light.coaching.confirmed, false);
  assert.deepEqual(light.coaching.recommendedAction, full.coaching.recommendedAction);
  assert.deepEqual(s, before);
  for (const p of s.players.slice(1))
    Object.defineProperty(p, 'hole', {
      get() {
        throw Error('hidden cards');
      },
    });
  assert.deepEqual(analyzeDecision(s, INTERACTIVE_REVIEW_OPTIONS), light);
});
test('offline candidate continuation remains available explicitly and default analysis retains it', () => {
  const s = heroValueGame('set-shove').decisions.find((d) => d.street === 1);
  const r = compareCandidateActions(s, [], { trials: 2 });
  assert.equal(r.comparisonReady, false);
  assert.equal(r.method, 'sampled-engine-rollout');
  assert.equal(analyzeDecision(s, { trials: 12, rolloutTrials: 2 }).simulation.trials, 2);
});
