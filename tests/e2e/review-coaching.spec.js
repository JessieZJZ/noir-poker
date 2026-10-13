import { test, expect } from '@playwright/test';
test('draw review connects the full public line and keeps only the requested modules', async ({
  page,
}, info) => {
  await page.goto('/');
  await page.waitForFunction(() => window.qa);
  await page.evaluate(() => window.qa.reviewDrawLine());
  await page.locator('#review-hand-button').click();
  await expect(page.locator('#review-dialog')).toHaveAttribute('data-analysis-status', 'done', {
    timeout: 20000,
  });
  await expect(page.locator('#review-coach-explanation')).toContainText('支点是两头顺听牌');
  await expect(page.locator('#review-coach-explanation')).toContainText('跟注 125 的支点');
  await expect(page.locator('#review-coach-explanation')).toContainText('此前在翻牌过牌');
  await expect(page.locator('#review-coach-explanation')).toContainText('才比较转诈唬');
  await expect(page.locator('#review-evidence')).toBeVisible();
  await expect(page.locator('#review-hero-panel')).toContainText('当时的关键信息');
  await expect(
    page.locator(
      '#review-your-action, #review-suggestion, #review-advanced, #review-routes, #review-simulation',
    ),
  ).toHaveCount(0);
  await page.getByText('此前的公开行动', { exact: true }).click();
  await expect(page.locator('#review-public-actions')).toContainText('翻牌 ·');
  await expect(page.locator('#review-public-actions')).toContainText('转牌 ·');
  const kept = await page.locator('#review-selected-status').textContent();
  if (kept === '值得保留') await expect(page.locator('#review-practice-focus')).toBeHidden();
  else await expect(page.locator('#review-practice-focus')).toBeVisible();
  expect(
    await page.locator('#review-dialog').evaluate((el) => el.scrollWidth - el.clientWidth),
  ).toBeLessThanOrEqual(1);
  await info.attach('contextual-draw-review', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
});

test('opponent review puts readable motivation before at most two reference metrics', async ({
  page,
}) => {
  await page.goto('/');
  await page.waitForFunction(() => window.qa);
  await page.evaluate(() => window.qa.reviewLine());
  await page.locator('#review-hand-button').click();
  await page.locator('#review-opponents-tab').click();
  await expect(page.locator('#review-opponent-detail .review-explanation')).not.toBeEmpty();
  expect(await page.locator('.opponent-metrics li').count()).toBeLessThanOrEqual(2);
  await expect(
    page.locator(
      '#review-opponent-detail .review-choice, #review-opponent-detail .review-status, #review-opponent-detail details, .opponent-warning',
    ),
  ).toHaveCount(0);
  await expect(page.locator('.review-scope')).toContainText('未完整建模对手继续范围');
});

test('all review locales switch immediately and preserve the recorded hand', async ({ page }) => {
  test.setTimeout(60000);
  await page.goto('/');
  await page.waitForFunction(() => window.qa);
  await page.evaluate(() => window.qa.reviewDrawLine());
  const before = await page.evaluate(() => window.qa.snapshot());
  for (const locale of ['zh-CN', 'en', 'zh-TW', 'ja', 'ko', 'es', 'it', 'pt', 'de', 'fr', 'ru']) {
    await page.locator('#opponents-button').click();
    await page.locator('#language-select').selectOption(locale);
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await page.locator('#opponents-dialog .close-dialog').click();
    await page.locator('#review-hand-button').click();
    await expect(page.locator('#review-dialog')).toHaveAttribute('data-analysis-status', 'done', {
      timeout: 20000,
    });
    const texts = await page
      .locator('#review-coach-explanation, #review-evidence')
      .allTextContents();
    expect(texts.join('')).toContain('8');
    if (!['zh-CN', 'zh-TW', 'ja'].includes(locale))
      expect(texts.join('')).not.toMatch(/\p{Script=Han}/u);
    await page.locator('#review-opponents-tab').click();
    const bot = await page
      .locator('#review-opponent-detail .review-explanation, .opponent-metrics')
      .allTextContents();
    if (!['zh-CN', 'zh-TW', 'ja'].includes(locale))
      expect(bot.join('')).not.toMatch(/\p{Script=Han}/u);
    await page.locator('#review-dialog .close-dialog').first().click();
  }
  expect(await page.evaluate(() => window.qa.snapshot())).toEqual(before);
});
