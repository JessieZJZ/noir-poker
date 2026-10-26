import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { themes, devices, screens, base } from './manifest.mjs';
const root = path.resolve('.artifacts/art-direction-pr64');
const initial = process.argv.includes('--initial');
const round2 = process.argv.includes('--round2');
const preview = initial || round2;
const review = process.argv.includes('--review');
const reviewScreens = [
  'table5',
  'table9',
  'review',
  'settings',
  'opponents',
  'strong-hand',
  'emotion',
  'champion',
  'rebuy',
  'eliminated',
  'pot',
  'opponent-review',
  'history',
];
const browser = await chromium.launch({ headless: true });
const jobs = themes.flatMap((t) =>
  (preview || review ? devices.filter((d) => ['desktop', 'ios'].includes(d.id)) : devices).flatMap(
    (d) =>
      (preview
        ? screens.filter((s) => ['table9', 'review', 'settings', 'opponents'].includes(s.id))
        : review
          ? screens.filter((s) => reviewScreens.includes(s.id))
          : screens
      ).map((s) => ({ t, d, s })),
  ),
);
let next = 0;
const results = [];
async function worker() {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  while (next < jobs.length) {
    const { t, d, s } = jobs[next++];
    await page.setViewportSize({ width: d.width, height: d.height });
    const folder = path.join(root, preview ? 'round2' : 'screens', t.id, d.id);
    await mkdir(folder, { recursive: true });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(
      `http://127.0.0.1:4394/${s.id === 'archive-unavailable' ? 'archive' : 'screen'}.html?theme=${t.id}&device=${d.id}&screen=${s.id}`,
      { waitUntil: 'networkidle' },
    );
    await page.waitForFunction(() => document.body.dataset.ready === 'true', null, {
      timeout: 15000,
    });
    await page.evaluate(() => window.designReady);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const metrics = await page.evaluate(() => ({
      ready: document.body.dataset.ready === 'true',
      content: document.querySelector('#app').textContent.length,
      width: innerWidth,
      scroll: document.documentElement.scrollWidth,
      broken: [...document.images].filter((i) => !i.complete || i.naturalWidth === 0).length,
      buttons: [...document.querySelectorAll('button')].filter(
        (e) => e.getBoundingClientRect().height > 0,
      ).length,
    }));
    if (!metrics.ready || metrics.content < 20 || metrics.broken)
      throw Error('Unready render ' + JSON.stringify({ t: t.id, d: d.id, s: s.id, metrics }));
    const file = path.join(folder, s.id + '.webp');
    await sharp(await page.screenshot({ fullPage: false, animations: 'disabled' }))
      .webp({ quality: 90 })
      .toFile(file);
    await sharp(
      await page.screenshot({
        fullPage: true,
        animations: 'disabled',
        style: '.home-indicator{display:none!important}',
      }),
    )
      .webp({ quality: 88 })
      .toFile(path.join(folder, s.id + '-full.webp'));
    results.push({
      theme: t.id,
      device: d.id,
      screen: s.id,
      file: path.relative(root, file),
      ...metrics,
      errors,
    });
    if (next % 30 === 0) console.log(next + '/' + jobs.length);
    page.removeAllListeners('pageerror');
  }
  await page.close();
}
await Promise.all(Array.from({ length: 4 }, worker));
await browser.close();
await writeFile(
  path.join(
    root,
    preview ? 'round2-audit.json' : review ? 'review-audit.json' : 'render-audit.json',
  ),
  JSON.stringify({ base, total: results.length, results }, null, 2),
);
console.log(
  'Rendered ' +
    results.length +
    '; horizontal overflow ' +
    results.filter((r) => r.scroll > r.width).length +
    '; errors ' +
    results.filter((r) => r.errors.length || r.broken).length,
);
