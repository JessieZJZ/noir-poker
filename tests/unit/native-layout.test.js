import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertTableLayout } from '../native/layout.mjs';

test('installed layout checks reject inspection outside the position row, including subpixel boundaries', () => {
  const layout = {
    tagCount: 0,
    identityOffset: 0,
    table: { height: 400, bottom: 400 },
    dock: { top: 400 },
    stack: { left: 45, top: 360, bottom: 380 },
    position: { right: 40, top: 360, bottom: 380 },
    heroAction: null,
    publicCards: Array.from({ length: 5 }, (_, index) => ({ left: 10 * index, top: 200 })),
    inspection: [{ id: '2', followsPosition: true, gap: -0.5, centerOffset: 0.5, contained: true }],
  };
  assert.doesNotThrow(() => assertTableLayout(layout));
  for (const invalid of [
    { followsPosition: false },
    { gap: -0.51 },
    { centerOffset: 0.51 },
    { centerOffset: -0.51 },
    { contained: false },
  ]) {
    assert.throws(
      () => assertTableLayout({ ...layout, inspection: [{ ...layout.inspection[0], ...invalid }] }),
      /Seat 2 inspection/,
    );
  }
});
