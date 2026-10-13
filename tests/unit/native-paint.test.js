import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nativeContentBounds, paintDistance } from '../native/paint-parity.mjs';

test('native paint crops Android status bars and CSS safe insets', () => {
  const xml = '<android.webkit.WebView class="android.webkit.WebView" bounds="[0,60][400,760]" />';
  assert.deepEqual(
    nativeContentBounds(
      xml,
      { width: 400, height: 800 },
      { viewport: { width: 200, height: 300 }, insets: { top: 10 } },
    ),
    { left: 0, top: 80, width: 400, height: 600 },
  );
});
test('native paint maps iOS points to screenshot pixels', () => {
  const xml =
    '<XCUIElementTypeApplication width="390" /><XCUIElementTypeWebView x="0" y="0" width="390" />';
  assert.deepEqual(
    nativeContentBounds(
      xml,
      { width: 1170, height: 2532 },
      { viewport: { width: 390, height: 766 }, insets: { top: 44 } },
    ),
    { left: 0, top: 132, width: 1170, height: 2298 },
  );
});
test('paint comparison tolerates small raster noise and rejects repeated tiles', () => {
  const expected = Uint8Array.from([10, 20, 30, 70, 90, 110, 210, 220, 230, 40, 60, 80]);
  assert.equal(paintDistance(expected, expected), 0);
  assert.ok(
    paintDistance(
      expected,
      expected.map((v) => v + 1),
    ) < 0.02,
  );
  const duplicated = Uint8Array.from([10, 20, 30, 10, 20, 30, 10, 20, 30, 10, 20, 30]);
  assert.ok(paintDistance(expected, duplicated) > 0.02);
  assert.throws(() => paintDistance(expected, duplicated.subarray(0, 3)));
});
