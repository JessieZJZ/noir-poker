import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Sample the outer edges, away from status text, cutouts and the gesture pill.
// SystemBars DARK uses light icons, including when old WebViews consume insets.
export function assertAndroidSystemBarContrast(data, width, height, channels = 3) {
  assert.ok(width >= 8 && height >= 8 && channels >= 3);
  assert.equal(data.length, width * height * channels);
  const samples = [];
  for (const y of [2, height - 3]) {
    for (const x of [Math.floor(width * 0.2), Math.floor(width * 0.8)]) {
      const offset = (y * width + x) * channels;
      const rgb = [...data.subarray(offset, offset + 3)];
      const linear = rgb.map((value) => {
        const channel = value / 255;
        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
      });
      const luminance = linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
      const contrast = 1.05 / (luminance + 0.05);
      assert.ok(contrast >= 4.5, `Light system icons need a dark background at ${x},${y}: ${rgb}`);
      samples.push({ x, y, rgb, contrast });
    }
  }
  return samples;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const screenshot = process.argv[2];
  assert.ok(screenshot, 'Provide the installed Android full-device launch screenshot');
  const { default: sharp } = await import('sharp');
  const { data, info } = await sharp(screenshot)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  console.log(
    JSON.stringify(
      {
        screenshot: path.resolve(screenshot),
        width: info.width,
        height: info.height,
        samples: assertAndroidSystemBarContrast(data, info.width, info.height, info.channels),
        status: 'passed',
      },
      null,
      2,
    ),
  );
}
