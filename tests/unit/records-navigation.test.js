import test from 'node:test';
import assert from 'node:assert/strict';
import { createRecordsNavigation, recordsRoute } from '../../src/ui/records-navigation.js';

let identity = 0;
function harness({ hash = '', entries, index, storage = new Map(), defer = false } = {}) {
  const events = new EventTarget(),
    views = [],
    moves = [];
  entries ??= [
    { url: '/previous', state: null },
    { url: '/play?local=true' + hash, state: null },
  ];
  index ??= entries.length - 1;
  const location = {};
  function locate() {
    const parsed = new URL(entries[index].url, 'https://example.test');
    for (const field of ['pathname', 'search', 'hash']) location[field] = parsed[field];
  }
  locate();
  const history = {
    get state() {
      return entries[index].state;
    },
    pushState(state, _, url) {
      entries.splice(index + 1);
      entries.push({ state: structuredClone(state), url });
      index++;
      locate();
    },
    replaceState(state, _, url) {
      entries[index] = { state: structuredClone(state), url };
      locate();
    },
    go(delta) {
      const move = () => {
        const next = index + delta;
        if (next < 0 || next >= entries.length) return;
        index = next;
        locate();
        events.dispatchEvent(new Event('popstate'));
        events.dispatchEvent(new Event('hashchange'));
      };
      if (defer) moves.push(move);
      else move();
    },
    back() {
      this.go(-1);
    },
  };
  const window = {
    location,
    history,
    sessionStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
    },
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
  };
  const navigation = createRecordsNavigation({
    window,
    show: (route) => views.push(route),
    id: () => 'visit-' + ++identity,
  });
  navigation.initialize();
  return {
    navigation,
    entries,
    storage,
    window,
    views,
    index: () => index,
    flush: () => moves.splice(0).forEach((move) => move()),
    pendingMoves: () => moves.length,
    hashChanged: () => events.dispatchEvent(new Event('hashchange')),
    systemBack: () => events.dispatchEvent(new Event('noir:records-back')),
  };
}

test('system Back pops the detail and list pages without appending routes', () => {
  const h = harness();
  h.navigation.navigate({ page: 'list' });
  h.navigation.navigate({ page: 'hand', id: 'hand/retry' });
  assert.equal(h.window.location.hash, '#records/hand%2Fretry');
  assert.equal(h.entries.length, 4);
  h.systemBack();
  assert.deepEqual(h.navigation.route(), { page: 'list' });
  assert.equal(h.entries.length, 4);
  h.systemBack();
  assert.deepEqual(h.navigation.route(), { page: 'game' });
  assert.equal(h.index(), 1);
  assert.equal(h.entries.length, 4);
  h.systemBack();
  assert.equal(h.index(), 1);
});

test('repeated Back gestures wait for the first traversal instead of skipping a parent page', () => {
  const h = harness({ defer: true });
  h.navigation.navigate({ page: 'list' });
  h.navigation.navigate({ page: 'hand', id: 'finished' });
  h.systemBack();
  h.systemBack();
  h.navigation.navigate({ page: 'game' });
  assert.equal(h.pendingMoves(), 1);
  assert.deepEqual(h.navigation.route(), { page: 'hand', id: 'finished' });
  h.flush();
  assert.deepEqual(h.navigation.route(), { page: 'list' });
  h.navigation.navigate({ page: 'game' });
  h.hashChanged();
  h.navigation.navigate({ page: 'game' });
  assert.equal(h.pendingMoves(), 1);
  h.flush();
  assert.deepEqual(h.navigation.route(), { page: 'game' });
  assert.equal(h.index(), 1);
});

test('Return Game unwinds the visit, so the next Back cannot reopen old records', () => {
  const h = harness();
  for (let visit = 0; visit < 4; visit++) {
    h.navigation.navigate({ page: 'list' });
    h.navigation.navigate({ page: 'hand', id: `hand-${visit}` });
    h.navigation.navigate({ page: 'hand', id: `other-${visit}` });
    assert.equal(h.entries.length, 4);
    h.navigation.navigate({ page: 'game' });
    assert.equal(h.index(), 1);
    assert.equal(h.window.location.hash, '');
  }
  h.window.history.back();
  assert.equal(h.window.location.pathname, '/previous');
  assert.equal(h.window.location.hash, '');
});

test('closed forward routes are suppressed and remain closed on reload', () => {
  const h = harness();
  h.navigation.navigate({ page: 'list' });
  h.navigation.navigate({ page: 'hand', id: 'finished' });
  h.navigation.navigate({ page: 'game' });
  const savedEntries = structuredClone(h.entries);
  h.window.history.go(1);
  assert.equal(h.window.location.hash, '');
  assert.deepEqual(h.navigation.route(), { page: 'game' });
  assert.equal(h.index(), 1, 'closed Forward returns to the existing game parent');
  h.window.history.go(2);
  assert.equal(h.index(), 1, 'a closed detail also returns to the original game parent');
  const reloaded = harness({ entries: savedEntries, index: 3, storage: h.storage });
  assert.deepEqual(reloaded.navigation.route(), { page: 'game' });
  assert.equal(reloaded.window.location.hash, '');
  assert.equal(reloaded.index(), 1);
  reloaded.navigation.navigate({ page: 'list' });
  reloaded.navigation.navigate({ page: 'hand', id: 'another' });
  reloaded.navigation.navigate({ page: 'game' });
  assert.equal(reloaded.index(), 1);
  reloaded.window.history.back();
  assert.equal(reloaded.window.location.pathname, '/previous');
});

test('direct detail URLs establish game and list parents without recreating the document', () => {
  const h = harness({ hash: '#records/finished' });
  assert.deepEqual(h.navigation.route(), { page: 'hand', id: 'finished' });
  assert.equal(h.entries.length, 4);
  h.navigation.back();
  assert.equal(h.window.location.hash, '#records');
  h.navigation.back();
  assert.equal(h.window.location.hash, '');
  assert.equal(h.index(), 1);
  assert.deepEqual(recordsRoute('#records/%E0%A4'), { page: 'list' });
  assert.deepEqual(recordsRoute('#records/'), { page: 'list' });
});

test('reload retains valid page depth and returning to list reuses its parent entry', () => {
  const h = harness();
  h.navigation.navigate({ page: 'list' });
  h.navigation.navigate({ page: 'hand', id: 'finished' });
  h.navigation.destroy();
  const reloaded = harness({ entries: h.entries, index: 3, storage: h.storage });
  assert.equal(reloaded.entries.length, 4);
  reloaded.navigation.navigate({ page: 'list' });
  assert.equal(reloaded.index(), 2);
  assert.equal(reloaded.entries.length, 4);
  reloaded.navigation.navigate({ page: 'game' });
  assert.equal(reloaded.index(), 1);
});

test('broken session storage does not prevent routing and destroy removes system listeners', () => {
  const h = harness();
  h.window.sessionStorage.getItem = h.window.sessionStorage.setItem = () => {
    throw Error('blocked');
  };
  h.navigation.navigate({ page: 'list' });
  h.navigation.navigate({ page: 'game' });
  h.navigation.navigate({ page: 'list' });
  h.navigation.destroy();
  h.systemBack();
  assert.deepEqual(h.navigation.route(), { page: 'list' });
});
