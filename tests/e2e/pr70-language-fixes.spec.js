import { test, expect } from '@playwright/test';

async function switchLocale(page, locale) {
  await page.locator('#language-select').evaluate((select, value) => {
    select.value = value;
    select.dispatchEvent(new Event('change'));
  }, locale);
  await expect(page.locator('html')).toHaveAttribute('lang', locale);
}

test('switching Russian to Chinese redraws current amounts without changing the hand', async ({
  page,
}) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.qa);
  await page.evaluate(() => {
    window.qa.heroTurn(9);
    window.qa.stop();
  });
  const before = await page.evaluate(() => window.noir.getState());
  await switchLocale(page, 'ru');
  await expect(page.locator('#stakes-structure')).toContainText('1,5K');
  await switchLocale(page, 'zh-CN');
  await expect(page.locator('#stakes-structure')).toContainText('1.5K');
  await expect(page.locator('#hero-stack')).not.toContainText(',');
  await expect(page.locator('#pot-value')).not.toContainText(',');
  const after = await page.evaluate(() => window.noir.getState());
  for (const key of [
    'hand',
    'replayAttempt',
    'wealth',
    'actor',
    'phase',
    'stats',
    'players',
    'legal',
  ])
    expect(after[key], key).toEqual(before[key]);
});

test('blind progress sits below blinds, retry can be dismissed without changing the hand', async ({
  page,
}) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.qa);
  await page.evaluate(() => {
    window.qa.foldWin(9);
    window.qa.stop();
  });
  await page.locator('#restart-hand-button').click();
  await page.evaluate(() => window.qa.stop());
  await expect(page.locator('#blind-progress')).toBeVisible();
  await expect(page.locator('#replay-label')).toBeVisible();
  const geometry = await page.evaluate(() => {
    const rect = (s) => document.querySelector(s).getBoundingClientRect();
    const blinds = rect('.blind-info'),
      progress = rect('#blind-progress'),
      retry = rect('#replay-label');
    return { under: progress.top >= blinds.bottom - 1, left: retry.right <= progress.left };
  });
  expect(geometry).toEqual({ under: true, left: true });
  const before = await page.evaluate(() => window.noir.getState());
  await page.locator('#dismiss-replay').click();
  await expect(page.locator('#replay-label')).toBeHidden();
  await switchLocale(page, 'en');
  await expect(page.locator('#replay-label')).toBeHidden();
  const after = await page.evaluate(() => window.noir.getState());
  expect(after.hand).toBe(before.hand);
  expect(after.replayAttempt).toBe(before.replayAttempt);
  expect(after.wealth).toBe(before.wealth);
});

test('positive review chips use the same green meaning as records', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.qa);
  await page.evaluate(() => {
    window.qa.foldWin(5, 0);
    window.qa.stop();
  });
  await page.locator('#review-hand-button').click();
  await expect(page.locator('#review-result-change')).toHaveClass('positive');
  await expect(page.locator('#review-result-change')).toHaveCSS('color', 'rgb(110, 231, 197)');
});

test('showdown amounts refresh with the locale while winning-card nodes stay alive', async ({
  page,
}) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.qa);
  await page.evaluate(() => {
    window.qa.finale({ heroWins: true });
    window.qa.finaleShowdown();
    window.qa.stop();
    window.savedWinningCard = document.querySelector('.winning-card');
  });
  await expect(page.locator('#showdown-stage')).toBeVisible();
  await switchLocale(page, 'ru');
  const russian = await page.locator('.showdown-awards').allTextContents();
  await switchLocale(page, 'zh-CN');
  const chinese = await page.locator('.showdown-awards').allTextContents();
  expect(chinese.join(' ')).not.toMatch(/\d,\d/);
  expect(russian.join(' ')).not.toBe(chinese.join(' '));
  expect(
    await page.evaluate(() => window.savedWinningCard === document.querySelector('.winning-card')),
  ).toBe(true);
});

test('settings sentences remain separated across the blind-summary span', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.qa);
  await switchLocale(page, 'en');
  await page.locator('#opponents-button').click();
  await expect(page.locator('#stakes-description')).toContainText('small blind. Blinds');
});

for (const locale of ['es', 'it', 'pt', 'ru', 'ja'])
  test(`${locale} settled labels fit their buttons at 320px`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 844 });
    await page.goto('/');
    await page.waitForFunction(() => !!window.qa);
    await switchLocale(page, locale);
    await page.evaluate(() => {
      window.qa.foldWin(5, 0);
      window.qa.stop();
    });
    const overflow = await page
      .locator('#action-panel > button:not([hidden])')
      .evaluateAll((buttons) =>
        buttons.filter((b) => b.scrollWidth > b.clientWidth + 1).map((b) => b.textContent),
      );
    expect(overflow).toEqual([]);
  });
