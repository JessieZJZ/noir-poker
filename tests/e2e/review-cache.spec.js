import { test, expect } from '@playwright/test';
import { heroValueGame } from '../fixtures/review-spots.js';
import { reviewedAllInGame } from '../fixtures/all-in-decisions.js';
import {
  turnBluffReview,
  pocketNinesCheckedBoard,
  suitedBroadwayFiveBetFold,
} from '../fixtures/review-summary.js';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'hardwareConcurrency', { value: 8 });
    const Original = window.Worker;
    window.__reviewWorkers = 0;
    window.__reviewProgress = [];
    window.Worker = class extends Original {
      constructor(...args) {
        super(...args);
        window.__reviewWorkers++;
        this.addEventListener('message', ({ data }) => {
          if (data.type === 'progress') window.__reviewProgress.push(data.index);
        });
      }
    };
  });
  await page.goto('/');
  await page.waitForFunction(() => window.qa);
});
const finished = async (page) =>
  expect(page.locator('#review-dialog')).toHaveAttribute('data-analysis-status', 'done', {
    timeout: 120000,
  });
test('parallel interactive reviews reuse completed results after reopen and reload', async ({
  page,
}, info) => {
  const game = heroValueGame('overpair');
  game.decisions = [turnBluffReview(), pocketNinesCheckedBoard(), suitedBroadwayFiveBetFold()];
  await page.evaluate((game) => window.qa.loadRecordedGame(game), game);
  const start = Date.now();
  await page.locator('#review-hand-button').click();
  await finished(page);
  const coldMs = Date.now() - start;
  expect(await page.evaluate(() => window.__reviewWorkers)).toBe(2);
  const summary = await page.locator('#review-coach-explanation').innerText();
  await page.locator('#review-dialog .close-dialog').first().click();
  await page.locator('#review-hand-button').click();
  await finished(page);
  expect(await page.evaluate(() => window.__reviewWorkers)).toBe(2);
  await page.reload();
  await page.waitForFunction(() => window.qa);
  await page.evaluate((game) => window.qa.loadRecordedGame(game), game);
  const warmStart = Date.now();
  await page.locator('#review-hand-button').click();
  await finished(page);
  const warmMs = Date.now() - warmStart;
  expect(await page.evaluate(() => window.__reviewWorkers)).toBe(0);
  await expect(page.locator('#review-coach-explanation')).toHaveText(summary, {
    useInnerText: true,
  });
  const saved = await page.evaluate(() => localStorage.getItem('noir-review-cache-v1'));
  expect(saved.length * 3).toBeLessThanOrEqual(1024 * 1024);
  await info.attach('review-cache-timing', {
    body: JSON.stringify({
      coldMs,
      warmReloadMs: warmMs,
      decisions: 3,
      trials: 600,
      rolloutTrials: 0,
      continuationPolicy: 'offline-only',
    }),
    contentType: 'application/json',
  });
  await page.reload();
  await page.waitForFunction(() => window.qa);
  const missingIndex = await page.evaluate((game) => {
    const saved = JSON.parse(localStorage.getItem('noir-review-cache-v1'));
    const [key] = saved.entries.shift();
    const [, snapshot] = JSON.parse(key);
    localStorage.setItem('noir-review-cache-v1', JSON.stringify(saved));
    window.qa.loadRecordedGame(game);
    return game.decisions.findIndex((d) => JSON.stringify(d) === JSON.stringify(snapshot));
  }, game);
  expect(missingIndex).toBeGreaterThanOrEqual(0);
  await page.locator('#review-hand-button').click();
  await finished(page);
  expect(await page.evaluate(() => window.__reviewProgress)).toEqual([missingIndex]);
  await expect(page.locator('#review-coach-explanation')).toHaveText(summary, {
    useInnerText: true,
  });
});

test('archived reviews reuse the same cache without adding analysis to raw records', async ({
  page,
}) => {
  await page.evaluate(() => {
    window.qa.recordsStart();
    window.qa.recordsFinish();
    window.qa.recordsNext();
  });
  await page.locator('#rules-button').click();
  await page.locator('#records-menu-item').click();
  await page.locator('[data-record-hand]').first().click();
  const before = await page.evaluate(() => localStorage.getItem('noir-game-records-v1'));
  await page.locator('#history-review-button').click();
  await finished(page);
  const count = await page.evaluate(() => window.__reviewWorkers);
  expect(count).toBe(1);
  const summary = await page.locator('#review-coach-explanation').innerText();
  await page.locator('#review-dialog .close-dialog').first().click();
  await page.locator('#history-review-button').click();
  await finished(page);
  expect(await page.evaluate(() => window.__reviewWorkers)).toBe(count);
  await expect(page.locator('#review-coach-explanation')).toHaveText(summary, {
    useInnerText: true,
  });
  expect(await page.evaluate(() => localStorage.getItem('noir-game-records-v1'))).toBe(before);
});

test('closing an active parallel review cancels both workers and rejects late results before reopening', async ({
  page,
}) => {
  await page.evaluate(() => {
    const Original = window.Worker;
    window.__heldResults = [];
    window.__terminatedReviews = 0;
    window.Worker = class extends Original {
      set onmessage(handler) {
        super.onmessage = (event) => window.__heldResults.push(() => handler(event));
      }
      terminate() {
        window.__terminatedReviews++;
        super.terminate();
      }
    };
  });
  await page.evaluate((game) => window.qa.loadRecordedGame(game), heroValueGame('overpair'));
  await page.locator('#review-hand-button').click();
  await page.waitForFunction(() => window.__heldResults.length >= 1);
  await expect(page.locator('#review-dialog')).toHaveAttribute('data-analysis-status', 'running');
  const count = await page.evaluate(() => window.__reviewWorkers);
  await page.locator('#review-dialog .close-dialog').first().click();
  await expect.poll(() => page.evaluate(() => window.__terminatedReviews)).toBe(count);
  await page.evaluate(() => window.__heldResults.splice(0).forEach((deliver) => deliver()));
  await page.evaluate(() => {
    window.Worker = Object.getPrototypeOf(window.Worker);
  });
  await page.locator('#review-hand-button').click();
  await finished(page);
  await expect(page.locator('#review-coach-explanation')).not.toBeEmpty();
});

test('fast result delivery leaves perspective tabs in place and clickable', async ({ page }) => {
  await page.evaluate(() => {
    const Original = window.Worker;
    window.__pendingReviewResults = [];
    window.Worker = class extends Original {
      set onmessage(handler) {
        super.onmessage = (event) =>
          window.__releaseReviewResults
            ? handler(event)
            : window.__pendingReviewResults.push(() => handler(event));
      }
    };
  });
  await page.evaluate((game) => window.qa.loadRecordedGame(game), reviewedAllInGame('draw-fold'));
  await page.locator('#review-hand-button').click();
  const before = await page.locator('#review-opponents-tab').boundingBox();
  await page.waitForFunction(() => window.__pendingReviewResults.length > 0);
  await page.evaluate(() => {
    window.__releaseReviewResults = true;
    window.__pendingReviewResults.splice(0).forEach((deliver) => deliver());
  });
  await finished(page);
  const after = await page.locator('#review-opponents-tab').boundingBox();
  expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(0.5);
  await page.locator('#review-opponents-tab').click();
  await expect(page.locator('#review-opponents-tab')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#review-opponent-detail .review-explanation')).toContainText('Mia');
});
