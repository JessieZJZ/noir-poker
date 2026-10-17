// Exercises the built production entry, without Vite fixtures or test transforms.
import { chromium } from '@playwright/test';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import path from 'node:path';

const output = path.resolve(process.argv[2] || '.artifacts/startup-polish/production');
await mkdir(output, { recursive: true });
const html = await readFile('dist/index.html', 'utf8');
const entrySource = html.match(/<script[^>]+src="([^"]+)"/)[1];
const port = 4193;
const origin = `http://127.0.0.1:${port}`;
const entry = new URL(entrySource, origin).pathname;
const server = spawn(
  process.execPath,
  [
    'node_modules/vite/bin/vite.js',
    'preview',
    '--host',
    '127.0.0.1',
    '--port',
    String(port),
    '--strictPort',
  ],
  { stdio: ['ignore', 'pipe', 'pipe'] },
);
let serverLog = '';
server.stdout.on('data', (bytes) => (serverLog += bytes));
server.stderr.on('data', (bytes) => (serverLog += bytes));
const gate = () => {
  let release;
  const promise = new Promise((resolve) => (release = resolve));
  return { promise, release };
};
const report = { status: 'running', checks: [] };
let browser;
try {
  const deadline = Date.now() + 15000;
  while (!serverLog.includes(origin)) {
    assert.equal(server.exitCode, null, serverLog);
    assert.ok(Date.now() < deadline, serverLog);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  browser = await chromium.launch();
  for (const width of [390, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, locale: 'zh-CN' });
    const errors = [];
    page.on('pageerror', (error) => errors.push(String(error)));
    for (const navigation of ['cold', 'reload']) {
      const main = gate(),
        styles = gate();
      let mainHeld = false,
        stylesHeld = false;
      await page.route('**/*', async (route) => {
        const url = new URL(route.request().url());
        if (url.origin !== origin) return route.abort();
        if (url.pathname === entry) {
          mainHeld = true;
          await main.promise;
        }
        if (url.pathname.endsWith('.css')) {
          stylesHeld = true;
          await styles.promise;
        }
        return route.continue();
      });
      try {
        if (navigation === 'cold') await page.goto(origin, { waitUntil: 'commit' });
        else await page.reload({ waitUntil: 'commit' });
        await page.waitForFunction(() => document.body);
        const entryLimit = Date.now() + 10000;
        while (!mainHeld) {
          assert.ok(Date.now() < entryLimit, 'Production entry request must be held');
          await page.waitForTimeout(25);
        }
        await page.waitForFunction(() =>
          performance
            .getEntriesByType('resource')
            .some((entry) => entry.name.endsWith('/launch-icon.png')),
        );
        const sample = async () =>
          page.evaluate(() => ({
            ready: document.documentElement.dataset.appReady === 'true',
            guide: getComputedStyle(document.querySelector('[data-guide-label="guide"]'))
              .visibility,
            artwork: getComputedStyle(document.documentElement, '::before').backgroundImage,
          }));
        const beforeEntry = await sample();
        assert.equal(beforeEntry.ready, false);
        assert.equal(beforeEntry.guide, 'hidden');
        assert.ok(beforeEntry.artwork.includes('launch-icon.png'));
        await page.screenshot({ path: path.join(output, `${width}-${navigation}-launch.png`) });
        main.release();
        const limit = Date.now() + 10000;
        while (!stylesHeld) {
          assert.ok(Date.now() < limit, 'Production CSS request must be held');
          await page.waitForTimeout(25);
        }
        const beforeStyles = await sample();
        assert.equal(beforeStyles.ready, false);
        assert.equal(beforeStyles.guide, 'hidden');
        await page.screenshot({
          path: path.join(output, `${width}-${navigation}-styles-pending.png`),
        });
        styles.release();
        await page.locator('html[data-app-ready="true"]').waitFor();
        assert.equal(await page.locator('#hero-cards .playing-card').count(), 2);
        assert.equal(await page.evaluate(() => typeof window.qa), 'undefined');
        assert.equal(
          await page.evaluate(() => getComputedStyle(document.documentElement, '::before').content),
          'none',
        );
        await page.screenshot({ path: path.join(output, `${width}-${navigation}-ready.png`) });
        report.checks.push({
          width,
          navigation,
          beforeEntry,
          beforeStyles,
          productionFixtures: false,
        });
      } finally {
        main.release();
        styles.release();
        await page.unroute('**/*');
      }
    }
    assert.deepEqual(errors, []);
    await page.close();
  }
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.error = String(error.stack || error);
  throw error;
} finally {
  await browser?.close();
  server.kill('SIGTERM');
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  await writeFile(path.join(output, 'preview.log'), serverLog);
  console.log(JSON.stringify({ status: report.status, checks: report.checks.length, output }));
}
