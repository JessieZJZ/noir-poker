import { test, expect } from '@playwright/test';
import { heroValueGame } from '../fixtures/review-spots.js';
import {
  turnBluffReview,
  pocketNinesCheckedBoard,
  suitedBroadwayFiveBetFold,
} from '../fixtures/review-summary.js';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
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
test('full-quality live reviews reuse completed results after reopen and reload', async ({
  page,
}, info) => {
  const game = heroValueGame('overpair');
  game.decisions = [turnBluffReview(), pocketNinesCheckedBoard(), suitedBroadwayFiveBetFold()];
  await page.evaluate((game) => window.qa.loadRecordedGame(game), game);
  const start = Date.now();
  await page.locator('#review-hand-button').click();
  await finished(page);
  const coldMs = Date.now() - start;
  expect(await page.evaluate(() => window.__reviewWorkers)).toBe(1);
  const summary = await page.locator('#review-coach-explanation').innerText();
  await page.locator('#review-dialog .close-dialog').first().click();
  await page.locator('#review-hand-button').click();
  await finished(page);
  expect(await page.evaluate(() => window.__reviewWorkers)).toBe(1);
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
      rolloutTrials: 40,
    }),
    contentType: 'application/json',
  });
  await page.reload();
  await page.waitForFunction(() => window.qa);
  await page.evaluate((game) => {
    const saved = JSON.parse(localStorage.getItem('noir-review-cache-v1'));
    saved.entries.shift();
    localStorage.setItem('noir-review-cache-v1', JSON.stringify(saved));
    window.qa.loadRecordedGame(game);
  }, game);
  await page.locator('#review-hand-button').click();
  await finished(page);
  expect(await page.evaluate(() => window.__reviewProgress)).toEqual([0]);
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
