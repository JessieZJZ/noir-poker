import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const swift = readFileSync(
    new URL('../../ios/App/App/SceneDelegate.swift', import.meta.url),
    'utf8',
  ),
  // Execute the exact JS passed to WKWebView, including its return value.
  // This extracts the literal rather than asserting implementation strings.
  callback = swift.match(/evaluateJavaScript\("""\s*([\s\S]*?)\s*"""\)/)?.[1];
assert.ok(callback, 'The native edge handler must contain its actual WebView callback');

function edge({ page = 'game', body = true, orientation = false, dispatchResult = true } = {}) {
  const events = [],
    context = vm.createContext({
      Event,
      window: {
        dispatchEvent(event) {
          events.push(event);
          return dispatchResult;
        },
        // The callback must leave actual history traversal to the existing
        // records handler or WKWebView; it must not add a second JS Back.
        history: new Proxy(
          {},
          {
            get() {
              throw new Error('Unexpected duplicate JavaScript history navigation');
            },
          },
        ),
      },
      document: {
        body: body ? { dataset: { recordsPage: page } } : null,
        querySelector(selector) {
          assert.equal(selector, '#orientation-dialog[open]');
          return orientation ? { open: true } : null;
        },
      },
    });
  return { result: vm.runInContext(callback, context), events };
}

test('actual iOS edge callback dispatches one existing records Back event for a hand or list', () => {
  for (const page of ['hand', 'list']) {
    const { result, events } = edge({ page });
    assert.equal(result, true, `${page}: Swift must treat this as handled`);
    assert.equal(events.length, 1);
    assert.ok(events[0] instanceof Event);
    assert.equal(events[0].type, 'noir:records-back');
  }
});

test('game, privacy and unknown/uninitialized pages return false for the actual WK predecessor', () => {
  for (const state of [
    { page: 'game' },
    { page: 'privacy' },
    { page: 'unknown' },
    { page: '' },
    { page: null },
    { body: false },
  ]) {
    const { result, events } = edge(state);
    assert.equal(result, false);
    assert.deepEqual(events, []);
  }
});

test('orientation modal consumes edge Back before records or WK fallback on every page', () => {
  for (const state of [
    { page: 'hand' },
    { page: 'list' },
    { page: 'game' },
    { page: 'privacy' },
    { page: 'unknown' },
    { body: false },
  ]) {
    const { result, events } = edge({ ...state, orientation: true });
    assert.equal(result, true, 'Native must not leave an orientation modal via WK Back');
    assert.deepEqual(events, []);
  }
});

test('records remains handled when the event dispatch return value is false, preventing a second fallback', () => {
  const { result, events } = edge({ page: 'hand', dispatchResult: false });
  assert.equal(result, true);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'noir:records-back');
});
