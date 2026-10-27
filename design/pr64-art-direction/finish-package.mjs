import { chromium } from '@playwright/test';
import { cp, mkdir, copyFile, readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { themes, devices, screens, base } from './manifest.mjs';
const output = path.resolve('.artifacts/art-direction-pr64/green-v2');
const media = JSON.parse(await readFile(path.join(output, 'videos/media-audit.json'), 'utf8'));
assert.equal(
  media.recordings.length,
  7,
  'Finish all six corrected recordings and comparison before packaging',
);
assert(
  media.recordings.every((record) => record.duration === 36),
  'Every final recording must be 36 seconds',
);
assert.equal(media.renderingVersion, 'green-v2-front-fan-clear-hud-2026-10-27');
for (const record of media.recordings)
  assert.equal(
    createHash('sha256')
      .update(await readFile(path.join(output, record.path)))
      .digest('hex'),
    record.sha256,
    `Media bytes do not match the final audit: ${record.path}`,
  );
for (const theme of themes)
  for (const device of ['desktop', 'ios']) {
    const record = media.recordings.find(
      (entry) => entry.theme === theme.id && entry.device === device,
    );
    assert(record, `Missing corrected recording: ${theme.id}/${device}`);
    for (const time of [15.7, 18.9, 21.1]) {
      const check = record.scenes?.core?.faceChecks?.find(
        (entry) => Math.abs(entry.time - time) < 0.03,
      );
      assert(
        check?.foldedOpponentCardsRemainBacks &&
          check.hudReadability?.nameAndStackClear &&
          check.hudReadability?.upperHudClear &&
          check.hudReadability?.elementHitPass &&
          check.hudReadability?.fontsUnchanged &&
          check.opponent[0].rank === 'K' &&
          check.opponent[1].rank === 'J' &&
          check.opponent.every(
            (card) => card.frontDisplay === 'block' && card.backDisplay === 'none',
          ),
        `Unverified showdown/HUD at ${theme.id}/${device}/${time}`,
      );
    }
  }
await mkdir(path.join(output, 'overviews'), { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1800, height: 1120 } });
for (const t of themes) {
  await page.goto('http://127.0.0.1:4394/board.html?theme=' + t.id, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(output, 'overviews', t.id + '.png') });
}
await page.setViewportSize({ width: 1440, height: 1100 });
await page.goto('http://127.0.0.1:4394/', { waitUntil: 'networkidle' });
await page.screenshot({ path: path.join(output, 'overviews', 'gallery.png') });
for (const t of themes) {
  await page.setViewportSize({ width: 1800, height: 1660 });
  await page.goto('http://127.0.0.1:4394/fit-board.html?theme=' + t.id, {
    waitUntil: 'networkidle',
  });
  await page.screenshot({ path: path.join(output, 'overviews', t.id + '-fit.png') });
}
await page.setViewportSize({ width: 1440, height: 1100 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://127.0.0.1:4394/', { waitUntil: 'networkidle' });
for (const t of themes) {
  await page.selectOption('#theme', t.id);
  for (const d of devices) {
    await page.selectOption('#device', d.id);
    await page.selectOption('#screen', 'archive-unavailable');
    await page.waitForTimeout(100);
    const f = page.frameLocator('#frame');
    await f.getByRole('heading', { name: '无法打开这手记录', exact: true }).waitFor();
  }
}
if (errors.length) throw Error(errors.join('\n'));
await browser.close();
await copyFile('design/pr64-art-direction/README.md', path.join(output, '方案说明与还原规范.md'));
await copyFile('design/pr64-art-direction/VALIDATION.md', path.join(output, 'VALIDATION.md'));
await writeFile(
  path.join(output, 'design-tokens.json'),
  JSON.stringify(
    {
      base,
      themes,
      devices,
      screens,
    },
    null,
    2,
  ),
);
const bundle = path.join(output, 'NOIR-Poker-Green-Art-V2');
await mkdir(bundle, { recursive: true });
for (const file of [
  'index.html',
  'screen.html',
  'screen.mjs',
  'screen.css',
  'green-art.css',
  'scene-layout.mjs',
  'fit.html',
  'fit-board.html',
  'archive.html',
  'manifest.mjs',
  'content.mjs',
  'serve.mjs',
  'board.html',
])
  await copyFile(path.join('design/pr64-art-direction', file), path.join(bundle, file));
await cp('design/pr64-art-direction/art', path.join(bundle, 'art'), { recursive: true });
await mkdir(path.join(bundle, 'runtime/ui'), { recursive: true });
await copyFile('src/ui/effect-layouts.js', path.join(bundle, 'runtime/ui/effect-layouts.js'));
await mkdir(path.join(bundle, 'assets'), { recursive: true });
for (const item of ['fonts', 'portraits', 'audio'])
  await cp(path.join('public', item), path.join(bundle, 'assets', item), { recursive: true });
await copyFile('public/launch-icon.png', path.join(bundle, 'assets/launch-icon.png'));
for (const item of ['screens', 'fit', 'videos', 'reviews', 'overviews'])
  await cp(path.join(output, item), path.join(bundle, 'output', item), {
    recursive: true,
    filter: (src) =>
      !src.endsWith('.wav') &&
      (!src.endsWith('.png') || src.includes('poster') || src.includes('overviews')),
  });
for (const item of [
  '方案说明与还原规范.md',
  'design-tokens.json',
  'render-audit.json',
  'prototype-check.json',
  'responsive-audit.json',
  'VALIDATION.md',
])
  await copyFile(path.join(output, item), path.join(bundle, 'output', item));
await writeFile(
  path.join(bundle, '打开设计目录.txt'),
  'NOIR Poker 三套绿色游戏美术 V2\n\n1. 本目录运行：node serve.mjs --port 4394\n2. 浏览器访问：http://127.0.0.1:4394/\n3. 不启动服务也可直接查看 output/screens、videos、overviews。\n\n图片是设计目标，非安装版验收。完整说明见 output/方案说明与还原规范.md。\n',
);
console.log(
  'Gallery checked on 18 theme/device combinations; portable package prepared: ' + bundle,
);
