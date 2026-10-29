import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStableViewport, readPlayViewport } from '../../src/ui/stable-viewport.js';

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

test('tablet rotation never keeps an intermediate height at the final portrait width', () => {
  const viewport = createStableViewport();
  viewport.read({ width: 1440, height: 960, orientation: 'landscape-primary', compact: false });
  // DevTools and split-screen rotation can report the new width before the
  // final height, without changing screen.orientation.type.
  for (const height of [600, 1000, 1440]) {
    assert.equal(
      viewport.read({ width: 960, height, orientation: 'landscape-primary', compact: height > 960 })
        .height,
      height,
    );
  }
  for (const height of [500, 850, 1024]) {
    assert.equal(
      viewport.read({ width: 768, height, orientation: 'portrait-primary', compact: true }).height,
      height,
    );
  }
});

test('height stabilization stops at the phone boundary, including same-width tablet resizing', () => {
  const viewport = createStableViewport();
  const read = (width, height) =>
    viewport.read({ width, height, orientation: 'portrait-primary', compact: true }).height;
  assert.equal(read(600, 900), 900);
  assert.equal(read(600, 700), 900);
  assert.equal(read(601, 900), 900);
  assert.equal(read(601, 1200), 1200);
});

test('tablets read the actual layout height even when the small-viewport probe is stale', (t) => {
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    matchMedia: globalThis.matchMedia,
  };
  t.after(() => Object.assign(globalThis, previous));
  const probe = { style: {}, getBoundingClientRect: () => ({ height: 600 }) };
  globalThis.document = { createElement: () => probe, body: { append() {} } };
  globalThis.matchMedia = () => ({ matches: true });
  globalThis.window = {
    innerWidth: 768,
    innerHeight: 1024,
    screen: { orientation: { type: 'portrait-primary' } },
  };
  assert.equal(readPlayViewport().height, 1024);
  window.innerHeight = 1200;
  assert.equal(readPlayViewport().height, 1200);
  window.innerWidth = 390;
  window.innerHeight = 844;
  assert.equal(readPlayViewport().height, 600);
  window.innerHeight = 740;
  assert.equal(
    readPlayViewport().height,
    600,
    'phone browser bars still retain the small-viewport budget',
  );
});
