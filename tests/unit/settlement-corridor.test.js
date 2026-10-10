import { test } from 'node:test';
import assert from 'node:assert/strict';
import { minimalSeatShift } from '../../src/ui/settlement-layout.js';

const bounds = { left: 0, right: 302 };
const corridor = { left: 72.5, right: 229.5 };

test('edge-clamped seats retain the pot clearance after the fractional mobile fit', () => {
  // The 320px, named nine-player settlement has a 302px logical arena,
  // a pot spanning x=85..217 and 72px-wide side profiles. Leave the intended
  // 12.5px corridor even when a profile reaches the outer arena edge.
  const left = { left: 3.25, right: 75.25 };
  const right = { left: 226.75, right: 298.75 };
  const leftShift = minimalSeatShift(true, left, corridor, bounds);
  const rightShift = minimalSeatShift(false, right, corridor, bounds);
  assert.equal(leftShift, -2.75);
  assert.equal(rightShift, 2.75);
  assert.equal(left.left + leftShift, 0.5);
  assert.equal(right.right + rightShift, 301.5);

  // getBoundingClientRect rounds the fitted coordinates independently.
  // The CI regression's measured width ratio is slightly above 809/900;
  // exact logical 12px clearance is insufficient under strict comparison.
  const scale = 809 / 900;
  const measuredScale = 0.8988889984737168;
  const visual = (x) => Math.fround(24.2678 + x * scale);
  const requiredGap = 12 * measuredScale;
  assert.ok(visual(229) - visual(217) < requiredGap);
  assert.ok(visual(85) - visual(left.right + leftShift) > requiredGap);
  assert.ok(visual(right.left + rightShift) - visual(217) > requiredGap);
});

test('a clear seat stays in place and a freely movable seat moves only the missing distance', () => {
  assert.equal(minimalSeatShift(true, { left: 1, right: 72 }, corridor, bounds), -0);
  assert.equal(minimalSeatShift(false, { left: 230, right: 301 }, corridor, bounds), 0);
  assert.equal(minimalSeatShift(true, { left: 10, right: 82 }, corridor, bounds), -9.5);
  assert.equal(minimalSeatShift(false, { left: 220, right: 292 }, corridor, bounds), 9.5);
});

test('an impossible horizontal corridor never pushes a footprint beyond the arena', () => {
  const narrow = { left: 50, right: 252 };
  assert.equal(minimalSeatShift(true, { left: 3.25, right: 75.25 }, narrow, bounds), -2.75);
  assert.equal(minimalSeatShift(false, { left: 226.75, right: 298.75 }, narrow, bounds), 2.75);
  assert.equal(minimalSeatShift(true, { left: 0.25, right: 72.25 }, narrow, bounds), -0);
});
