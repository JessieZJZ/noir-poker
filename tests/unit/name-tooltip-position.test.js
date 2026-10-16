import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nameTooltipPosition } from '../../src/ui/name-tooltip-position.js';

test('full-name tooltips choose a clear side and stay inside phone safe edges', () => {
  const size = { width: 180, height: 40 };
  const viewport = { width: 320, height: 568, top: 60, bottom: 34 };
  const upper = nameTooltipPosition({ left: 4, top: 75, width: 30, height: 20 }, size, viewport);
  assert.equal(upper.placement, 'below');
  assert.equal(upper.left, 12);
  assert.equal(upper.top, 103);
  const lower = nameTooltipPosition({ left: 290, top: 510, width: 25, height: 18 }, size, viewport);
  assert.equal(lower.placement, 'above');
  assert.equal(lower.left + size.width, 308);
  assert.equal(lower.top, 462);
  assert.ok(lower.arrow >= 12 && lower.arrow <= size.width - 12);
});
