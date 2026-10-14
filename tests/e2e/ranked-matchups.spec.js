import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { heroValueGame } from '../fixtures/review-spots.js';
import { decisionContext } from '../../src/review/context.js';
import { handMatchups } from '../../src/review/matchups.js';

test('review renders up to three public-range examples on each side without numeric probabilities', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const game = heroValueGame('overpair');
  const snapshot = game.decisions.find((decision) => decision.street === 1);
  const matchups = handMatchups(snapshot, decisionContext(snapshot));
  expect(matchups.ahead).toHaveLength(3);
  expect(matchups.behind).toHaveLength(3);
  // Keep the real engine's before-action flop snapshot. This fixture only
  // narrows the rendered timeline, rather than inventing a decision/outcome.
  game.decisions = [snapshot];
  await page.goto('/');
  await page.waitForFunction(() => window.qa && window.noir);
  await page.evaluate((recorded) => window.qa.loadRecordedGame(recorded), game);
  const before = await page.evaluate(() => window.qa.snapshot());
  await page.locator('#review-hand-button').click();
  await expect(page.locator('#review-dialog[data-analysis-status="done"]')).toBeVisible({
    timeout: 20000,
  });
  const explanation = page.locator('#review-coach-explanation');
  const comparison = explanation.locator('.review-matchups');
  await expect(comparison).toHaveCount(1);
  await expect(comparison.locator('.review-matchup-hand')).toContainText(matchups.handLabel);
  await expect(comparison).not.toContainText(/\d+(?:\.\d+)?%/);
  await expect(page.locator('#review-hole .playing-card')).toHaveCount(2);
  await expect(page.locator('#review-board .playing-card')).toHaveCount(3);
  for (const direction of ['ahead', 'behind']) {
    const examples = comparison.locator(
      `[data-matchup-direction="${direction}"] .review-matchup-example`,
    );
    await expect(examples).toHaveCount(3);
    for (const [index, example] of matchups[direction].entries())
      await expect(examples.nth(index)).toContainText(example.text);
  }
  // Live localization rerenders the same estimates and preserves the hand.
  for (const locale of ['en', 'ja', 'zh-CN']) {
    await page.locator('#language-select').evaluate((select, value) => {
      select.value = value;
      select.dispatchEvent(new Event('change'));
    }, locale);
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    if (locale === 'zh-CN') await expect(comparison).toContainText('当前成牌对比');
    else await expect(explanation).not.toContainText('当前成牌对比');
    if (locale === 'en') await expect(comparison).not.toContainText(/\p{Script=Han}/u);
    for (const direction of ['ahead', 'behind']) {
      const examples = comparison.locator(
        `[data-matchup-direction="${direction}"] .review-matchup-example`,
      );
      await expect(examples).toHaveCount(3);
      for (const [index, example] of matchups[direction].entries())
        await expect(examples.nth(index)).toContainText(example.text);
    }
    expect(await page.evaluate(() => window.qa.snapshot())).toEqual(before);
    expect(
      await page
        .locator('#review-dialog')
        .evaluate((element) => element.scrollWidth - element.clientWidth),
    ).toBeLessThanOrEqual(1);
  }
  await comparison.scrollIntoViewIfNeeded();
  await expect(comparison).toBeVisible();
  await mkdir('.artifacts/position-equity-review', { recursive: true });
  const screenshot = path.resolve(
    '.artifacts/position-equity-review',
    `${info.project.name}-ranked-matchups.png`,
  );
  await page.screenshot({ path: screenshot });
  await info.attach('public-range-matchups', { path: screenshot, contentType: 'image/png' });
  expect(errors).toEqual([]);
});
