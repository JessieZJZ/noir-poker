import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHintNotification } from '../../src/ui/hint-notification.js';

function harness() {
  const updates = [],
    callbacks = new Map();
  let next = 0;
  const hint = createHintNotification({
    publish: (value) => updates.push(value),
    setTimer: (callback, delay) => {
      assert.equal(delay, 7000);
      callbacks.set(++next, callback);
      return next;
    },
    clearTimer: (id) => callbacks.delete(id),
  });
  const show = (key, extra = {}) =>
    hint.update({ enabled: true, key, text: `提示 ${key}`, stage: '翻牌策略', ...extra });
  return { hint, show, callbacks, updates };
}

test('seat updates do not restart a decision tip, including after it expires', () => {
  const { show, callbacks, updates } = harness();
  show('hand1-turn1');
  const expire = [...callbacks.values()][0];
  for (let i = 0; i < 10; i++) show('hand1-turn1');
  assert.equal(callbacks.size, 1);
  assert.equal(updates.length, 1);
  expire();
  assert.deepEqual(updates.at(-1), { visible: false });
  show('hand1-turn1');
  assert.equal(callbacks.size, 0);
  assert.equal(updates.length, 2);
});

test('a new street or hand cancels the previous timeout and only shows relevant tips', () => {
  const { show, callbacks, updates } = harness();
  show('hand1-preflop');
  const stale = [...callbacks.values()][0];
  show('hand1-flop');
  stale();
  assert.equal(updates.at(-1).text, '提示 hand1-flop');
  assert.equal(callbacks.size, 1);
  show('hand2-waiting', { notify: false });
  assert.deepEqual(updates.at(-1), { visible: false });
  assert.equal(callbacks.size, 0);
  show('hand2-hero');
  assert.equal(updates.at(-1).text, '提示 hand2-hero');
});

test('disabling or backgrounding cancels tips without replaying stale notifications', () => {
  const { hint, show, callbacks, updates } = harness();
  show('turn1');
  hint.setActive(false);
  assert.equal(callbacks.size, 0);
  assert.deepEqual(updates.at(-1), { visible: false });
  hint.setActive(true);
  show('turn1');
  assert.equal(callbacks.size, 0);
  show('turn2');
  hint.update({ enabled: false });
  assert.equal(callbacks.size, 0);
  show('turn2', { force: true });
  assert.equal(callbacks.size, 1);
  hint.destroy();
  assert.deepEqual(updates.at(-1), { visible: false });
  assert.equal(callbacks.size, 0);
});

test('desktop tips remain visible without a timer and can still be switched off', () => {
  const { hint, show, callbacks, updates } = harness();
  show('desktop-turn', { persistent: true });
  assert.equal(callbacks.size, 0);
  assert.equal(updates.at(-1).visible, true);
  show('desktop-waiting', { persistent: true });
  assert.equal(callbacks.size, 0);
  assert.equal(updates.at(-1).text, '提示 desktop-waiting');
  hint.update({ enabled: false });
  assert.deepEqual(updates.at(-1), { visible: false });
});

test('switching between banner and card cancels stale expiry and restores timed mode', () => {
  const { hint, show, callbacks, updates } = harness();
  show('mobile-turn');
  const oldExpiry = [...callbacks.values()][0];
  show('desktop-turn', { persistent: true });
  oldExpiry();
  assert.equal(callbacks.size, 0);
  assert.equal(updates.at(-1).text, '提示 desktop-turn');
  show('mobile-return');
  assert.equal(callbacks.size, 1);
  [...callbacks.values()][0]();
  assert.deepEqual(updates.at(-1), { visible: false });
  show('desktop-return', { persistent: true });
  hint.setActive(false);
  assert.deepEqual(updates.at(-1), { visible: false });
  assert.equal(callbacks.size, 0);
});
