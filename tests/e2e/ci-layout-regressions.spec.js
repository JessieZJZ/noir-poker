import { test, expect } from '@playwright/test';
import { readActionNoticeSpacing } from '../fixtures/action-notice-spacing.js';

test('translated desktop notices stay centered and wager shortcuts align with fixed-height actions', async ({
  page,
}) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.qa);
  await page.evaluate(() => {
    window.qa.configuredTurn({
      smallBlind: 100,
      bigBlind: 200,
      startingStack: 20000,
      chipUnit: 100,
    });
    window.qa.stop();
    return document.fonts.ready;
  });
  for (const width of [1024, 1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    for (const locale of ['zh-CN', 'en', 'zh-TW', 'ja', 'ko', 'es', 'it', 'pt', 'de', 'fr', 'ru']) {
      await page.locator('#language-select').evaluate((select, value) => {
        select.value = value;
        select.dispatchEvent(new Event('change'));
      }, locale);
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      await page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      );
      // At 1024px the legacy amount label is visually clipped; its nonzero
      // layout height is not a painted anchor for this desktop spacing helper.
      if (width >= 1280) {
        const spacing = await page.evaluate(readActionNoticeSpacing);
        expect(spacing.topGap, `${locale} ${width} top gap`).toBeGreaterThanOrEqual(4);
        expect(spacing.controlGap, `${locale} ${width} control gap`).toBeGreaterThanOrEqual(4);
        expect(
          Math.abs(spacing.topGap - spacing.controlGap),
          `${locale} ${width} notice symmetry: ${JSON.stringify(spacing)}`,
        ).toBeLessThanOrEqual(1);
      }
      const boxes = await page.evaluate(() =>
        ['.bet-presets', '#raise-button', '#fold-button', '#call-button'].map((selector) => {
          const { bottom, height } = document.querySelector(selector).getBoundingClientRect();
          return { bottom, height };
        }),
      );
      for (const action of boxes.slice(1)) {
        expect(action.height, `${locale} ${width} action height`).toBe(52);
        expect(
          Math.abs(action.bottom - boxes[0].bottom),
          `${locale} ${width} shortcut/action bottom alignment`,
        ).toBeLessThan(1);
      }
    }
  }
});
