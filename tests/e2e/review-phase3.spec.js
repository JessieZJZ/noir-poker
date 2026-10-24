import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { loadPhase3Source, playPhase3Hand } from '../../scripts/audit-review-phase3.mjs';

const api = await loadPhase3Source(new URL('../..', import.meta.url).pathname);
function sceneGame(index, perspective) {
  // A deliberately arranged, legally completed hand. The target check is a
  // labelled display probe, not a claim about natural policy frequency.
  const played = playPhase3Hand(api, index, { seed: 202610243 });
  const game = played.game;
  const sequence = played.targeted.targetEvent.sequence;
  if (perspective === 'hero') {
    game.decisions = game.decisions
      .filter((s) => s.history.length + 1 === sequence)
      .map((s) => ({ ...s, index: 0 }));
    expect(game.decisions).toHaveLength(1);
    game.botDecisions = [];
  } else {
    game.decisions = [];
    game.botDecisions = game.botDecisions.filter((r) => r.sequence === sequence);
    expect(game.botDecisions).toHaveLength(1);
  }
  return game;
}

test('set check review explains the three-flush risk and the cost of checking to a beginner', async ({
  page,
}, info) => {
  await page.goto('/');
  await page.waitForFunction(() => window.qa);
  await page.evaluate((g) => window.qa.loadRecordedGame(g), sceneGame(3220, 'opponent'));
  await page.locator('#review-hand-button').click();
  await page.locator('#review-opponents-tab').click();
  const summary = page.locator('#review-opponent-detail .review-explanation');
  await expect(summary).toContainText('暗三条 5');
  await expect(summary).toContainText('两张该花色的底牌');
  await expect(summary).toContainText('先不主动做大底池');
  await expect(summary).toContainText('免费见到下一张');
  await expect(summary).not.toContainText('；');
  await summary.locator('p').last().scrollIntoViewIfNeeded();
  await mkdir('.artifacts/review-phase3-2026-10-24/web', { recursive: true });
  await page.screenshot({
    path: path.resolve('.artifacts/review-phase3-2026-10-24/web', `${info.project.name}-set.png`),
  });
});

test('a four-connected board keeps checking as a main route and explains the single-card straight', async ({
  page,
}) => {
  await page.goto('/');
  await page.waitForFunction(() => window.qa);
  await page.evaluate((g) => window.qa.loadRecordedGame(g), sceneGame(3210, 'hero'));
  await page.locator('#review-hand-button').click();
  await expect(page.locator('#review-dialog')).toHaveAttribute('data-analysis-status', 'done', {
    timeout: 60000,
  });
  const summary = page.locator('#review-coach-explanation');
  await expect(summary).toContainText('中任意一张');
  await expect(summary).toContainText('组成顺子');
  await expect(summary).not.toContainText(/这手建议.*(?:下注|加注)/);
});

test('new causal check clauses and their title are displayed in English', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('noir-locale', 'en'));
  await page.goto('/');
  await page.waitForFunction(() => window.qa);
  await page.evaluate((g) => window.qa.loadRecordedGame(g), sceneGame(3220, 'opponent'));
  await page.locator('#review-hand-button').click();
  await page.locator('#review-opponents-tab').click();
  const summary = page.locator('#review-opponent-detail .review-explanation');
  await expect(summary).toContainText(/flush/i);
  await expect(summary).not.toContainText(/公共牌已有|过牌先不主动|领先当前成牌/);
});
