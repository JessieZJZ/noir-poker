import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nearestClearTop } from '../../src/ui/settlement-layout.js';
import {
  preferSinglePublicRow,
  publicGroupTop,
  smallestClearHeight,
} from '../../src/ui/play-geometry.js';

test('five-card rows survive a small scale cost and crowded short tables keep the larger two-row fit', () => {
  assert.equal(preferSinglePublicRow(640, 607), true);
  assert.equal(preferSinglePublicRow(575, 487), false);
  assert.equal(preferSinglePublicRow(500, 460), true);
  assert.equal(preferSinglePublicRow(501, 460), false);
  assert.equal(preferSinglePublicRow(450, 450), true);
  // A 440x900 five-seat table retains the row after crown-hand clearance.
  assert.equal(preferSinglePublicRow(665, 607, 5), true);
  assert.equal(preferSinglePublicRow(665, 607, 9), false);
  // Two-line action slots must not prematurely wrap a five-seat public row.
  assert.equal(preferSinglePublicRow(500, 420, 5), true);
  assert.equal(preferSinglePublicRow(501, 420, 5), false);
});

test('public cards move above the felt midpoint without depending on deal state', () => {
  assert.equal(publicGroupTop(28, 600, 100), 242);
  assert.equal(publicGroupTop(28, 600, 160), 212);
  assert.equal(publicGroupTop(28, 600, 160) + 80, 292);
  assert.equal(publicGroupTop(28, 600, 100) + 50, 292);
});

test('SE corridor growth uses the first fitting pixel rather than the guaranteed 823px band', () => {
  const seen = [];
  assert.equal(
    smallestClearHeight(450, 823, (height) => {
      seen.push(height);
      return height >= 454;
    }),
    454,
  );
  assert.ok(seen.length <= 9);
  assert.equal(
    smallestClearHeight(450, 823, () => true),
    450,
  );
  assert.equal(
    smallestClearHeight(450, 823, (height) => height >= 823),
    823,
  );
  assert.equal(
    smallestClearHeight(453.2, 454.2, (height) => height >= 454),
    454,
  );
});

test('a taller two-row board uses the nearest clear edge instead of a distant seat band', () => {
  // A 375px phone reserves 134px for two rows. A side seat blocks tops
  // between 160 and 220, so the centered public group moves only 24px.
  assert.equal(nearestClearTop(196, 40, 244, [[160, 220]]), 220);
  assert.equal(nearestClearTop(190, 40, 244, [[160, 220]]), 160);
  assert.equal(nearestClearTop(100, 40, 244, [[160, 220]]), 100);
});

test('overlapping player footprints cannot produce a false free position', () => {
  assert.equal(
    nearestClearTop(100, 0, 300, [
      [40, 160],
      [120, 230],
    ]),
    40,
  );
  assert.equal(
    nearestClearTop(200, 0, 300, [
      [40, 160],
      [120, 230],
    ]),
    230,
  );
  assert.equal(
    nearestClearTop(100, 50, 200, [
      [40, 160],
      [120, 230],
    ]),
    null,
  );
  assert.equal(nearestClearTop(100, 150, 120, []), null);
});

test('fractional clearance remains stable at the exact fitted phone boundary', () => {
  assert.equal(nearestClearTop(160.25, 40.5, 220.5, [[160, 220.5]]), 160);
  assert.equal(nearestClearTop(250, 40.5, 220.5, [[160, 220.5]]), 220.5);
});
