import { test, expect } from '@playwright/test';

// The device language decides first; an unsupported one (Arabic) falls back
// to the time zone's regional default, then English.
for (const [locale, timezoneId, expected] of [
  ['de-DE', 'Asia/Shanghai', 'de'],
  ['zh-CN', 'America/New_York', 'zh-CN'],
  ['zh-TW', 'Europe/Paris', 'zh-TW'],
  ['ja-JP', 'UTC', 'ja'],
  ['ar-SA', 'Asia/Shanghai', 'zh-CN'],
  ['ar-SA', 'Asia/Taipei', 'zh-TW'],
  ['ar-SA', 'Asia/Tokyo', 'ja'],
  ['ar-SA', 'Asia/Seoul', 'ko'],
  ['ar-SA', 'Europe/Paris', 'fr'],
  ['ar-SA', 'UTC', 'en'],
]) {
  test(`fresh ${locale} visit in ${timezoneId} selects ${expected} and five seats; explicit preferences survive reload`, async ({
    browser,
    baseURL,
  }) => {
    const context = await browser.newContext({ locale, timezoneId });
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
