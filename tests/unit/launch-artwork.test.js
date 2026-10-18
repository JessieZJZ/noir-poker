import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';

test('launch artwork has genuine transparent corners and composites without a dark rectangle', async () => {
  const icon = new URL('../../public/launch-icon.png', import.meta.url);
  const { data, info } = await sharp(icon.pathname)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  assert.equal(info.channels, 4);
  for (const [x, y] of [
    [0, 0],
    [info.width - 1, 0],
    [0, info.height - 1],
    [info.width - 1, info.height - 1],
  ])
    assert.equal(data[(y * info.width + x) * 4 + 3], 0);
  assert.ok(
    data[(Math.floor(info.height / 2) * info.width + Math.floor(info.width / 2)) * 4 + 3] >= 250,
  );
  const composite = await sharp({
    create: { width: info.width, height: info.height, channels: 3, background: '#0b1017' },
  })
    .composite([{ input: icon.pathname }])
    .raw()
    .toBuffer();
  assert.deepEqual([...composite.subarray(0, 3)], [11, 16, 23]);
});
