import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDialogScrollLock } from '../../src/ui/dialog-scroll-lock.js';
function fixture() {
  const style = () => ({
    getPropertyValue(key) {
      return this[key] || '';
    },
    getPropertyPriority(key) {
      return this.priorities?.[key] || '';
    },
    setProperty(key, value, priority = '') {
      this[key] = value;
      this.priorities ||= {};
      this.priorities[key] = priority;
    },
    removeProperty(key) {
      delete this[key];
    },
  });
  const doc = { documentElement: { style: style(), dataset: {} }, body: { style: style() } };
  doc.body.style.setProperty('position', 'relative');
  doc.body.style.setProperty('width', '80%', 'important');
  doc.documentElement.style.setProperty('overflow', 'clip', 'important');
  let changed;
  const scrolls = [],
    events = [];
  const win = {
    scrollX: 7,
    scrollY: 120.5,
    scrollTo(x, y) {
      this.scrollX = x;
      this.scrollY = y;
      scrolls.push([x, y]);
    },
    dispatchEvent(event) {
      events.push(event.type);
    },
    MutationObserver: class {
      constructor(fn) {
        changed = fn;
      }
      observe() {}
    },
  };
  const listeners = {};
  const dialog = {
    open: false,
    addEventListener(name, fn) {
      listeners[name] = fn;
    },
    showModal() {
      this.open = true;
      win.scrollY = 0;
      changed();
    },
    close() {
      this.open = false;
      listeners.close();
      changed();
    },
  };
  return { doc, win, dialog, scrolls, events };
}
test('dialog freezes the original page and restores scroll and inline styles exactly once', () => {
  const { doc, win, dialog, scrolls, events } = fixture();
  const lock = createDialogScrollLock(dialog, win, doc);
  lock.open();
  lock.open();
  assert.equal(doc.body.style.top, '-120.5px');
  assert.equal(doc.body.style.position, 'fixed');
  assert.equal(doc.documentElement.dataset.homeScrollLocked, 'true');
  dialog.close();
  assert.deepEqual(scrolls, [[7, 120.5]]);
  assert.deepEqual(events, ['resize']);
  assert.equal(doc.body.style.position, 'relative');
  assert.equal(doc.body.style.width, '80%');
  assert.equal(doc.body.style.getPropertyPriority('width'), 'important');
  assert.equal(doc.documentElement.style.overflow, 'clip');
  assert.equal(doc.documentElement.style.getPropertyPriority('overflow'), 'important');
  assert.equal(doc.documentElement.dataset.homeScrollLocked, undefined);
});
test('failed dialog opening cannot leave the page locked', () => {
  const { doc, win, dialog, scrolls } = fixture();
  dialog.showModal = () => {
    throw Error('Cannot open');
  };
  const lock = createDialogScrollLock(dialog, win, doc);
  assert.throws(() => lock.open(), /Cannot open/);
  assert.equal(doc.body.style.position, 'relative');
  assert.equal(doc.documentElement.dataset.homeScrollLocked, undefined);
  assert.deepEqual(scrolls, [[7, 120.5]]);
});
