import test from 'node:test';
import assert from 'node:assert/strict';
import { nativePoint } from '../../scripts/native-pointer.mjs';
test('native touch maps real WebView origins and scale without guessing status-bar offsets', () => {
  assert.deepEqual(
    nativePoint(
      { x: 201, y: 650 },
      { width: 402, height: 874 },
      { x: 0, y: 0, width: 402, height: 874 },
    ),
    { x: 201, y: 650 },
  );
  assert.deepEqual(
    nativePoint(
      { x: 100, y: 200 },
      { width: 400, height: 800 },
      { x: 12, y: 59, width: 200, height: 400 },
    ),
    { x: 62, y: 159 },
  );
});
test('native touch rejects clipped, invalid and mismatched surfaces instead of silently tapping another control', () => {
  const viewport = { width: 400, height: 800 },
    frame = { x: 0, y: 0, width: 400, height: 800 };
  for (const target of [
    { x: -1, y: 10 },
    { x: 400, y: 10 },
    { x: 10, y: 800 },
    { x: NaN, y: 10 },
  ])
    assert.throws(() => nativePoint(target, viewport, frame));
  assert.throws(
    () => nativePoint({ x: 10, y: 10 }, viewport, { ...frame, height: 400 }),
    /aspect ratio/,
  );
});

test('Android density-scaled WebView maps the rail midpoint including its native frame origin', () => {
  assert.deepEqual(
    nativePoint(
      { x: 180, y: 620 },
      { width: 360, height: 720 },
      { x: 0, y: 72, width: 1080, height: 2160 },
    ),
    { x: 540, y: 1932 },
  );
  assert.throws(
    () =>
      nativePoint(
        { x: 180, y: 620 },
        { width: 360, height: 720 },
        { x: 0, y: 72, width: 1080, height: 1920 },
      ),
    /aspect ratio/,
  );
});
