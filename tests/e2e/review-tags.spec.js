import { test, expect } from '@playwright/test';
import { readReviewTagGeometry } from '../fixtures/review-tag-geometry.js';

for (const width of [320, 390, 768, 1280]) {
  test(`${width}px review tags keep natural height during partial and completed analysis`, async ({
    page,
  }, info) => {
    // Hold delivery only: the real worker still computes every result.
    await page.addInitScript(() => {
      const NativeWorker = window.Worker;
      window.heldReviewMessages = [];
      window.Worker = function (url, options) {
        const worker = new NativeWorker(url, options);
        if (String(url).includes('/review/worker.js'))
          Object.defineProperty(worker, 'onmessage', {
            set(handler) {
              worker.addEventListener('message', (event) =>
                window.heldReviewMessages.push(() => handler(event)),
              );
            },
          });
        return worker;
      };
    });
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await page.waitForFunction(() => window.qa);
    const count = await page.evaluate(() => {
      window.qa.reviewLine();
      const game = window.qa.snapshot();
      game.botDecisions[1].trace.profile = 'tan';
      game.botDecisions[1].trace.profileName = '谭老板，Tan Xuan';
      window.qa.loadRecordedGame(game);
      return game.decisions.length;
    });
    await page.locator('#review-hand-button').click();
    await expect(page.locator('#review-timeline .review-status.pending')).toHaveCount(count);
    const checkTags = async (selector) => {
      const tags = await page.evaluate(readReviewTagGeometry, selector);
      expect(tags.length).toBeGreaterThan(0);
      for (const tag of tags) {
        expect(tag.paddingTop, tag.text).toBe(4);
        expect(tag.paddingBottom, tag.text).toBe(4);
        expect(Math.abs(tag.height - tag.naturalHeight), JSON.stringify(tag)).toBeLessThanOrEqual(
          1,
        );
      }
      return tags;
    };
    await checkTags('#review-timeline');
    await page.waitForFunction((count) => window.heldReviewMessages.length >= count + 1, count);
    await page.evaluate(() => window.heldReviewMessages.shift()());
    await expect(page.locator('#review-analysis-state')).toContainText(`1 / ${count}`);
    await checkTags('#review-timeline');
    await page.evaluate(() => window.heldReviewMessages.splice(0).forEach((deliver) => deliver()));
    await expect(page.locator('#review-dialog')).toHaveAttribute('data-analysis-status', 'done');
    await checkTags('#review-timeline');
    await page.locator('#review-opponents-tab').click();
    const tags = await checkTags('#review-opponents .review-timeline');
    if (width <= 390) expect(tags.some((tag) => tag.lines > 1)).toBe(true);
    if (width === 390)
      await info.attach('compact-opponent-tags', {
        body: await page.locator('#review-dialog').screenshot(),
        contentType: 'image/png',
      });
  });
}
