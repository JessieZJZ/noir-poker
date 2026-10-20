import { test, expect } from '@playwright/test';

test('practice heading reset retains cancellation and confirmation behavior without a footer strip', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.qa));
  await expect(page.locator('.practice-info')).toHaveCount(0);
  await expect(page.locator('.site-footer')).toBeHidden();
  await expect(page.locator('.session-card .section-title #reset-button')).toHaveText('重新练习');
  await page.evaluate(() => window.qa.foldWin(7, 2));
  const before = await page.evaluate(() => window.noir.getState());
  const completed = await page.locator('#stat-hands').textContent();
  await page.locator('#reset-button').scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('practice-heading.png') });
  await page.locator('#reset-button').click();
  await expect(page.locator('#reset-dialog')).toBeVisible();
  await page.locator('#reset-dialog .dialog-actions .close-dialog').click();
  expect((await page.evaluate(() => window.noir.getState())).hand).toBe(before.hand);
  await expect(page.locator('#stat-hands')).toHaveText(completed);
  await page.locator('#reset-button').click();
  await page.locator('#confirm-reset').click();
  await expect(page.locator('#reset-dialog')).toBeHidden();
  await expect(page.locator('#stat-hands')).toHaveText('0');
  const reset = await page.evaluate(() => {
    window.qa.stop();
    return window.noir.getState();
  });
  expect(reset.hand).toBe(1);
  expect(reset.playerCount).toBe(7);
  expect(reset.players.reduce((sum, player) => sum + player.stack, 0) + reset.pot).toBe(140000);
});
