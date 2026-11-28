import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chainProfileTouchScroll } from '../../src/ui/profile-touch-scroll.js';

test('iOS profile drag forwards both edges and keeps scroll inside the profile between them', () => {
  const detail = Object.assign(new EventTarget(), {
    scrollHeight: 700,
    clientHeight: 200,
    scrollTop: 0,
  });
  const settings = { scrollTop: 300 };
  let open = true;
  chainProfileTouchScroll(detail, settings, () => open);
  const touch = (type, x, y, cancelable = true) => {
    const event = new Event(type, { cancelable });
    event.touches = type === 'touchcancel' ? [] : [{ identifier: 1, clientX: x, clientY: y }];
    detail.dispatchEvent(event);
    return event.defaultPrevented;
  };
  touch('touchstart', 20, 70);
  assert.equal(touch('touchmove', 20, 100), true);
  assert.equal(settings.scrollTop, 270);
  assert.equal(touch('touchmove', 20, 85), false);
  detail.scrollTop = 100;
  assert.equal(touch('touchmove', 20, 60), false);
  assert.equal(settings.scrollTop, 270);
  detail.scrollTop = 500;
  assert.equal(touch('touchmove', 25, 30, false), false);
  assert.equal(settings.scrollTop, 300);
  assert.equal(touch('touchmove', 80, 25), false);
  touch('touchcancel');
  assert.equal(touch('touchmove', 80, 0), false);
  open = false;
  touch('touchstart', 20, 50);
  assert.equal(
    touch('touchmove', 20, 0),
    false,
    'The inline profile leaves browser scrolling alone',
  );
  assert.equal(settings.scrollTop, 300);
});
