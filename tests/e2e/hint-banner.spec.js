import { test, expect } from '@playwright/test';
import { openSettings, closeSettings } from './settings-helpers.js';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.qa);
  await page.evaluate(() => {
    window.qa.stop();
    return document.fonts.ready;
  });
});

test('necessary hints appear below blinds, expire without reappearing on ordinary renders and renew on a new street', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-01-01T00:00:01Z'));
  const banner = page.locator('#coach-content');
  await page.evaluate(() => window.qa.heroTurn(9));
  await expect(banner).toBeVisible();
  await expect(page.locator('#coach-stage')).toHaveText('翻牌前策略');
  await expect(page.locator('#coach-tip')).toContainText('跟注占可争夺底池约');
  await expect(page.locator('.sidebar #coach-content')).toHaveCount(0);
  await page.clock.runFor(32);
  const before = await page.locator('.table-viewport').boundingBox();
  await page.clock.runFor(6967);
  await expect(banner).toBeVisible();
  await page.clock.runFor(2);
  await expect(banner).toBeHidden();
  const after = await page.locator('.table-viewport').boundingBox();
  expect(after).toEqual(before);
  // Slider changes are ordinary renders within the same decision. They must
  // not turn the notification into a persistent repeated announcement.
  await page.locator('[data-preset="half"]').click();
  await expect(banner).toBeHidden();
  await page.evaluate(() => {
    window.qa.publicBoard(9);
    window.qa.stop();
  });
  await expect(banner).toBeVisible();
  await expect(page.locator('#coach-stage')).toHaveText('翻牌策略');
  await page.clock.runFor(7001);
  await expect(banner).toBeHidden();
  await page.evaluate(() => window.qa.foldWin(9));
  await expect(banner).toBeVisible();
  await expect(page.locator('#coach-stage')).toHaveText('本手复盘');
});

test('the settings switch controls hints immediately and restores its choice on a fresh visit', async ({
  page,
}) => {
  const banner = page.locator('#coach-content'),
    toggle = page.locator('#hint-toggle');
  await openSettings(page);
  await expect(toggle).toHaveAccessibleName('牌桌提示');
  await expect(toggle).toHaveAttribute('role', 'switch');
  await expect(toggle).toHaveAttribute('aria-controls', 'coach-content');
  await expect(toggle).toBeChecked();
  await toggle.click();
  await expect(toggle).not.toBeChecked();
  await expect(banner).toBeHidden();
  await closeSettings(page);
  await page.reload();
  await page.waitForFunction(() => !!window.qa);
  await page.evaluate(() => window.qa.heroTurn(9));
  await expect(banner).toBeHidden();
  await openSettings(page);
  await expect(toggle).not.toBeChecked();
  await toggle.click();
  await expect(toggle).toBeChecked();
  await closeSettings(page);
  await expect(banner).toBeVisible();
  await page.reload();
  await page.waitForFunction(() => !!window.qa);
  await page.evaluate(() => window.qa.heroTurn(9));
  await expect(banner).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
});

test('single-line hints scroll horizontally below blinds without moving the table or the action dock', async ({
  page,
}) => {
  for (const size of [
    { width: 320, height: 667 },
    { width: 390, height: 844 },
    { width: 844, height: 390 },
    { width: 1280, height: 900 },
  ]) {
    await page.setViewportSize(size);
    await page.evaluate(() => window.qa.heroTurn(9));
    await expect(page.locator('#coach-content')).toBeVisible();
    const layout = await page.evaluate(() => {
      const banner = document.querySelector('#coach-content'),
        text = document.querySelector('#coach-tip');
      const r = banner.getBoundingClientRect(),
        blinds = document.querySelector('.blind-info').getBoundingClientRect();
      const table = document.querySelector('.table-viewport').getBoundingClientRect(),
        dock = document.querySelector('.action-dock').getBoundingClientRect();
      return {
        belowBlinds: r.top >= blinds.bottom && r.top - blinds.bottom <= 8,
        aboveTable: r.bottom <= table.top,
        insideWidth: r.left >= 0 && r.right <= innerWidth,
        nowrap: getComputedStyle(text).whiteSpace,
        overflowX: getComputedStyle(banner).overflowX,
        singleLine: text.clientHeight <= parseFloat(getComputedStyle(text).lineHeight) + 1,
        canScroll: banner.scrollWidth > banner.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        width: innerWidth,
        tableTop: table.top,
        tableBottom: table.bottom,
        dockTop: dock.top,
      };
    });
    expect(layout.belowBlinds).toBe(true);
    expect(layout.aboveTable).toBe(true);
    expect(layout.insideWidth).toBe(true);
    expect(layout.nowrap).toBe('nowrap');
    expect(layout.overflowX).toBe('auto');
    expect(layout.singleLine).toBe(true);
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.width);
    if (size.width <= 390) {
      expect(layout.canScroll).toBe(true);
      await page.locator('#coach-content').evaluate((el) => el.scrollTo(el.scrollWidth, 0));
      await expect
        .poll(() => page.locator('#coach-content').evaluate((el) => el.scrollLeft))
        .toBeGreaterThan(0);
      const after = await page.evaluate(() => ({
        tableTop: document.querySelector('.table-viewport').getBoundingClientRect().top,
        tableBottom: document.querySelector('.table-viewport').getBoundingClientRect().bottom,
        dockTop: document.querySelector('.action-dock').getBoundingClientRect().top,
        tableScroll: document.querySelector('.table-viewport').scrollTop,
      }));
      expect(after).toEqual({
        tableTop: layout.tableTop,
        tableBottom: layout.tableBottom,
        dockTop: layout.dockTop,
        tableScroll: 0,
      });
    }
  }
});
