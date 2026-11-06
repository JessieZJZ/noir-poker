import { test, expect } from '@playwright/test';

test('translated desktop wager shortcuts stay aligned with the fixed-height action buttons', async ({
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
  for (const width of [1024, 1280, 1700]) {
    await page.setViewportSize({ width, height: 900 });
    for (const locale of ['zh-CN', 'en', 'es', 'it', 'pt', 'de', 'fr', 'ru']) {
      await page.locator('#language-select').evaluate((select, value) => {
        select.value = value;
        select.dispatchEvent(new Event('change'));
      }, locale);
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
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
