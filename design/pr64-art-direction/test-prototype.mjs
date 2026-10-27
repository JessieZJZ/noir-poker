import assert from 'node:assert/strict';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { themes, devices, screens } from './manifest.mjs';
const root = '.artifacts/art-direction-pr64/green-v2';
const browser = await chromium.launch();
const page = await browser.newPage();
const checks = [];
const go = async (theme, device, screen) => {
  await page.setViewportSize({ width: device.width, height: device.height });
  await page.goto(
    `http://127.0.0.1:4394/screen.html?theme=${theme.id}&device=${device.id}&screen=${screen}`,
    { waitUntil: 'networkidle' },
  );
  await page.waitForFunction(() => document.body.dataset.ready === 'true');
};
for (const theme of themes) {
  for (const device of devices) {
    for (const count of [5, 6, 7, 8, 9]) {
      await go(theme, device, 'table' + count);
      const m = await page.evaluate(() => {
        const rect = (e) => {
          const r = e.getBoundingClientRect();
          return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, w: r.width, h: r.height };
        };
        return {
          width: innerWidth,
          scroll: document.documentElement.scrollWidth,
          players: [...document.querySelectorAll('.player')].map(rect),
          cards: [...document.querySelectorAll('.board .card')].map(rect),
          action: [...document.querySelectorAll('.action-buttons button')].map(rect),
          hero: document.querySelector('.hero .position').textContent,
          otherPositions: [...document.querySelectorAll('.identity strong small')].map(
            (e) => e.textContent,
          ),
          safe:
            innerHeight -
            parseInt(getComputedStyle(document.documentElement).getPropertyValue('--bottom')),
        };
      });
      assert.equal(m.width, m.scroll, 'Horizontal overflow');
      assert.equal(m.players.length, count - 1);
      assert.equal(m.hero, 'BTN');
      assert(!m.otherPositions.includes('BTN'), 'Duplicate BTN');
      assert.deepEqual(m.otherPositions.slice(0, 2), ['SB', 'BB']);
      for (const r of m.players) assert(r.x >= 0 && r.right <= m.width, 'Seat clipped');
      for (const c of m.cards)
        for (const p of m.players) {
          const overlap =
            Math.min(c.right, p.right) - Math.max(c.x, p.x) > 0 &&
            Math.min(c.bottom, p.bottom) - Math.max(c.y, p.y) > 0;
          assert(!overlap, 'Community card overlaps player');
        }
      for (const a of m.action) assert(a.h >= 48, 'Action target too small');
      if (device.width < 600)
        for (const a of m.action) assert(a.bottom <= m.safe, 'Action obscured by safe area');
      checks.push({ theme: theme.id, device: device.id, screen: 'table' + count, passed: true });
    }
    await go(theme, device, 'history');
    assert.equal(
      await page.locator('[data-go="reset"],.action-area,.settlement-actions').count(),
      0,
    );
    assert(await page.getByRole('button', { name: '查看本手复盘' }).isVisible());
    await go(theme, device, 'settings');
    assert.equal(
      await page.getByText('界面语言', { exact: true }).count(),
      device.id === 'wechat' ? 0 : 1,
    );
    assert.equal(await page.getByRole('spinbutton', { name: '小盲注' }).getAttribute('step'), '25');
    await go(theme, device, 'champion');
    assert.equal(await page.locator('.hero-label b').textContent(), '100,000');
    assert.equal(
      await page
        .locator('.identity>b')
        .allTextContents()
        .then((a) => a.every((x) => x === '0')),
      true,
    );
    assert(await page.getByRole('button', { name: '下一局 →' }).isVisible());
    await go(theme, device, 'eliminated');
    assert.equal(await page.locator('.hero-label b').textContent(), '0');
    checks.push({
      theme: theme.id,
      device: device.id,
      screen: 'history/settings/game-end',
      passed: true,
    });
  }
}
// Cross-page routes and useful prototype controls, not a parallel poker engine.
await go(themes[0], devices[2], 'entry');
await page.getByRole('button', { name: '入座开练' }).click();
await page.waitForFunction(() => document.body.dataset.ready === 'true');
assert.match(page.url(), /screen=table5/);
await page.getByRole('button', { name: '对局记录', exact: true }).click();
await page.waitForFunction(() => document.body.dataset.ready === 'true');
await page.locator('.record-row').first().click();
await page.waitForFunction(() => document.body.dataset.ready === 'true');
assert.match(page.url(), /screen=history/);
await page.getByRole('button', { name: '查看本手复盘' }).click();
await page.waitForFunction(() => document.body.dataset.ready === 'true');
assert.match(page.url(), /screen=review/);
await go(themes[0], devices[0], 'glossary');
assert.equal(await page.locator('.glossary-list details').count(), 35);
await page.getByRole('textbox', { name: '查找术语' }).fill('范围优势');
assert.equal(await page.locator('.glossary-list details:visible').count(), 1);
const audit = JSON.parse(await readFile(root + '/render-audit.json'));
assert.equal(audit.total, themes.length * devices.length * screens.length);
for (const item of audit.results) {
  assert(item.ready && item.content > 20 && item.broken === 0 && item.errors.length === 0);
  assert.equal(item.width, item.scroll);
  assert((await stat(root + '/' + item.file)).size > 1500);
  assert((await stat(root + '/' + item.file.replace('.webp', '-full.webp'))).size > 1500);
}
await browser.close();
await writeFile(
  root + '/prototype-check.json',
  JSON.stringify(
    { passed: true, checks: checks.length + 3, renderedStates: audit.total, items: checks },
    null,
    2,
  ),
);
console.log(`${checks.length + 3} prototype checks; ${audit.total} rendered states verified`);
