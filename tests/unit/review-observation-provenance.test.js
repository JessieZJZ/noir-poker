import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, startHand, act, botDecision } from '../../src/engine/poker.js';
import { explainOpponent } from '../../src/review/opponents.js';
import { riverStory } from '../fixtures/story-line-decisions.js';
import { clarityRandom } from '../fixtures/review-clarity-followup.js';

const read = {
  hands: 24,
  voluntaryHands: 24,
  raisingHands: 24,
  largeRaiseHands: 16,
  postActions: 33,
  postRaises: 33,
};

function sampledRecord() {
  const game = newGame(5);
  game.difficulty = 'normal';
  game.emotionMode = 'off';
  const saved = Math.random;
  Math.random = clarityRandom(81201);
  try {
    startHand(game);
  } finally {
    Math.random = saved;
  }
  const opener = game.actor;
  game.players[opener].publicReads = [read];
  act(game, opener, 'raise', 4 * game.bigBlind);
  const decision = botDecision(game, clarityRandom(73));
  return { id: game.actor, name: game.players[game.actor].name, ...decision };
}

test('a real corrected sampled decision records the full-input producer and explains public observations', () => {
  const record = sampledRecord();
  assert.equal(record.trace.view.allIn, undefined);
  assert.notEqual(record.trace.view.publicEquity.exact, true);
  assert.equal(
    record.trace.view.publicEquity.rangeInputsVersion,
    'complete-public-weight-inputs-v1',
  );
  const text = explainOpponent(record).detail;
  assert.match(text, /此前 24 手中 24 手翻前加注/);
  assert.doesNotMatch(text, /机器人|建议|应该|需要警惕|并非已经看到/);
});

test('an older sampled record cannot acquire a motive that its sampler did not apply', () => {
  const record = sampledRecord();
  delete record.trace.view.publicEquity.rangeInputsVersion;
  delete record.trace.observationSizing;
  assert.doesNotMatch(explainOpponent(record).detail, /此前 24 手中 24 手翻前加注/);
  assert.ok(explainOpponent(record).detail.length > 0);
});

test('legacy exact river records retain supported full-descriptor observation reasoning', () => {
  const game = riverStory();
  game.players[0].publicReads = [read];
  const decision = botDecision(game, clarityRandom(71));
  const record = { id: game.actor, name: game.players[game.actor].name, ...decision };
  assert.equal(record.trace.view.publicEquity.exact, true);
  delete record.trace.view.publicEquity.rangeInputsVersion;
  delete record.trace.observationSizing;
  assert.match(explainOpponent(record).detail, /此前频繁的翻后下注与加注/);
});

test('producer metadata cannot grant scripted or mismatched actions an observation motive', () => {
  const record = sampledRecord();
  for (const edit of [
    (r) => {
      r.trace.reasonSource = 'scripted-action-only';
    },
    (r) => {
      r.trace.basis.action = r.action === 'fold' ? 'call' : 'fold';
    },
  ]) {
    const changed = structuredClone(record);
    edit(changed);
    assert.doesNotMatch(explainOpponent(changed).detail, /此前 24 手中 24 手翻前加注/);
  }
  const changed = structuredClone(record);
  changed.trace.view.deck = [{ rank: 14, suit: 0 }];
  changed.trace.view.opponents[0].hole = [{ rank: 14, suit: 0 }];
  changed.trace.view.winners = [0];
  assert.equal(explainOpponent(changed).detail, explainOpponent(record).detail);
});
