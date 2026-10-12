import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import sharp from 'sharp';

export function readCardRankState() {
  return {
    width: innerWidth,
    height: innerHeight,
    textCount: document.querySelectorAll('#hero-cards svg text').length,
    ranks: [...document.querySelectorAll('#hero-cards .card-art > .card-rank')].map((rank) => {
      const rect = rank.getBoundingClientRect();
      return {
        rank: rank.dataset.rank,
        path: rank.querySelector('path').getAttribute('d'),
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      };
    }),
  };
}

export async function readNativeRankInk(capture, state) {
  const xml = readFileSync(capture.sourcePath, 'utf8');
  const { data, info } = await sharp(capture.imagePath)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const android = xml.match(
    /<(?:node|android\.webkit\.WebView)\b[^>]*class="android\.webkit\.WebView"[^>]*>/,
  )?.[0];
  const ios = xml.match(/<XCUIElementTypeWebView\b[^>]*>/)?.[0];
  let x, y, scale;
  if (android) {
    const bounds = android.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
    assert.ok(bounds, 'Native WebView bounds are required for screen-pixel mapping');
    x = Number(bounds[1]);
    y = Number(bounds[2]);
    scale = (Number(bounds[3]) - x) / state.width;
  } else {
    assert.ok(ios, 'Native WebView must be present in the screen source');
    const value = (name) => Number(ios.match(new RegExp(`${name}="([^\"]+)"`))?.[1]);
    const screen = xml.match(/<XCUIElementTypeApplication\b[^>]*>/)?.[0];
    const screenWidth = Number(screen?.match(/width="([^\"]+)"/)?.[1]);
    assert.ok(screenWidth > 0);
    const pixels = info.width / screenWidth;
    x = value('x') * pixels;
    y = value('y') * pixels;
    scale = (value('width') * pixels) / state.width;
  }
  return state.ranks.map(({ rank, rect }) => {
    const left = Math.max(0, Math.floor(x + (rect.x - 2) * scale));
    const top = Math.max(0, Math.floor(y + (rect.y - 2) * scale));
    const right = Math.min(info.width, Math.ceil(x + (rect.x + rect.width + 2) * scale));
    const bottom = Math.min(info.height, Math.ceil(y + (rect.y + rect.height + 2) * scale));
    let minX = right,
      maxX = left - 1,
      minY = bottom,
      maxY = top - 1,
      pixels = 0;
    for (let py = top; py < bottom; py++)
      for (let px = left; px < right; px++) {
        const index = (py * info.width + px) * info.channels;
        const [red, green, blue] = data.subarray(index, index + 3);
        if (
          (red < 140 && green < 140 && blue < 140) ||
          (red > 120 && red > green * 1.2 && red > blue * 1.08)
        ) {
          pixels++;
          minX = Math.min(minX, px);
          maxX = Math.max(maxX, px);
          minY = Math.min(minY, py);
          maxY = Math.max(maxY, py);
        }
      }
    assert.ok(pixels > 0, `Rank ${rank} must actually paint on the native screenshot`);
    return { rank, width: maxX - minX + 1, height: maxY - minY + 1, pixels };
  });
}

export function assertStableRankInk(before, after) {
  assert.equal(after.length, before.length);
  for (let i = 0; i < before.length; i++) {
    const a = before[i],
      b = after[i];
    assert.equal(b.rank, a.rank);
    assert.ok(
      Math.abs(a.width - b.width) <= 1 && Math.abs(a.height - b.height) <= 1,
      `Rank ${a.rank} changed painted dimensions`,
    );
    assert.ok(
      Math.abs(a.pixels - b.pixels) / a.pixels <= 0.07,
      `Rank ${a.rank} changed painted weight`,
    );
  }
}
