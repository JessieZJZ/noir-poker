import test from 'node:test';
import assert from 'node:assert/strict';
import { createPreferenceStorage } from '../../src/platform/storage.js';
import {
  createPlayerObservationStore,
  PLAYER_OBSERVATIONS_KEY as key,
  PLAYER_OBSERVATIONS_BYTES,
} from '../../src/platform/player-observations-store.js';
import { sanitizePlayerObservationProfile } from '../../src/engine/public-observations.js';
import {
  newGame,
  importPlayerObservations,
  exportPlayerObservations,
} from '../../src/engine/poker.js';

const profile = (revision, raisingHands = 1) =>
  sanitizePlayerObservationProfile({
    version: 1,
    revision,
    totalHands: revision,
    samples: revision ? [{ hands: 1, raisingHands }] : [],
  });
const encoded = (value) => JSON.stringify(value);
const makeStore = (storage) =>
  createPlayerObservationStore({
    storage,
    sanitizeProfile: sanitizePlayerObservationProfile,
    importProfile: importPlayerObservations,
    exportProfile: exportPlayerObservations,
  });

function replicas(nativeValue, webValue) {
  const native = new Map(nativeValue === null ? [] : [[key, nativeValue]]);
  const web = new Map(webValue === null ? [] : [[key, webValue]]);
  let nativeBlocked = false,
    webBlocked = false;
  const webAPI = {
    getItem: (name) => web.get(name) ?? null,
    setItem(name, value) {
      if (webBlocked && name === key) throw Error('WebView profile write failed');
      web.set(name, value);
    },
  };
  const nativeAPI = {
    get: async ({ key: name }) => ({ value: native.get(name) ?? null }),
    async set({ key: name, value }) {
      if (nativeBlocked && name === key) throw Error('Native profile write failed');
      native.set(name, value);
    },
  };
  return {
    native,
    web,
    blockNative(value) {
      nativeBlocked = value;
    },
    blockWeb(value) {
      webBlocked = value;
    },
    async open() {
      const preferences = createPreferenceStorage(() => webAPI);
      await preferences.connect(nativeAPI);
      return preferences;
    },
  };
}

test('an asynchronous Preferences failure is exposed after flush and a restart recovers the newer valid WebView profile', async () => {
  const disk = replicas(encoded(profile(0)), encoded(profile(0)));
  const preferences = await disk.open();
  const store = makeStore(preferences),
    game = store.restore(newGame(5));
  importPlayerObservations(game, profile(1));
  disk.blockNative(true);
  assert.equal(store.capture(game), true, 'Capture accepts the local write before Native settles');
  await store.flush();
  assert.match(store.error()?.message, /Native profile write failed/);
  assert.match(preferences.error(key)?.message, /Native profile write failed/);
  assert.equal(JSON.parse(disk.native.get(key)).revision, 0);
  assert.equal(JSON.parse(disk.web.get(key)).revision, 1);
  // Promotion is still failing during the next app's hydration. The newest
  // local value must remain usable, with the Native error observable.
  const restartedPreferences = await disk.open();
  assert.match(restartedPreferences.error(key)?.message, /Native profile write failed/);
  const restartedStore = makeStore(restartedPreferences);
  const restarted = restartedStore.restore(newGame(9));
  assert.deepEqual(exportPlayerObservations(restarted), profile(1));
  disk.blockNative(false);
  restartedStore.capture(restarted);
  await restartedStore.flush();
  assert.equal(restartedStore.error(), null);
  assert.deepEqual(JSON.parse(disk.native.get(key)), profile(1));
});

test('profile promotion failure does not abort other preference hydration or disable their Native adapter', async () => {
  const disk = replicas(encoded(profile(1)), encoded(profile(2)));
  disk.native.set('noir-sound', 'true');
  disk.web.set('noir-sound', 'false');
  disk.native.set('noir-table-v1', '{"playerCount":9}');
  disk.web.set('noir-table-v1', '{"playerCount":5}');
  disk.blockNative(true);
  const preferences = await disk.open();
  assert.equal(JSON.parse(preferences.getItem(key)).revision, 2);
  assert.match(preferences.error(key)?.message, /Native profile write failed/);
  assert.equal(preferences.getItem('noir-sound'), 'true');
  assert.equal(preferences.getItem('noir-table-v1'), '{"playerCount":9}');
  preferences.setItem('noir-sound', 'false');
  await preferences.flush();
  assert.equal(disk.native.get('noir-sound'), 'false');
});

test('a newer Native profile wins over stale WebView data and repairs only the profile replica', async () => {
  const disk = replicas(encoded(profile(8)), encoded(profile(3)));
  disk.native.set('noir-locale', 'en');
  disk.web.set('noir-locale', 'ja');
  const preferences = await disk.open();
  assert.deepEqual(JSON.parse(preferences.getItem(key)), profile(8));
  assert.deepEqual(JSON.parse(disk.web.get(key)), profile(8));
  assert.equal(preferences.getItem('noir-locale'), 'en');
  assert.equal(
    disk.web.get('noir-locale'),
    'ja',
    'Other keys keep their existing hydration semantics',
  );
});

test('equal-revision conflicts retain Native priority without concatenating or inventing samples', async () => {
  const native = profile(6, 0),
    web = profile(6, 1);
  const disk = replicas(encoded(native), encoded(web));
  const preferences = await disk.open();
  assert.deepEqual(JSON.parse(preferences.getItem(key)), native);
  assert.deepEqual(JSON.parse(disk.web.get(key)), native);
  assert.equal(JSON.parse(preferences.getItem(key)).samples.length, 1);
});

test('malformed JSON, unknown versions and oversized copies cannot win on a claimed revision', async () => {
  const good = profile(3);
  const bad = [
    'broken-json',
    encoded({ ...profile(1000), version: 2 }),
    encoded({ ...profile(1000), revision: -1 }),
    'x'.repeat(PLAYER_OBSERVATIONS_BYTES),
  ];
  for (const value of bad) {
    for (const [native, web] of [
      [value, encoded(good)],
      [encoded(good), value],
    ]) {
      const disk = replicas(native, web),
        preferences = await disk.open();
      assert.deepEqual(JSON.parse(preferences.getItem(key)), good);
      assert.deepEqual(JSON.parse(disk.native.get(key)), good);
      assert.deepEqual(JSON.parse(disk.web.get(key)), good);
    }
  }
  const invalid = replicas('broken-native', 'broken-web');
  const preferences = await invalid.open();
  assert.equal(preferences.getItem(key), null);
  const store = makeStore(preferences),
    game = store.restore(newGame(5));
  assert.deepEqual(exportPlayerObservations(game), profile(0));
  store.capture(game);
  await store.flush();
  assert.deepEqual(JSON.parse(invalid.native.get(key)), profile(0));
});

test('hydration and writes use the observation whitelist rather than copying foreign profile data', async () => {
  const dirty = { ...profile(4), hole: ['As', 'Ah'], winners: [0], botProfile: 'jett' };
  dirty.samples[0].deck = ['private-card'];
  const disk = replicas(encoded(dirty), null),
    preferences = await disk.open();
  for (const text of [preferences.getItem(key), disk.native.get(key), disk.web.get(key)]) {
    assert.deepEqual(JSON.parse(text), profile(4));
    assert.doesNotMatch(text, /hole|winners|botProfile|deck|private-card/);
  }
  const next = { ...profile(5), payout: 10000 };
  preferences.setItem(key, encoded(next));
  await preferences.flush();
  assert.deepEqual(JSON.parse(disk.native.get(key)), profile(5));
  assert.deepEqual(JSON.parse(disk.web.get(key)), profile(5));
  const last = disk.native.get(key);
  preferences.setItem(key, encoded({ ...profile(100), version: 99 }));
  await preferences.flush();
  assert.match(preferences.error(key)?.message, /Invalid local player-observation profile/);
  assert.equal(disk.native.get(key), last);
});

test('a successful Native write does not hide a failed WebView backup write', async () => {
  const disk = replicas(encoded(profile(0)), encoded(profile(0)));
  const preferences = await disk.open(),
    store = makeStore(preferences);
  const game = store.restore(newGame(5));
  importPlayerObservations(game, profile(1));
  disk.blockWeb(true);
  assert.equal(store.capture(game), false);
  await store.flush();
  assert.match(store.error()?.message, /WebView profile write failed/);
  assert.deepEqual(JSON.parse(disk.native.get(key)), profile(1));
  disk.blockWeb(false);
  store.capture(game);
  await store.flush();
  assert.equal(store.error(), null);
  assert.deepEqual(JSON.parse(disk.web.get(key)), profile(1));
});

test('flush exposes adapter rejection and retains synchronous failures when an adapter has no error channel', async () => {
  const queue = makeStore({
    getItem: () => null,
    setItem() {},
    flush: () => Promise.reject(Error('queue failed')),
  });
  queue.capture(queue.restore(newGame(5)));
  await queue.flush();
  assert.match(queue.error()?.message, /queue failed/);
  const quota = makeStore({
    getItem: () => null,
    setItem() {
      throw Error('quota failed');
    },
  });
  quota.capture(quota.restore(newGame(5)));
  await quota.flush();
  assert.match(quota.error()?.message, /quota failed/);
});
