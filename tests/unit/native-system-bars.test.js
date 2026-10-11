import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertAndroidSystemBarContrast } from '../native/system-bars.mjs';

test('native system-bar screenshot rejects white backgrounds and covers the contrast boundary', () => {
  const frame = (value) => Buffer.alloc(10 * 10 * 3, value);
  assert.doesNotThrow(() => assertAndroidSystemBarContrast(frame(16), 10, 10));
  assert.doesNotThrow(() => assertAndroidSystemBarContrast(frame(118), 10, 10));
  for (const value of [119, 250, 255]) {
    assert.throws(() => assertAndroidSystemBarContrast(frame(value), 10, 10), /system icons/);
  }
  // A regression in either native inset region must fail, not just their mean.
  for (const y of [2, 7]) {
    const data = frame(16);
    data.fill(250, (y * 10 + 2) * 3, (y * 10 + 2) * 3 + 3);
    assert.throws(() => assertAndroidSystemBarContrast(data, 10, 10), /system icons/);
  }
});
