import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { heroValueGame } from '../fixtures/review-spots.js';
import {
  semanticDrawCall,
  unopenedShoveDecision,
  reviewSemanticTopics,
} from '../fixtures/review-semantic-topics.js';

const artifacts =
  process.env.NOIR_REVIEW_ARTIFACT_DIR || '.artifacts/review-semantic-dedup-20261028/web';

test('an alternative preflop call shows its price and does not promise that the betting round is closed', async ({
  page,
}) => {
  const game = heroValueGame('overpair');
  game.decisions = [unopenedShoveDecision()];
  game.botDecisions = [];
  await page.goto('/');
  await page.waitForFunction(() => window.qa);
  await page.evaluate((value) => window.qa.loadRecordedGame(value), game);
  await page.locator('#review-hand-button').click();
  const summary = page.locator('#review-coach-explanation');
  await summary.locator('.review-analysis-heading').waitFor();
  await expect(summary).toContainText('再补 200 跟注');
  await expect(summary).toContainText('19.8K');
  await expect(summary).toContainText('常规开池与弃牌');
  await expect(summary).toContainText('本轮还有 5 位对手等待回应');
  await expect(summary).not.toContainText('你身后还有 5 人等待行动');
  await expect(summary).toContainText('重新决定是否继续');
  await expect(summary).not.toContainText('这手建议跟注，保留当前牌力');
  await expect(page.locator('#review-selected-status')).toHaveText('需要比较');
});

test('a live third player retains both current-round repricing and later-street cost in review', async ({
  page,
}) => {
  const game = heroValueGame('overpair');
  game.decisions = [semanticDrawCall({ thirdLive: true })];
  game.botDecisions = [];
  await page.goto('/');
  await page.waitForFunction(() => window.qa);
  await page.evaluate((value) => window.qa.loadRecordedGame(value), game);
  await page.locator('#review-hand-button').click();
  const summary = page.locator('#review-coach-explanation');
  await expect(summary).toContainText('本轮仍有玩家可以行动');
  await expect(summary).toContainText('下一街再被下注仍要另算成本');
  const text = await summary.innerText();
  expect(reviewSemanticTopics(text).futureDecision).toHaveLength(1);
  expect(reviewSemanticTopics(text).closure).toHaveLength(0);
  expect(text).toContain('葫芦、四条');
});

test('the reported all-in draw review explains closure once while keeping price, outs and paired-board risk', async ({
  page,
}, info) => {
  const game = heroValueGame('overpair');
  game.decisions = [semanticDrawCall()];
  game.botDecisions = [];
  await page.goto('/');
  await page.waitForFunction(() => window.qa);
  await page.evaluate((value) => window.qa.loadRecordedGame(value), game);
  await page.locator('#review-hand-button').click();
  const summary = page.locator('#review-coach-explanation');
  await expect(summary).toContainText('23.2%');
  await expect(summary).toContainText('36.7K');
  await expect(summary).toContainText('4 张');
  await expect(summary).toContainText('葫芦、四条');
  const text = await summary.innerText();
  expect(reviewSemanticTopics(text).closure).toHaveLength(1);
  expect(text).not.toMatch(/下一街的投入还要另算|下一张没改善且再遇/);
  await mkdir(artifacts, { recursive: true });
  await summary.locator('.review-analysis-heading').scrollIntoViewIfNeeded();
  await page.screenshot({
    path: `${artifacts}/${info.project.name}-all-in-draw.png`,
    fullPage: true,
  });
  await page.locator('#review-dialog .close-dialog').first().click();
  await page.locator('#review-hand-button').click();
  await expect(summary).toContainText('葫芦、四条');
  expect(reviewSemanticTopics(await summary.innerText()).closure).toHaveLength(1);
});
