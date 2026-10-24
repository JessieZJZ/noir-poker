import { test, expect } from '@playwright/test';

for (const width of [320, 390, 768, 1280]) {
  test(`${width}px review exposes half of the third card only when there are more than two`, async ({
    page,
  }, info) => {
    await page.goto('/');
    await page.waitForFunction(() => !!window.qa);
    await page.setViewportSize({ width, height: 900 });
    for (const count of [1, 2, 3, 4]) {
      await page.evaluate((count) => {
        window.qa.reviewLine();
        const game = window.qa.snapshot();
        game.decisions = game.decisions.slice(0, count);
        game.botDecisions = game.botDecisions.slice(0, count);
        window.qa.loadRecordedGame(game);
      }, count);
      await page.locator('#review-hand-button').click();
      for (const perspective of ['hero', 'opponents']) {
        await page.locator(`#review-${perspective}-tab`).click();
        const timeline = page.locator(
          perspective === 'hero' ? '#review-timeline' : '#review-opponents .review-timeline',
        );
        await expect(timeline.locator('.review-step')).toHaveCount(count);
        if (count <= 2) {
          await expect(timeline).not.toHaveClass(/has-overflow/);
          continue;
        }
        await expect(timeline).toHaveClass(/has-overflow/);
        const geometry = await timeline.evaluate((element) => {
          const third = element.children[2].getBoundingClientRect(),
            second = element.children[1].getBoundingClientRect(),
            box = element.getBoundingClientRect();
          return {
            preview:
              (box.right - parseFloat(getComputedStyle(element).paddingRight) - third.left) /
              third.width,
            secondVisible: second.right <= box.right,
            scrollable: element.scrollWidth > element.clientWidth,
          };
        });
        expect(geometry.preview).toBeGreaterThan(0.45);
        expect(geometry.preview).toBeLessThan(0.55);
        expect(geometry.secondVisible).toBe(true);
        expect(geometry.scrollable).toBe(true);
        if (width === 390 && count === 4)
          await info.attach(`${perspective}-two-and-half-cards`, {
            body: await timeline.screenshot(),
            contentType: 'image/png',
          });
      }
      await page.locator('#review-hero-tab').click();
      await expect(page.locator('#review-activity')).toHaveAttribute('open', '');
      await expect(page.locator('#review-activity-list li').first()).toHaveCSS('font-size', '13px');
      await page.locator('#review-dialog .icon-button.close-dialog').click();
    }
  });
}
