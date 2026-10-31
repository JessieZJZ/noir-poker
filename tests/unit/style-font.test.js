import { test } from 'node:test';
import assert from 'node:assert/strict';
import { styleFontSize } from '../../src/ui/style-font.js';

test('style fitting preserves text that already fits and accounts for fixed spacing', () => {
  assert.equal(styleFontSize(18, 60, 80), 18);
  const font = styleFontSize(18, 200, 80, 14);
  // Fourteen pixels of fixed spacing remain after the glyphs shrink.
  assert.ok((200 - 14) * (font / 18) + 14 <= 80);
  assert.ok(font > 6);
  assert.ok(200 * (80 / 200) + 14 * (1 - 80 / 200) > 80);
});

test('style fitting can correct a font whose measured glyph widths round upwards', () => {
  const measure = (font) => Math.ceil(font * 12) + 14;
  let font = 18;
  for (let pass = 0; pass < 4; pass++) font = styleFontSize(font, measure(font), 80, 14);
  assert.ok(measure(font) <= 80);
});
