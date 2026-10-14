import { test } from 'node:test';
import assert from 'node:assert/strict';
import { numericWidthScale, numericColumnWidth } from '../../src/ui/numeric-width.js';

test('number width fitting preserves ordinary digits and fits the whole overflow without changing height', () => {
  assert.equal(numericWidthScale(45, 55), 1);
  assert.equal(numericWidthScale(55, 55), 1);
  assert.equal(numericWidthScale(74, 55), 55 / 74);
  assert.equal(numericWidthScale(74, 55) * 74, 55);
  for (const values of [
    [0, 55],
    [NaN, 55],
    [50, 0],
    [50, Infinity],
  ])
    assert.equal(numericWidthScale(...values), 1);
});

test('number columns reserve both border/padding edges and the full portrait plus grid gap', () => {
  assert.equal(numericColumnWidth({ profileWidth: 116, padding: 5, avatar: 45 }), 54.75);
  assert.equal(numericColumnWidth({ profileWidth: 164, padding: 7, avatar: 48 }), 95.75);
});
