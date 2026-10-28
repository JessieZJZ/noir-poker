import { test, expect } from '@playwright/test';
import { readTableLayout, assertTableLayout } from '../native/layout.mjs';
import { openSettings, closeSettings } from './settings-helpers.js';

test.use({ hasTouch: true });

const sizes = [
  [744, 1133],
  [768, 1024],
  [800, 1280],
  [820, 1180],
  [834, 1194],
  [1024, 1366],
  [1032, 1376],
];
for (const size of sizes) {
  for (const [width, height] of [size, [...size].reverse()]) {
    test(`tablet chrome, panels and controls fill ${width}x${height} without tiny type`, async ({
      page,
    }, info) => {
      test.skip(info.project.name === 'mobile', 'Explicit tablet matrix runs once');
      const portrait = width < height;
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto('/');
      await page.waitForFunction(() => !!window.qa);
      await page.evaluate(() => document.fonts.ready);
      const font = (selector) =>
        page
          .locator(selector)
          .first()
          .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
      expect(await font('#rules-button')).toBeGreaterThanOrEqual(16);
      expect(await font('#opponents-button')).toBeGreaterThanOrEqual(16);
      expect(await font('.entry-welcome h1')).toBeGreaterThanOrEqual(26);
      expect(await font('#join-table-button')).toBeGreaterThanOrEqual(18);
      await expect
        .poll(() =>
          page
            .locator('.game-info')
            .evaluate((el) => el.getBoundingClientRect().bottom <= innerHeight + 1),
        )
        .toBe(true);
      await page.locator('#rules-button').click();
      expect(await font('#guide-menu-item')).toBeGreaterThanOrEqual(16);
      await page.locator('#rules-button').click();
      await openSettings(page);
      const settings = await page.locator('#opponents-dialog').boundingBox();
      expect(settings.width).toBeGreaterThan(width * (portrait ? 0.94 : 0.78));
      expect(await font('.settings-dialog .setting-description')).toBeGreaterThanOrEqual(15);
      expect(await font('.settings-dialog .settings-row > label')).toBeGreaterThanOrEqual(17);
      expect(
        await page
          .locator('#player-count-trigger')
          .evaluate((el) => el.getBoundingClientRect().height),
      ).toBeGreaterThanOrEqual(44);
      const settingsOverflow = await page
        .locator('.opponents-body')
        .evaluate((el) => el.scrollWidth > el.clientWidth + 1);
      expect(settingsOverflow).toBe(false);
      await page.screenshot({ path: info.outputPath('settings.png') });
      await closeSettings(page);
      await page.locator('#rules-button').click();
      await page.locator('#guide-menu-item').click();
      const guide = await page.locator('#rules-dialog').boundingBox();
      expect(guide.width).toBeGreaterThan(width * (portrait ? 0.94 : 0.78));
      expect(await font('#rules-dialog p')).toBeGreaterThanOrEqual(16);
      const cards = await page.locator('#rules-dialog .guide-card').first().boundingBox();
      expect(cards.width).toBeGreaterThanOrEqual(44);
      expect(cards.height).toBeGreaterThanOrEqual(60);
      expect(
        await page.locator('.guide-body').evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
      ).toBe(true);
      const titleTop = await page
        .locator('#rules-dialog .dialog-header')
        .evaluate((el) => el.getBoundingClientRect().top);
      await page.locator('.guide-body').evaluate((el) => (el.scrollTop = 500));
      expect(
        await page
          .locator('#rules-dialog .dialog-header')
          .evaluate((el) => el.getBoundingClientRect().top),
      ).toBe(titleTop);
      await page.locator('.guide-body').evaluate((el) => (el.scrollTop = 0));
      await page.screenshot({ path: info.outputPath('guide.png') });
      await page.locator('#rules-dialog .dialog-header .close-dialog').click();
      for (const count of [5, 6, 7, 8, 9]) {
        await page.evaluate((count) => {
          window.qa.heroTurn(count);
          window.qa.stop();
        }, count);
        await expect.poll(() => font('.action-buttons .action span')).toBeGreaterThanOrEqual(18);
        expect(await font('.bet-presets button')).toBeGreaterThanOrEqual(15);
        await expect
          .poll(() =>
            page.evaluate((portrait) => {
              const box = (s) => document.querySelector(s).getBoundingClientRect();
              const bet = box('.bet-controls'),
                actions = box('.action-buttons');
              return {
                arranged: portrait ? bet.bottom <= actions.top + 1 : bet.right <= actions.left + 1,
                touchHeight: [...document.querySelectorAll('.action-buttons button')].every(
                  (el) => el.getBoundingClientRect().height >= 48,
                ),
                firstScreen: box('.action-dock-slot').bottom <= innerHeight + 1,
                noOverflow: document.documentElement.scrollWidth <= innerWidth,
              };
            }, portrait),
          )
          .toEqual({ arranged: true, touchHeight: true, firstScreen: true, noOverflow: true });
        assertTableLayout(await page.evaluate(readTableLayout));
      }
      expect(await font('.session-stats span')).toBeGreaterThanOrEqual(15);
      expect(await font('.activity-list')).toBeGreaterThanOrEqual(15);
      if (!portrait) {
        const practice = await page.locator('.session-card').boundingBox();
        const activity = await page.locator('.activity-card').boundingBox();
        expect(practice.x + practice.width).toBeLessThanOrEqual(activity.x);
        expect(Math.abs(practice.y - activity.y)).toBeLessThanOrEqual(1);
      }
      // Chromium's full-page capture can clear touch emulation while resizing
      // the viewport. Capture the real tablet viewport without changing it.
      await page.screenshot({ path: info.outputPath('live-9.png') });
    });
  }
}
