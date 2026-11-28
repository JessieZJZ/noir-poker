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

test('return to the live table waits for dialog layers and their history traversal', async () => {
  const { window, flush } = fakeWindow({ noirRecords: { page: 'hand' } });
  const layers = createHistoryLayers(window);
  const guide = layers.register('guide');
  const settings = layers.register('settings');
  guide.open();
  settings.open();
  let returned = false;
  const ready = layers.whenClosed().then(() => (returned = true));
  settings.close();
  guide.close();
  await Promise.resolve();
  assert.equal(returned, false);
  flush();
  await ready;
  assert.equal(returned, true);
  assert.deepEqual(window.history.state, { noirRecords: { page: 'hand' } });
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

test('stacked layers: Back closes the top one and gives the entry back to the one beneath', () => {
  const { window, flush } = fakeWindow();
  const closed = [];
  const layers = createHistoryLayers(window);
  const calculator = layers.register('win-rate', () => closed.push('win-rate'));
  const picker = layers.register('dialog:win-rate-picker', () => closed.push('picker'));
  calculator.open();
  picker.open();
  assert.equal(window.history.length, 2, 'Layers share one entry');
  window.history.back();
  flush();
  assert.deepEqual(closed, ['picker']);
  assert.equal(window.history.state.noirLayer, 'win-rate');
  window.history.back();
  flush();
  assert.deepEqual(closed, ['picker', 'win-rate']);
  assert.deepEqual(window.history.state, { noirRecords: { page: 'game' } });
  // A layer that stays open (a sub-view closed instead) takes its entry back.
  const settings = layers.register('dialog:settings', () => settings.open());
  settings.open();
  window.history.back();
  flush();
  assert.equal(window.history.state.noirLayer, 'dialog:settings');
});

test('a layer opened while the previous layer’s entry is being popped keeps Back', () => {
  const { window, flush } = fakeWindow();
  const closed = [];
  const layers = createHistoryLayers(window);
  const guide = layers.register('dialog:rules-dialog', () => closed.push('guide'));
  const tutorial = layers.register('tutorial', () => closed.push('tutorial'));
  guide.open();
  // Starting the tutorial from the guide: the guide closes, then the tutorial
  // opens before the guide's entry has been popped.
  guide.close();
  tutorial.open();
  flush();
  assert.deepEqual(closed, [], 'The pop of the guide entry does not close the tutorial');
  assert.equal(window.history.state.noirLayer, 'tutorial');
  window.history.back();
  flush();
  assert.deepEqual(closed, ['tutorial']);
});
