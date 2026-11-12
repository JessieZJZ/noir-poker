import { test, expect } from '@playwright/test';

const state = (page) => page.evaluate(() => window.noir.getState());

test('the ready table and settings describe this game’s rising blinds and final table', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-app-ready', 'true');
  await expect(page.locator('#entry-structure')).toBeVisible();
  const count = (await state(page)).playerCount;
  const cap = { 5: '1.2K / 2.4K', 6: '1.5K / 3K', 7: '1K / 2K', 8: '1.2K / 2.4K', 9: '1.5K / 3K' };
  await expect(page.locator('#entry-structure-levels')).toHaveText(
    `每 10 手涨盲，最高 ${cap[count]}`,
  );
  await expect(page.locator('#entry-structure-final')).toHaveText(
    `剩 ${count <= 6 ? 2 : 3} 人进入决赛圈`,
  );
  // The welcome keeps one column inside the table at phone width.
  const box = await page.locator('#entry-welcome').boundingBox();
  const table = await page.locator('.table-viewport').boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(table.x - 1);
  expect(box.x + box.width).toBeLessThanOrEqual(table.x + table.width + 1);
  await page.locator('#language-select').evaluate((el) => {
    el.value = 'en';
    el.dispatchEvent(new Event('change'));
  });
  await expect(page.locator('#entry-structure-final')).toHaveText(
    `Final table: ${count <= 6 ? 2 : 3} left`,
  );
  await expect(page.locator('#stakes-structure')).toContainText('Blinds rise every 10 hands');
});

test('a new level and the final table are announced at the centre before the cards are dealt', async ({
  page,
}, info) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.qa);
  await page.evaluate(() => window.qa.noticeHand({ count: 7, final: true }));
  const notices = page.locator('.table-notice-stage');
  const finalNotice = notices.filter({ hasText: '进入决赛圈' });
  const blindNotice = notices.filter({ hasText: '盲注升至 200 / 400' });
  await expect(notices).toHaveCount(1);
  await expect(finalNotice).toContainText('进入决赛圈');
  await expect(finalNotice).toContainText('剩余 3 人争夺冠军 · 不能再补码');
  await expect(blindNotice).toHaveCount(0);
  // The cards wait under the notice; the blinds already show the new level.
  await expect(page.locator('.game-surface')).toHaveClass(/notice-hold/);
  await expect(page.locator('.hero-cards-wrap')).toHaveCSS('visibility', 'hidden');
  await expect(page.locator('#blind-values')).toHaveText('200 / 400');
  expect(await state(page)).toMatchObject({ blindLevel: 1, finalTable: true, rebuysLeft: 0 });
  await info.attach('final-table-notice', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
  // Both stages can briefly coexist while one fades out and the next fades in.
  await expect(blindNotice).toContainText('盲注升至 200 / 400', { timeout: 3000 });
  await expect(blindNotice).toContainText('每 10 手升一级');
  // Nobody acts while the notices play.
  await expect(page.locator('.game-surface')).toHaveAttribute('data-entry-state', 'dealing');
  await expect(notices).toHaveCount(0, { timeout: 4000 });
  await expect(page.locator('.game-surface')).not.toHaveClass(/notice-hold/);
  await expect(page.locator('.hero-cards-wrap')).toHaveCSS('visibility', 'visible');
  await expect(page.locator('.hero-cards-wrap .playing-card.card-deal')).toHaveCount(2);
});

test('retry replays the hand’s notice and the records show each hand’s blinds', async ({
  page,
}) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.qa);
  await page.evaluate(() => window.qa.noticeHand({ count: 5 }));
  await expect(page.locator('.table-notice-stage')).toContainText('盲注升至 200 / 400');
  await expect(page.locator('.table-notice-stage')).toHaveCount(0, { timeout: 4000 });
  await page.evaluate(() => {
    window.qa.stop();
    window.qa.recordsFinish();
  });
  await page.locator('#restart-hand-button').click();
  await expect(page.locator('.table-notice-stage')).toContainText('盲注升至 200 / 400');
  expect((await state(page)).replayAttempt).toBe(1);
  await expect(page.locator('.table-notice-stage')).toHaveCount(0, { timeout: 4000 });
  await page.evaluate(() => {
    window.qa.stop();
    window.qa.recordsFinish();
  });
  await page.locator('#rules-button').click();
  await page.locator('#records-menu-item').click();
  await expect(page).toHaveURL(/#records$/);
  const rows = page.locator('.record-session').first().locator('.record-hand-blinds');
  await expect(rows.first()).toHaveText('盲注 200 / 400');
});
