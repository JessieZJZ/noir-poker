import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStableViewport } from '../../src/ui/stable-viewport.js';

test('compact height ignores browser bar, keyboard and page-flow height changes', () => {
  const viewport = createStableViewport();
  const read = (height) =>
    viewport.read({ width: 390, height, orientation: 'portrait-primary', compact: true });
  assert.equal(read(744).height, 744);
  for (const height of [844, 650, 390, 844, 744]) assert.equal(read(height).height, 744);
});

test('real width, orientation and explicit configuration changes establish a new budget', () => {
  const viewport = createStableViewport();
  const read = (width, height, orientation = 'portrait-primary') =>
    viewport.read({ width, height, orientation, compact: true });
  assert.equal(read(390, 744).height, 744);
  assert.equal(read(440, 856).height, 856);
  assert.equal(read(440, 956).height, 856);
  assert.equal(read(440, 360, 'landscape-primary').height, 360);
  viewport.reset();
  assert.equal(read(440, 900).height, 900);
});

test('desktop window height resizing remains responsive', () => {
  const viewport = createStableViewport();
  for (const height of [900, 700, 1050])
    assert.equal(
      viewport.read({ width: 1280, height, orientation: '', compact: false }).height,
      height,
    );
});
