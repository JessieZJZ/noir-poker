import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {
  readNativePlayerObservations,
  nativeObservationProfilesMatch,
} from '../native/scenarios.mjs';
import { sanitizePublicRead } from '../../src/engine/public-observations.js';

function bridge({ outcome = 'resolved', nativeValue, webValue } = {}) {
  const profile = { version: 1, revision: 4, totalHands: 2, samples: [] };
  const encoded = JSON.stringify(profile);
  let resolve,
    reject,
    returnsPromise = 0,
    calls = 0,
    timeout;
  const pending = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  const window = {
    __nativePlayerObservationsProbe: { token: 'stale', status: 'resolved', native: 'old' },
    Capacitor: {
      nativePromise(plugin, method, { key }) {
        assert.equal(plugin, 'Preferences');
        assert.equal(method, 'get');
        assert.equal(key, 'noir-player-observations-v1');
        calls++;
        return pending;
      },
    },
  };
  const context = vm.createContext({
    window,
    localStorage: { getItem: () => (webValue === undefined ? encoded : webValue) },
  });
  return {
    profile,
    window,
    evidence: () => ({ returnsPromise, calls, timeout }),
    app: {
      async evaluate(fn, ...args) {
        const result = vm.runInContext(`(${fn.toString()})`, context)(...args);
        if (result?.then) {
          returnsPromise++;
          return {};
        }
        return result === undefined ? null : JSON.parse(JSON.stringify(result));
      },
      async waitFor(predicate, limit, message) {
        timeout = limit;
        assert.equal(await predicate(), null, 'The stale preceding page probe is not accepted');
        if (outcome === 'resolved')
          resolve({ value: nativeValue === undefined ? encoded : nativeValue });
        if (outcome === 'rejected') reject(Error('Preferences unavailable'));
        await Promise.resolve();
        const result = await predicate();
        if (!result) throw Error(message);
        assert.equal(typeof result, 'string', 'The driver bridge receives a primitive string');
        return result;
      },
    },
  };
}

test('native observation reader resolves the real asynchronous Preferences bridge through serialized polling', async () => {
  const harness = bridge();
  assert.deepEqual(await readNativePlayerObservations(harness.app), {
    web: harness.profile,
    native: harness.profile,
  });
  assert.deepEqual(harness.evidence(), { returnsPromise: 0, calls: 1, timeout: 5000 });
  assert.equal(harness.window.__nativePlayerObservationsProbe, undefined);
});

test('native observation reader preserves explicit absent values instead of fabricating a profile', async () => {
  const harness = bridge({ nativeValue: null, webValue: null });
  assert.deepEqual(await readNativePlayerObservations(harness.app), { web: null, native: null });
});

test('native observation reader reports bridge rejection, malformed data and a pending timeout', async () => {
  for (const [options, error] of [
    [{ outcome: 'rejected' }, /Preferences unavailable/],
    [{ nativeValue: 'broken-json' }, /JSON/],
    [{ outcome: 'pending' }, /real native player-observations Preferences value/],
  ]) {
    const harness = bridge(options);
    await assert.rejects(readNativePlayerObservations(harness.app), error);
    assert.equal(harness.evidence().returnsPromise, 0);
    assert.equal(harness.window.__nativePlayerObservationsProbe, undefined);
  }
});

test('native observation profiles compare complete values while ignoring WebDriver dictionary key order', () => {
  const counter = sanitizePublicRead({ hands: 1, voluntaryHands: 1, raisingHands: 1 });
  const expected = {
    version: 1,
    revision: 8,
    totalHands: 4,
    samples: [counter, { ...counter, voluntaryHands: 0, raisingHands: 0 }],
  };
  const reorder = (value) =>
    Array.isArray(value)
      ? value.map(reorder)
      : value && typeof value === 'object'
        ? Object.fromEntries(
            Object.entries(value)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([key, item]) => [key, reorder(item)]),
          )
        : value;
  const sorted = reorder(expected);
  assert.notEqual(
    JSON.stringify(sorted),
    JSON.stringify(expected),
    'The fixture reproduces cross-driver dictionary order',
  );
  assert.equal(nativeObservationProfilesMatch({ web: expected, native: sorted }, sorted), true);
  assert.equal(nativeObservationProfilesMatch({ web: sorted, native: expected }, expected), true);
  const cases = [
    (p) => p.samples.reverse(),
    (p) => p.samples[0].raisingHands++,
    (p) => (p.samples[0].hands = '1'),
    (p) => delete p.samples[0].facedPostBet,
    (p) => (p.samples[0].hidden = 1),
    (p) => p.samples.pop(),
    (p) => p.revision++,
    (p) => (p.totalHands = '4'),
    (p) => delete p.version,
    (p) => (p.extra = false),
  ];
  for (const change of cases) {
    const invalid = structuredClone(expected);
    change(invalid);
    assert.equal(
      nativeObservationProfilesMatch({ web: expected, native: invalid }, expected),
      false,
    );
    assert.equal(
      nativeObservationProfilesMatch({ web: invalid, native: invalid }, expected),
      false,
    );
  }
  assert.equal(nativeObservationProfilesMatch({ web: null, native: null }, null), true);
  assert.equal(nativeObservationProfilesMatch({ web: null, native: expected }, expected), false);
});
