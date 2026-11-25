import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHistoryLayers } from '../../src/ui/history-layer.js';

// A same-document history: entries keep their state, back() fires popstate
// asynchronously, as browsers do.
function fakeWindow(initial = { noirRecords: { page: 'game' } }) {
  const listeners = [];
  const entries = [initial];
  let index = 0;
  const queue = [];
  const window = {
    location: { href: 'https://example.test/#records' },
    addEventListener: (name, listener) => name === 'popstate' && listeners.push(listener),
    history: {
      get state() {
        return entries[index];
      },
      get length() {
        return entries.length;
      },
      pushState(state) {
        entries.splice(index + 1, Infinity, state);
        index++;
      },
      replaceState(state) {
        entries[index] = state;
      },
      back() {
        queue.push(() => {
          if (index === 0) return;
          index--;
          listeners.forEach((listener) => listener({ state: entries[index] }));
        });
      },
    },
  };
  return { window, flush: () => queue.splice(0).forEach((run) => run()) };
}

test('Back closes the open layer once and keeps the URL and other route state', () => {
  const { window, flush } = fakeWindow();
  const closed = [];
  const layers = createHistoryLayers(window);
  const calculator = layers.register('win-rate', () => closed.push('win-rate'));
  calculator.open();
  assert.deepEqual(window.history.state, { noirRecords: { page: 'game' }, noirLayer: 'win-rate' });
  window.history.back();
  flush();
  assert.deepEqual(closed, ['win-rate']);
  assert.deepEqual(window.history.state, { noirRecords: { page: 'game' } });
  // The layer's own close after Back does not pop a second entry.
  calculator.close();
  flush();
  assert.equal(window.history.length, 2);
  assert.deepEqual(closed, ['win-rate']);
});

test('closing a layer itself drops its entry without calling its Back handler', () => {
  const { window, flush } = fakeWindow();
  const closed = [];
  const tutorial = createHistoryLayers(window).register('tutorial', () => closed.push('tutorial'));
  tutorial.open();
  tutorial.open();
  tutorial.close();
  flush();
  assert.deepEqual(closed, []);
  assert.deepEqual(window.history.state, { noirRecords: { page: 'game' } });
});

test('a layer opened over another takes over the one entry; the old close cannot pop it', () => {
  const { window, flush } = fakeWindow();
  const closed = [];
  const layers = createHistoryLayers(window);
  const calculator = layers.register('win-rate', () => closed.push('win-rate'));
  const tutorial = layers.register('tutorial', () => closed.push('tutorial'));
  calculator.open();
  // The tutorial closes open dialogs; their close events arrive afterwards.
  tutorial.open();
  calculator.close();
  flush();
  assert.equal(window.history.length, 2);
  assert.equal(window.history.state.noirLayer, 'tutorial');
  window.history.back();
  flush();
  assert.deepEqual(closed, ['tutorial']);
});

test('a reload while a layer was open clears the stale marker', () => {
  const { window } = fakeWindow({ noirRecords: { page: 'game' }, noirLayer: 'win-rate' });
  createHistoryLayers(window);
  assert.deepEqual(window.history.state, { noirRecords: { page: 'game' } });
});
