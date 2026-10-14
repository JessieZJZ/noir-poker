import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createPreferenceStorage } from '../../src/platform/storage.js';
import { createActivityClock } from '../../src/platform/activity-clock.js';
import { handleAndroidBack } from '../../src/platform/native.js';
import { mobileMetadata, directoryDigest } from '../../scripts/mobile-lib.mjs';

test('native preference hydration preserves values and migrates existing WebView settings', async () => {
  const web = new Map([
    ['noir-sound', 'false'],
    ['noir-table-v1', '{"playerCount":9}'],
  ]);
  const native = new Map([['noir-sound', 'true']]);
  const store = createPreferenceStorage(() => ({
    getItem: (key) => web.get(key) ?? null,
    setItem: (key, value) => web.set(key, value),
  }));
  await store.connect({
    get: async ({ key }) => ({ value: native.get(key) ?? null }),
    set: async ({ key, value }) => native.set(key, value),
  });
  assert.equal(store.getItem('noir-sound'), 'true');
  assert.equal(store.getItem('noir-table-v1'), '{"playerCount":9}');
  assert.equal(native.get('noir-table-v1'), '{"playerCount":9}');
  store.setItem('noir-sound', false);
  store.setItem('noir-sound', true);
  await store.flush();
  assert.equal(native.get('noir-sound'), 'true');
  assert.equal(web.get('noir-sound'), 'true');
});

test('unavailable storage does not stop local play and a failed native write does not poison later writes', async () => {
  const store = createPreferenceStorage(() => {
    throw Error('blocked');
  });
  assert.equal(store.getItem('noir-sound'), null);
  let fail = true;
  const native = new Map();
  await store.connect({
    get: async () => ({ value: null }),
    set: async ({ key, value }) => {
      if (fail) {
        fail = false;
        throw Error('failed');
      }
      native.set(key, value);
    },
  });
  store.setItem('noir-sound', false);
  store.setItem('noir-sound', true);
  await store.flush();
  assert.equal(native.get('noir-sound'), 'true');
});

test('thinking deadlines count active time only across repeated background pauses', async () => {
  let realTime = 0;
  const clock = createActivityClock(() => realTime);
  const deadline = clock.now() + 1000;
  realTime = 250;
  assert.equal(clock.setActive(false), true);
  assert.equal(clock.setActive(false), false);
  let resumed = false;
  const waiting = clock.waitUntilActive().then(() => {
    resumed = true;
  });
  realTime = 10000;
  assert.equal(clock.now(), 250);
  await Promise.resolve();
  assert.equal(resumed, false);
  clock.setActive(true);
  await waiting;
  assert.equal(deadline - clock.now(), 750);
  realTime += 100;
  clock.setActive(false);
  realTime += 5000;
  clock.setActive(true);
  assert.equal(deadline - clock.now(), 650);
});

test('Android back closes the top dialog first and minimizes only at the table', async () => {
  const closed = [];
  const dialogs = [{ close: () => closed.push(1) }, { close: () => closed.push(2) }];
  let minimized = 0;
  const app = {
    minimizeApp: async () => {
      minimized++;
    },
  };
  await handleAndroidBack({ querySelectorAll: () => dialogs }, app);
  assert.deepEqual(closed, [2]);
  assert.equal(minimized, 0);
  await handleAndroidBack({ querySelectorAll: () => [] }, app);
  assert.equal(minimized, 1);
  const navigated = [];
  for (const [route, selector] of [
    ['hand', '#history-back-button'],
    ['list', '#records-back-button'],
  ]) {
    await handleAndroidBack(
      {
        querySelectorAll: () => [],
        body: { dataset: { recordsPage: route } },
        querySelector: (value) =>
          value === selector ? { click: () => navigated.push(value) } : null,
      },
      app,
    );
  }
  assert.deepEqual(navigated, ['#history-back-button', '#records-back-button']);
  assert.equal(minimized, 1);
  await handleAndroidBack(
    {
      querySelectorAll: () => [
        ...dialogs,
        { id: 'orientation-dialog', close: () => closed.push('orientation') },
      ],
    },
    app,
  );
  assert.deepEqual(closed, [2]);
  assert.equal(minimized, 1);
});

test('native release versions accept a single build number and reject invalid store versions', () => {
  assert.equal(mobileMetadata({ NOIR_BUILD_NUMBER: '27' }).buildNumber, 27);
  for (const value of ['0', '-1', 'abc', '1.5', '2100000001'])
    assert.throws(() => mobileMetadata({ NOIR_BUILD_NUMBER: value }), /positive/);
});

test('asset digests detect content changes while excluding only generated bridge files', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'noir-assets-'));
  try {
    writeFileSync(path.join(directory, 'index.html'), 'latest');
    const before = directoryDigest(directory);
    writeFileSync(path.join(directory, 'cordova.js'), 'generated');
    assert.equal(directoryDigest(directory), before);
    writeFileSync(path.join(directory, 'index.html'), 'changed');
    assert.notEqual(directoryDigest(directory), before);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
