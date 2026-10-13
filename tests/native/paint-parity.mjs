import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';

export function nativeContentBounds(xml, bitmap, snapshot) {
  const android = xml.match(
    /<(?:node|android\.webkit\.WebView)\b[^>]*class="android\.webkit\.WebView"[^>]*>/,
  )?.[0];
  let x, y, width;
  if (android) {
    const b = android.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
    assert.ok(b, 'Native WebView bounds must be available');
    x = Number(b[1]);
    y = Number(b[2]);
    width = Number(b[3]) - x;
  } else {
    const view = xml.match(/<XCUIElementTypeWebView\b[^>]*>/)?.[0];
    const app = xml.match(/<XCUIElementTypeApplication\b[^>]*>/)?.[0];
    assert.ok(view && app, 'Native WebView and screen bounds must be available');
    const value = (tag, key) => Number(tag.match(new RegExp(`${key}="([^\"]+)"`))?.[1]);
    const pixels = bitmap.width / value(app, 'width');
    x = value(view, 'x') * pixels;
    y = value(view, 'y') * pixels;
    width = value(view, 'width') * pixels;
  }
  const scale = width / snapshot.viewport.width;
  const left = Math.round(x),
    top = Math.round(y + snapshot.insets.top * scale);
  return {
    left,
    top,
    width: Math.min(Math.round(width), bitmap.width - left),
    height: Math.min(Math.round(snapshot.viewport.height * scale), bitmap.height - top),
  };
}

export function paintDistance(a, b) {
  assert.equal(a.length, b.length);
  assert.ok(a.length > 0);
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference += Math.abs(a[i] - b[i]);
  return difference / (a.length * 255);
}

export async function compareNativePaint(capture, webImage, snapshot) {
  const nativeImage = sharp(capture.imagePath);
  const bounds = nativeContentBounds(
    await readFile(capture.sourcePath, 'utf8'),
    await nativeImage.metadata(),
    snapshot,
  );
  // Compare broad painted structure. Small text antialiasing and animated
  // glows differ between WebViews; duplicated or missing raster tiles do not.
  const grid = (image) => image.removeAlpha().resize(24, 48, { fit: 'fill' }).raw().toBuffer();
  const [nativePixels, webPixels] = await Promise.all([
    grid(nativeImage.extract(bounds)),
    grid(sharp(webImage)),
  ]);
  return {
    meanChannelError: paintDistance(nativePixels, webPixels),
    limit: 0.02,
    bounds,
    grid: [24, 48],
  };
}
