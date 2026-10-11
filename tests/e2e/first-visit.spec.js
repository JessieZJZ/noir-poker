import { test, expect } from '@playwright/test';

for (const [timezoneId, expected] of [
  ['Asia/Shanghai', 'zh-CN'],
  ['Asia/Taipei', 'zh-TW'],
  ['Asia/Tokyo', 'ja'],
  ['Asia/Seoul', 'ko'],
  ['Europe/Paris', 'fr'],
  ['America/New_York', 'en'],
  ['UTC', 'de'],
]) {
  test(`fresh ${timezoneId} visit selects ${expected} and five seats; explicit preferences survive reload`, async ({
    browser,
    baseURL,
  }) => {
    const context = await browser.newContext({ locale: 'de-DE', timezoneId });
    try {
      const page = await context.newPage();
      await page.goto(baseURL);
      await expect(page.locator('html')).toHaveAttribute('data-app-ready', 'true');
      await expect(page.locator('html')).toHaveAttribute('lang', expected);
      await expect(page.locator('#player-count')).toHaveValue('5');
      await expect(page.locator('#seats .seat')).toHaveCount(4);
      await page.evaluate(() => window.qa.stop());
      await page.locator('#opponents-button').click();
      await page.locator('#language-select').selectOption('ko');
      await expect(page.locator('html')).toHaveAttribute('lang', 'ko');
      await page.locator('#player-count').selectOption('8');
      await page.reload();
      await expect(page.locator('html')).toHaveAttribute('data-app-ready', 'true');
      await expect(page.locator('html')).toHaveAttribute('lang', 'ko');
      await expect(page.locator('#player-count')).toHaveValue('8');
      await expect(page.locator('#seats .seat')).toHaveCount(7);
    } finally {
      await context.close();
    }
  });
}
