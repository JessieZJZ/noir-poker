import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dismissDialog, trackDialogBack } from '../../src/ui/dialog-back.js';

function fakeDialog(id, { keepOpen = false } = {}) {
  const listeners = {};
  const dialog = {
    id,
    localName: 'dialog',
    open: true,
    addEventListener: (name, fn) => (listeners[name] ||= []).push(fn),
    dispatchEvent(event) {
      for (const fn of listeners[event.type] || []) fn(event);
      return !event.defaultPrevented;
    },
    close() {
      dialog.open = false;
      for (const fn of listeners.close || []) fn(new Event('close'));
    },
  };
  if (keepOpen)
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      dialog.subView = false;
    });
  return dialog;
}

test('Back on a dialog acts like Esc: a cancel handler keeps it open for its sub-view', () => {
  const settings = fakeDialog('opponents-dialog', { keepOpen: true });
  settings.subView = true;
  assert.equal(dismissDialog(settings), false);
  assert.equal(settings.open, true);
  assert.equal(settings.subView, false);
  const review = fakeDialog('review-dialog');
  assert.equal(dismissDialog(review), true);
  assert.equal(review.open, false);
});

test('opening a dialog takes a history layer; its Back closes it; its own close drops the layer', () => {
  let observe;
  const events = [];
  const document = {
    documentElement: {},
    defaultView: {
      MutationObserver: class {
        constructor(callback) {
          observe = callback;
        }
        observe() {}
        disconnect() {}
      },
    },
    querySelectorAll: () => [],
  };
  const backs = new Map();
  const layers = {
    register(key, onBack) {
      backs.set(key, onBack);
      return { open: () => events.push(['open', key]), close: () => events.push(['close', key]) };
    },
  };
  trackDialogBack(document, layers);
  const review = fakeDialog('review-dialog');
  const tutorial = fakeDialog('tutorial-dialog');
  observe([{ target: review }, { target: tutorial }]);
  assert.deepEqual(events, [['open', 'dialog:review-dialog']], 'The tutorial has its own Back');
  backs.get('dialog:review-dialog')();
  assert.equal(review.open, false);
  assert.deepEqual(events.at(-1), ['close', 'dialog:review-dialog']);
  // A dialog that only closes a sub-view on Back keeps its layer.
  const settings = fakeDialog('opponents-dialog', { keepOpen: true });
  observe([{ target: settings }]);
  backs.get('dialog:opponents-dialog')();
  assert.equal(settings.open, true);
  assert.deepEqual(events.at(-1), ['open', 'dialog:opponents-dialog']);
});
