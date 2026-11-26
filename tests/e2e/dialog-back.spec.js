import { expect, test } from '@playwright/test';

// The browser's Back (and a phone's Back gesture in a mobile browser) closes
// the open full-screen layer instead of leaving the page, like Android Back in
// the app and Back in the WeChat mini program.

async function ready(page) {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-app-ready', 'true');
  return page.url();
}

test('Back closes settings and the quick guide, staying on the table', async ({ page }) => {
  const url = await ready(page);
  const cases = [
    ['#opponents-dialog', async () => page.locator('#opponents-button').click()],
    [
      '#rules-dialog',
      async () => {
        await page.locator('#rules-button').click();
        await page.locator('#guide-menu-item').click();
      },
    ],
  ];
  for (const [dialog, open] of cases) {
    await open();
    await expect(page.locator(dialog)).toBeVisible();
    await page.goBack();
    await expect(page.locator(dialog), dialog).toBeHidden();
    expect(page.url()).toBe(url);
    await expect(page.locator('html')).toHaveAttribute('data-app-ready', 'true');
  }
  // Closing with the dialog's own button leaves no layer entry behind.
  await page.locator('#opponents-button').click();
  await page.locator('#opponents-dialog .close-dialog').click();
  await expect(page.locator('#opponents-dialog')).toBeHidden();
  await expect.poll(() => page.evaluate(() => history.state?.noirLayer ?? null)).toBe(null);
});

test('Back closes the review, the pot details and the fresh-start prompt after a finished hand', async ({
  page,
}) => {
  const url = await ready(page);
  await page.evaluate(() => window.qa.foldWin(5));
  await page.locator('#review-hand-button').click();
  await expect(page.locator('#review-dialog')).toBeVisible();
  await page.goBack();
  await expect(page.locator('#review-dialog')).toBeHidden();
  expect(page.url()).toBe(url);
  await page.locator('#pot-details-button').click();
  await expect(page.locator('#pot-dialog')).toBeVisible();
  await page.goBack();
  await expect(page.locator('#pot-dialog')).toBeHidden();
  // The fresh-start prompt is offered once a hand has been played.
  await page.locator('#reset-button').click();
  await expect(page.locator('#reset-dialog')).toBeVisible();
  await page.goBack();
  await expect(page.locator('#reset-dialog')).toBeHidden();
  expect(page.url()).toBe(url);
});

test('on a phone, Back closes an opponent detail before the settings that hold it', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'mobile', 'The detail opens as its own panel on phones');
  await ready(page);
  await page.locator('#opponents-button').click();
  await page.locator('[data-profile-preview="rook"]').click();
  await expect(page.locator('#profile-detail')).toBeVisible();
  await page.goBack();
  await expect(page.locator('#profile-detail')).toBeHidden();
  await expect(page.locator('#opponents-dialog')).toBeVisible();
  await page.goBack();
  await expect(page.locator('#opponents-dialog')).toBeHidden();
});
