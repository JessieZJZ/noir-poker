import { test, expect } from '@playwright/test';

// Portrait screens show two decisions and half of the third in a row above
// the detail. Landscape keeps every decision in the side list beside it.
const sizes = [
  [320, 900],
  [390, 900],
  [768, 900],
  [1180, 820],
  [1280, 900],
];
for (const [width, height] of sizes) {
  const landscape = width > height && width > 700;
  test(`${width}x${height} review ${landscape ? 'keeps every decision in the side list' : 'exposes half of the third card only when there are more than two'}`, async ({
    page,
  }, info) => {
    await page.goto('/');
    await page.waitForFunction(() => !!window.qa);
    await page.setViewportSize({ width, height });
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
        if (landscape) {
          const layout = await timeline.evaluate((element) => {
            const steps = [...element.children].map((step) => step.getBoundingClientRect()),
              box = element.getBoundingClientRect(),
              detail = element.closest('nav').nextElementSibling.getBoundingClientRect();
            return {
              stacked: steps.every(
                (step, i) =>
                  i === 0 ||
                  (Math.abs(step.left - steps[0].left) < 1 && step.top >= steps[i - 1].bottom - 1),
              ),
              beside: box.right <= detail.left + 1 && box.top < detail.bottom,
              rowScroll: element.scrollWidth > element.clientWidth + 1,
              width: box.width,
            };
          });
          expect(layout, `${count} decisions`).toMatchObject({
            stacked: true,
            beside: true,
            rowScroll: false,
          });
          expect(layout.width).toBeLessThan(260);
          if (count === 4)
            await info.attach(`${perspective}-side-list`, {
              body: await page.locator('#review-dialog').screenshot(),
              contentType: 'image/png',
            });
          continue;
        }
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
