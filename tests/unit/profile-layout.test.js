import test from 'node:test';
import assert from 'node:assert/strict';
import { profileDetailBounds } from '../../src/ui/profile-layout.js';

// The settings body shows 0–600; the choices are 900px tall on a phone and
// 400px on a tablet.
const viewport = { top: 0, bottom: 600 };
const at = (top, height, opened) =>
  profileDetailBounds({ region: { top, height }, viewport, clientHeight: 600, opened });
const previous = (top, height) => {
  const size = Math.min(height, 600);
  return {
    top: Math.max(viewport.top, Math.min(top, viewport.bottom - size)) - top,
    height: size,
  };
};

test('opening places the introduction where it was placed before', () => {
  for (const [top, height] of [
    [-300, 900],
    [0, 900],
    [-100, 400],
    [100, 400],
    [450, 400],
  ])
    assert.deepEqual(at(top, height), previous(top, height));
  // Choices starting low on a tablet: it starts 250px above them to fit.
  assert.deepEqual(at(450, 400), { top: -250, height: 400 });
});

test('scrolling the settings past the choices takes the introduction along', () => {
  // Phone, opened 300px into the choices: it stays over the visible choices,
  // then leaves with their end or their start.
  assert.deepEqual(at(-200, 900, 300), { top: 200, height: 600 });
  assert.deepEqual(at(-500, 900, 300), { top: 300, height: 600 });
  assert.deepEqual(at(-700, 900, 300), { top: 300, height: 600 });
  assert.deepEqual(at(100, 900, 300), { top: 0, height: 600 });
  // Tablet opened low (250px above the choices): scrolling back up moves it
  // down with them; scrolling on keeps it over them.
  assert.deepEqual(at(700, 400, -250), { top: -250, height: 400 });
  assert.deepEqual(at(-150, 400, -250), { top: 0, height: 400 });
  // Opened with the choices above the screen, reaching 100px past their end.
  assert.deepEqual(at(-300, 400, 100), { top: 100, height: 400 });
  assert.deepEqual(at(200, 400, 100), { top: 0, height: 400 });
});
