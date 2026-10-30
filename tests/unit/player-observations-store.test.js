import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newGame,
  startHand,
  act,
  legalActions,
  advanceStreet,
  restartHand,
  importPlayerObservations,
  exportPlayerObservations,
} from '../../src/engine/poker.js';
import { sanitizePlayerObservationProfile } from '../../src/engine/public-observations.js';
import {
  createPlayerObservationStore,
  PLAYER_OBSERVATIONS_KEY,
  PLAYER_OBSERVATIONS_BYTES,
} from '../../src/platform/player-observations-store.js';
import { createPreferenceStorage } from '../../src/platform/storage.js';

function memoryStorage() {
  const values = new Map();
  const writes = [];
  return {
    values,
    writes,
    getItem: (key) => values.get(key) ?? null,
    setItem(key, value) {
      writes.push([key, value]);
      values.set(key, value);
    },
  };
}
const storeFor = (storage, options = {}) =>
  createPlayerObservationStore({
    storage,
    sanitizeProfile: sanitizePlayerObservationProfile,
    importProfile: importPlayerObservations,
    exportProfile: exportPlayerObservations,
    ...options,
  });

function finish(game, heroAction = 'raise') {
  let steps = 0;
  while (game.phase !== 'done') {
    assert.ok(++steps < 100);
    if (game.phase === 'between') advanceStreet(game);
    else if (game.actor === 0 && heroAction === 'raise' && legalActions(game).canRaise)
      act(game, 0, 'raise', legalActions(game).maxRaiseTo);
    else act(game, game.actor, 'fold');
  }
}
function dealt(store) {
  const game = store.restore(newGame(5));
  // This button makes Hero the first actor so the saved hand includes its
  // declared public action instead of a walk before it can act.
  game.dealer = 1;
  startHand(game);
  assert.equal(game.actor, 0);
  return game;
}

test('a first real hand persists only public counters and survives a new table and store instance', () => {
  const storage = memoryStorage();
  const store = storeFor(storage);
  const game = dealt(store);
  finish(game);
  assert.equal(store.capture(game), true);
  const saved = JSON.parse(storage.values.get(PLAYER_OBSERVATIONS_KEY));
  assert.equal(saved.totalHands, 1);
  assert.equal(saved.samples[0].largeRaiseHands, 1);
  assert.deepEqual(Object.keys(saved), ['version', 'revision', 'totalHands', 'samples']);
  assert.doesNotMatch(JSON.stringify(saved), /hole|deck|winners|payout|stack|botProfile/);
  const next = storeFor(storage).restore(newGame(9));
  assert.deepEqual(exportPlayerObservations(next), saved);
  assert.ok(next.players.slice(1).every((player) => player.publicReads.length === 0));
  assert.ok(next.players.every((player) => player.botProfile === 'balanced'));
  assert.equal(
    store.capture(game),
    false,
    'Repeated render does not add evidence or rewrite storage',
  );
});

test('unfinished actions are not persisted and retry retracts the completed sample once', () => {
  const storage = memoryStorage();
  const store = storeFor(storage);
  const game = dealt(store);
  act(game, 0, 'raise', legalActions(game).maxRaiseTo);
  store.capture(game);
  assert.equal(JSON.parse(storage.values.get(PLAYER_OBSERVATIONS_KEY)).totalHands, 0);
  finish(game);
  store.capture(game);
  const first = JSON.parse(storage.values.get(PLAYER_OBSERVATIONS_KEY));
  assert.equal(first.totalHands, 1);
  restartHand(game);
  store.capture(game);
  const retracted = JSON.parse(storage.values.get(PLAYER_OBSERVATIONS_KEY));
  assert.equal(retracted.totalHands, 0);
  assert.ok(retracted.revision > first.revision);
  assert.equal(store.capture(game), false);
  finish(game, 'fold');
  store.capture(game);
  const replaced = JSON.parse(storage.values.get(PLAYER_OBSERVATIONS_KEY));
  assert.equal(replaced.totalHands, 1);
  assert.equal(replaced.samples[0].largeRaiseHands, 0);
  assert.ok(replaced.revision > retracted.revision);
  assert.deepEqual(exportPlayerObservations(storeFor(storage).restore(newGame(6))), replaced);
});

test('a stale game cannot overwrite a newer profile or another same-revision public hand', () => {
  const storage = memoryStorage();
  const store = storeFor(storage);
  const game = dealt(store);
  const stale = dealt(store);
  finish(game);
  store.capture(game);
  const saved = storage.values.get(PLAYER_OBSERVATIONS_KEY);
  assert.equal(store.capture(stale), false);
  finish(stale, 'fold');
  assert.equal(exportPlayerObservations(stale).revision, exportPlayerObservations(game).revision);
  assert.equal(store.capture(stale), false);
  assert.equal(storage.values.get(PLAYER_OBSERVATIONS_KEY), saved);
  const restored = storeFor(storage).restore(stale);
  assert.deepEqual(exportPlayerObservations(restored), JSON.parse(saved));
});

test('another store instance cannot replace a persisted same-revision hand with its divergent hand', () => {
  const storage = memoryStorage();
  const first = storeFor(storage);
  const second = storeFor(storage);
  const firstGame = dealt(first);
  const secondGame = dealt(second);
  finish(firstGame);
  first.capture(firstGame);
  const saved = storage.values.get(PLAYER_OBSERVATIONS_KEY);
  finish(secondGame, 'fold');
  assert.equal(second.capture(secondGame), false);
  assert.equal(storage.values.get(PLAYER_OBSERVATIONS_KEY), saved);
  assert.deepEqual(exportPlayerObservations(second.restore(newGame(6))), JSON.parse(saved));
});

test('bad or oversized persistence is isolated and a quota failure retains useful in-memory learning', () => {
  for (const value of [
    'broken-json',
    JSON.stringify({ version: 999 }),
    'x'.repeat(PLAYER_OBSERVATIONS_BYTES),
  ]) {
    const storage = memoryStorage();
    storage.values.set(PLAYER_OBSERVATIONS_KEY, value);
    const store = storeFor(storage);
    const game = dealt(store);
    assert.equal(exportPlayerObservations(game).totalHands, 0);
    finish(game);
    assert.equal(store.capture(game), true);
    assert.equal(JSON.parse(storage.values.get(PLAYER_OBSERVATIONS_KEY)).totalHands, 1);
  }
  let blocked = true;
  const storage = memoryStorage();
  const store = storeFor(() => {
    if (blocked) throw Error('private storage unavailable');
    return storage;
  });
  const game = dealt(store);
  finish(game);
  assert.equal(store.capture(game), false);
  assert.equal(exportPlayerObservations(store.restore(newGame(9))).totalHands, 1);
  blocked = false;
  assert.equal(store.capture(game), true);
  assert.equal(JSON.parse(storage.values.get(PLAYER_OBSERVATIONS_KEY)).totalHands, 1);
});

test('the maximum bounded profile fits persistence and foreign fields are removed', () => {
  const storage = memoryStorage();
  const store = storeFor(storage);
  const game = store.restore(newGame(5));
  importPlayerObservations(game, {
    version: 1,
    revision: 1024,
    totalHands: 1024,
    samples: Array.from({ length: 64 }, () => ({
      hands: 1,
      voluntaryHands: 1,
      raisingHands: 1,
      largeRaiseHands: 1,
      largeCallHands: 1,
      postActions: 100,
      postRaises: 100,
      facedPostBet: 100,
      calledPostBet: 100,
      foldedPostBet: 100,
      hole: ['As', 'Ah'],
    })),
    winner: 0,
  });
  assert.equal(store.capture(game), true);
  const text = storage.values.get(PLAYER_OBSERVATIONS_KEY);
  assert.ok(text.length * 3 <= PLAYER_OBSERVATIONS_BYTES);
  assert.doesNotMatch(text, /hole|winner|As|Ah/);
  assert.equal(JSON.parse(text).samples.length, 64);
});

test('native preference hydration includes the shared profile and ordered writes reach Preferences', async () => {
  const web = memoryStorage();
  const origin = storeFor(web);
  const completed = dealt(origin);
  finish(completed);
  origin.capture(completed);
  const native = new Map();
  const preferences = createPreferenceStorage(() => web);
  await preferences.connect({
    get: async ({ key }) => ({ value: native.get(key) ?? null }),
    set: async ({ key, value }) => native.set(key, value),
  });
  assert.equal(native.get(PLAYER_OBSERVATIONS_KEY), web.values.get(PLAYER_OBSERVATIONS_KEY));
  const store = storeFor(preferences);
  const next = dealt(store);
  assert.equal(exportPlayerObservations(next).totalHands, 1);
  finish(next);
  store.capture(next);
  await store.flush();
  assert.equal(JSON.parse(native.get(PLAYER_OBSERVATIONS_KEY)).totalHands, 2);
});
