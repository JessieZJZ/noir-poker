import test from 'node:test';
import assert from 'node:assert/strict';
import { createWechatController } from '../../src/platform/wechat-controller.js';
import {
  act,
  legalActions,
  advanceStreet,
  exportPlayerObservations,
  importPlayerObservations,
} from '../../src/engine/poker.js';
import { PLAYER_OBSERVATIONS_KEY } from '../../src/platform/player-observations-store.js';

function setup(t, values = new Map(), options = {}) {
  let next = 0;
  const pending = new Map();
  const writes = [];
  const controller = createWechatController({
    publish: () => {},
    storage: {
      getItem: (key) => values.get(key) ?? null,
      setItem(key, value) {
        writes.push(key);
        values.set(key, value);
      },
    },
    schedule: (fn) => {
      pending.set(++next, fn);
      return next;
    },
    unschedule: (id) => pending.delete(id),
    ...options,
  });
  t.after(() => controller.destroy());
  controller.start();
  return { controller, values, writes };
}
function finish(controller, heroAction = 'raise') {
  const game = controller.getGame();
  let steps = 0;
  while (game.phase !== 'done') {
    assert.ok(++steps < 100);
    if (game.phase === 'between') advanceStreet(game);
    else if (game.actor === 0 && heroAction === 'raise' && legalActions(game).canRaise)
      act(game, 0, 'raise', legalActions(game).maxRaiseTo);
    else act(game, game.actor, 'fold');
  }
  controller.show();
  return game;
}

test('WeChat shares completed player observations across reset, retry and reopening the live controller', (t) => {
  const first = setup(t);
  first.controller.join();
  const game = finish(first.controller);
  const initial = JSON.parse(first.values.get(PLAYER_OBSERVATIONS_KEY));
  assert.equal(initial.totalHands, 1);
  assert.equal(initial.samples[0].largeRaiseHands, 1);
  assert.equal(first.controller.retry(), true);
  const retracted = JSON.parse(first.values.get(PLAYER_OBSERVATIONS_KEY));
  assert.equal(retracted.totalHands, 0);
  assert.ok(retracted.revision > initial.revision);
  finish(first.controller, 'fold');
  const replacement = JSON.parse(first.values.get(PLAYER_OBSERVATIONS_KEY));
  assert.equal(replacement.totalHands, 1);
  assert.equal(replacement.samples[0].largeRaiseHands, 0);
  first.controller.reset();
  assert.notEqual(first.controller.getGame(), game);
  assert.deepEqual(exportPlayerObservations(first.controller.getGame()), replacement);
  assert.ok(first.controller.getGame().players.every((player) => player.botProfile === 'balanced'));
  first.controller.hide();
  first.controller.destroy();
  const reopened = setup(t, first.values);
  assert.deepEqual(exportPlayerObservations(reopened.controller.getGame()), replacement);
});

test('WeChat restores the newer stored profile before an old saved table can write it back', (t) => {
  const first = setup(t);
  first.controller.join();
  finish(first.controller);
  first.controller.destroy();
  const newer = {
    version: 1,
    revision: 50,
    totalHands: 50,
    samples: [{ hands: 1, voluntaryHands: 1, raisingHands: 1, largeRaiseHands: 1 }],
  };
  first.values.set(PLAYER_OBSERVATIONS_KEY, JSON.stringify(newer));
  const reopened = setup(t, first.values);
  const profile = exportPlayerObservations(reopened.controller.getGame());
  assert.equal(profile.revision, 50);
  assert.equal(profile.totalHands, 50);
  assert.equal(profile.samples[0].largeRaiseHands, 1);
  assert.equal(JSON.parse(first.values.get(PLAYER_OBSERVATIONS_KEY)).revision, 50);
});

test('read-only WeChat history never imports or contributes to the current player profile', (t) => {
  const first = setup(t);
  first.controller.join();
  const completed = finish(first.controller);
  const saved = first.values.get(PLAYER_OBSERVATIONS_KEY);
  const readOnly = setup(t, first.values, {
    readOnlyAttempt: { snapshot: JSON.parse(JSON.stringify(completed)) },
  });
  importPlayerObservations(readOnly.controller.getGame(), {
    version: 1,
    revision: 100,
    totalHands: 100,
    samples: [{ hands: 1, raisingHands: 0 }],
  });
  readOnly.controller.show();
  readOnly.controller.hide();
  readOnly.controller.destroy();
  assert.equal(first.values.get(PLAYER_OBSERVATIONS_KEY), saved);
  assert.ok(!readOnly.writes.includes(PLAYER_OBSERVATIONS_KEY));
});
