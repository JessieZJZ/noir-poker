import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.qa);
});

test('compact opponent position tags leave room for larger working inspection eyes', async ({
  page,
}) => {
  for (const [width, height] of [
    [320, 759],
    [390, 844],
    [440, 720],
    [768, 1180],
    [1032, 1376],
  ]) {
    await page.setViewportSize({ width, height });
    for (const count of [5, 9]) {
      await page.evaluate((count) => window.qa.foldWin(count), count);
      const sizes = await page.locator('.seat-profile').evaluateAll((profiles) =>
        profiles.map((profile) => {
          const tag = profile.querySelector('.position-badge'),
            eye = profile.querySelector('.seat-peek'),
            name = profile.querySelector('.seat-name-label'),
            box = profile.getBoundingClientRect(),
            tagBox = tag.getBoundingClientRect(),
            eyeBox = eye.getBoundingClientRect(),
            nameBox = name.getBoundingClientRect();
          return {
            font: parseFloat(getComputedStyle(tag).fontSize),
            eye: parseFloat(getComputedStyle(eye).width),
            svg:
              eye.querySelector('svg').getBoundingClientRect().width /
              (eyeBox.width / parseFloat(getComputedStyle(eye).width)),
            fits:
              nameBox.right <= tagBox.left + 1 &&
              tagBox.right <= eyeBox.left + 1 &&
              eyeBox.right <= box.right + 1,
          };
        }),
      );
      expect(sizes).toHaveLength(count - 1);
      for (const size of sizes) {
        expect(size.font).toBe(width > 900 ? 17 : height < 740 ? 15 : 14);
        expect(size.eye).toBe(width > 900 ? 26 : width > 600 ? 24 : 20);
        expect(size.svg).toBeGreaterThanOrEqual(15);
        expect(size.fits).toBe(true);
      }
      const eye = page.locator('.seat-1 .seat-peek');
      const before = await eye.getAttribute('aria-pressed');
      await eye.click();
      await expect(eye).toHaveAttribute('aria-pressed', before === 'true' ? 'false' : 'true');
      if (width === 390 && count === 9) {
        await page.evaluate(() =>
          Promise.all(
            document
              .getAnimations()
              .filter((animation) => Number.isFinite(animation.effect.getComputedTiming().endTime))
              .map((animation) => animation.finished.catch(() => {})),
          ),
        );
        await page.screenshot({ path: test.info().outputPath('compact-larger-eyes.png') });
      }
    }
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.evaluate(() => window.qa.foldWin(9));
  await expect(page.locator('.seat-1 .position-badge')).toHaveCSS('font-size', '17px');
  await expect(page.locator('.seat-1 .seat-peek')).toHaveCSS('width', '20px');
});

test('reported A4 river review shows four stronger hand types including a spade flush', async ({
  page,
}) => {
  await page.evaluate(() => window.qa.pairedFlushReview());
  await page.locator('#review-hand-button').click();
  await expect(page.locator('#review-dialog')).toHaveAttribute('data-analysis-status', 'done', {
    timeout: 120000,
  });
  await page.locator('#review-timeline [data-review-index]').last().click();
  const group = page.locator('#review-coach-explanation [data-matchup-direction="behind"]');
  const examples = group.locator('.review-matchup-example');
  await expect(examples).toHaveCount(4);
  // Examples follow the public range weights; the four hand types do not.
  const types = (await examples.allTextContents()).map((text) => text.split(' ').at(-1));
  expect(types.sort()).toEqual(['三条', '同花', '葫芦', '顺子'].sort());
  await expect(examples.filter({ hasText: '同花' })).toContainText('♠');
  await group.screenshot({ path: test.info().outputPath('four-stronger-hands.png') });
});
