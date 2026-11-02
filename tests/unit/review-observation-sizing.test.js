import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, startHand, act, botDecision } from '../../src/engine/poker.js';
import { explainOpponent } from '../../src/review/opponents.js';
import { observedSqueeze } from '../fixtures/observed-preflop.js';
import { clarityRandom } from '../fixtures/review-clarity-followup.js';

const recordFor = (game) => ({
  id: game.actor,
  name: game.players[game.actor].name,
  ...botDecision(game, clarityRandom(73)),
});

test('current large-wager explanations and legacy flag-based explanations keep their recorded sizing contract', () => {
  const current = recordFor(observedSqueeze());
  assert.deepEqual(current.trace.observationSizing, { version: 1, largePreflopBB: 8 });
  assert.match(explainOpponent(current).detail, /此前 32 手中 32 手翻前大额加注/);
  const legacy = structuredClone(current);
  delete legacy.trace.observationSizing;
  assert.equal(legacy.trace.view.allIn, undefined);
  assert.match(explainOpponent(legacy).detail, /此前 32 手中 32 手翻前加注的记录/);
  assert.doesNotMatch(explainOpponent(legacy).detail, /此前 32 手中 32 手翻前大额加注/);
});

test('a short shove uses ordinary preflop history only when that grouping was recorded', () => {
  const game = newGame(5);
  game.difficulty = 'hard';
  game.emotionMode = 'off';
  const saved = Math.random;
  Math.random = clarityRandom(81201);
  try {
    startHand(game);
  } finally {
    Math.random = saved;
  }
  const opener = game.actor;
  game.players[opener].stack = 6 * game.bigBlind;
  game.players[opener].publicReads = [
    { hands: 24, voluntaryHands: 24, raisingHands: 24, largeRaiseHands: 0, largeCallHands: 0 },
  ];
  act(game, opener, 'raise', 6 * game.bigBlind);
  const current = recordFor(game);
  assert.ok(current.trace.view.allIn);
  assert.match(explainOpponent(current).detail, /此前 24 手中 24 手翻前加注/);
  const legacy = structuredClone(current);
  delete legacy.trace.observationSizing;
  assert.doesNotMatch(explainOpponent(legacy).detail, /此前 24 手中 24 手翻前/);
  assert.match(explainOpponent(legacy).detail, /选择/);
});

test('unknown or invalid sizing contracts omit unverified motives while retaining the actual action', () => {
  const original = recordFor(observedSqueeze());
  for (const sizing of [
    { version: 2, largePreflopBB: 8 },
    { version: 1, largePreflopBB: 0 },
    { version: 1, largePreflopBB: Number.NaN },
  ]) {
    const record = structuredClone(original);
    record.trace.observationSizing = sizing;
    const text = explainOpponent(record).detail;
    assert.doesNotMatch(text, /此前 32 手中 32 手/);
    assert.match(text, /选择/);
    assert.doesNotMatch(text, /undefined|NaN|模型|observationSizing/);
  }
});

test('sizing metadata cannot grant scripted or mismatched actions a historical motive', () => {
  const original = recordFor(observedSqueeze());
  for (const edit of [
    (r) => {
      r.trace.reasonSource = 'scripted-action-only';
    },
    (r) => {
      r.trace.basis.action = r.action === 'fold' ? 'call' : 'fold';
    },
  ]) {
    const record = structuredClone(original);
    edit(record);
    assert.doesNotMatch(explainOpponent(record).detail, /此前 32 手中 32 手/);
  }
});
