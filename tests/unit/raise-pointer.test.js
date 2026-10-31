import test from 'node:test';
import assert from 'node:assert/strict';
import { attachRaisePointer } from '../../src/ui/raise-pointer.js';

function setup(t) {
  const previous = { document: globalThis.document, getComputedStyle: globalThis.getComputedStyle };
  globalThis.document = new EventTarget();
  globalThis.getComputedStyle = () => ({ getPropertyValue: () => '15px' });
  const input = new EventTarget();
  Object.assign(input, {
    value: '500000',
    disabled: false,
    getBoundingClientRect: () => ({ left: 0, width: 415 }),
  });
  let context = 1;
  const captured = new Set();
  input.setPointerCapture = (id) => captured.add(id);
  input.hasPointerCapture = (id) => captured.has(id);
  input.releasePointerCapture = (id) => captured.delete(id);
  const detach = attachRaisePointer(input, { context: () => context, limit: 1000000 });
  t.after(() => {
    detach();
    Object.assign(globalThis, previous);
  });
  const send = (type, x = 87.5, id = 1, pointerType = 'touch') => {
    const event = Object.assign(new Event(type, { cancelable: true }), {
      clientX: x,
      pointerId: id,
      pointerType,
    });
    input.dispatchEvent(event);
    return event;
  };
  return { input, send, captured, next: () => context++, detach };
}

test('touch can start away from the thumb, move continuously and finish without snapping', (t) => {
  const { input, send, captured } = setup(t);
  const previews = [],
    commits = [];
  input.addEventListener('input', () => previews.push(input.value));
  input.addEventListener('change', () => commits.push(input.value));
  assert.equal(send('pointerdown').defaultPrevented, true);
  assert.equal(input.value, '200000');
  assert.ok(captured.has(1));
  send('pointermove', 299.5);
  send('pointerup', 0);
  assert.equal(input.value, '730000');
  assert.deepEqual(previews, ['200000', '730000']);
  assert.deepEqual(commits, ['730000']);
  assert.equal(captured.size, 0);
  send('pointerdown', -50);
  assert.equal(input.value, '0');
  send('pointermove', 500);
  assert.equal(input.value, '1000000');
});

test('disabled turns, new decisions, cancellation and background prevent stale touch commits', (t) => {
  const { input, send, next, detach } = setup(t);
  let commits = 0;
  input.addEventListener('change', () => commits++);
  assert.equal(send('pointerdown', 80, 1, 'mouse').defaultPrevented, false);
  assert.equal(input.value, '500000');
  send('pointerdown');
  next();
  send('pointermove', 300);
  send('pointerup');
  assert.equal(input.value, '200000');
  assert.equal(commits, 0);
  send('pointerdown');
  input.disabled = true;
  send('pointermove', 300);
  send('pointerup');
  assert.equal(commits, 0);
  input.disabled = false;
  send('pointerdown');
  send('pointercancel');
  send('pointerup');
  assert.equal(commits, 0);
  send('pointerdown');
  document.hidden = true;
  document.dispatchEvent(new Event('visibilitychange'));
  send('pointerup');
  assert.equal(commits, 0);
  detach();
  send('pointerdown', 300);
  assert.equal(input.value, '200000');
});
