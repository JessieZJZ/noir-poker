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
    profiles: [],
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

test('installed layout checks reject cramped profiles and tablet type reduced by fitting', () => {
  const layout = {
    width: 1032,
    height: 1376,
    tagCount: 0,
    identityOffset: 0,
    table: { height: 1000, bottom: 1100 },
    dock: { top: 1100 },
    stack: { left: 45, top: 1000, bottom: 1020 },
    position: { right: 40, top: 1000, bottom: 1020 },
    heroAction: null,
    inspection: [],
    publicCards: Array.from({ length: 5 }, (_, index) => ({ left: index * 82, top: 500 })),
    profiles: [
      {
        id: '4',
        padding: [3, 3, 3, 3],
        tagPadding: [1, 3, 1, 3],
        nameSize: 17,
        styleSize: 14,
        stackSize: 17,
      },
    ],
  };
  assert.doesNotThrow(() => assertTableLayout(layout));
  for (const invalid of [
    { padding: [3, 2.99, 3, 3] },
    { tagPadding: [0.99, 3, 1, 3] },
    { tagPadding: [1, 3, 1, 2.99] },
    { nameSize: 16.99 },
    { styleSize: 13.99 },
    { stackSize: 16.99 },
  ])
    assert.throws(
      () => assertTableLayout({ ...layout, profiles: [{ ...layout.profiles[0], ...invalid }] }),
      /Seat 4/,
    );
  assert.doesNotThrow(() =>
    assertTableLayout({
      ...layout,
      width: 390,
      profiles: [{ ...layout.profiles[0], nameSize: 11, styleSize: 9, stackSize: 10 }],
    }),
  );
});
