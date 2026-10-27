import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { heroValueGame } from '../fixtures/review-spots.js';
import {
  turnBluffReview,
  turnStraightCallRecord,
  suitedBroadwayFiveBetFold,
  pocketNinesCheckedBoard,
} from '../fixtures/review-summary.js';

test('reported reviews render coherent causal summaries and preserve them across locale changes', async ({
  page,
}, info) => {
  const game = heroValueGame('overpair');
  const screenshots = '.artifacts/review-summary-20261017/web';
  await mkdir(screenshots, { recursive: true });
  game.decisions = [turnBluffReview(), suitedBroadwayFiveBetFold(), pocketNinesCheckedBoard()];
  game.botDecisions = [turnStraightCallRecord()];
  await page.goto('/');
  await page.waitForFunction(() => window.qa);
  await page.evaluate((g) => window.qa.loadRecordedGame(g), game);
  await page.locator('#review-hand-button').click();
  await expect(page.locator('#review-dialog')).toHaveAttribute('data-analysis-status', 'done', {
    timeout: 120000,
  });
  const hero = page.locator('#review-coach-explanation');
  await page.locator('[data-review-index="0"]').click();
  await expect(hero).toContainText('是在尝试诈唬');
  await expect(hero).not.toContainText(/不能只按成牌标签|相同牌力|是在回应/);
  await page.locator('[data-review-index="1"]').click();
  await expect(hero.locator('.review-range-note')).toHaveCount(0);
  // The summary opens with the actual 5-bet, not a generic range reminder.
  await expect(hero.locator('.review-analysis-heading ~ p').first()).toContainText(
    'Jade（范围纪律）在 MP 位5-bet 加注至 9.3K',
  );
  await expect(hero).not.toContainText('再加注通常比普通开池更集中');
  await expect(hero).toContainText(/再补 8.3K.*弃牌可以保留.*19K/);
  await expect(hero).not.toContainText('不必只因遇到加注就自动弃牌');
  await hero.locator('.review-analysis-heading').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${screenshots}/${info.project.name}-KQs-fold.png` });
  await info.attach('KQs-five-bet-fold', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
  await page.locator('[data-review-index="2"]').click();
  await expect(hero).toContainText(/Leo.*过牌后.*高张付费/);
  await expect(hero).toContainText('免费看下一张反超');
  await page.locator('#review-opponents-tab').click();
  const bot = page.locator('#review-opponent-detail .review-explanation');
  await expect(bot.locator('.review-analysis-heading ~ p')).toHaveCount(1);
  await expect(bot).toContainText(/选择跟注 6.3K，当前主要依靠听牌改善争取获胜/);
  await expect(bot).toContainText('8 张牌可能补成顺子');
  await expect(bot).not.toContainText(/补成顺子[／或]同花|相同牌力/);
  await bot.locator('.review-analysis-heading').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${screenshots}/${info.project.name}-QTo-call.png` });
  await info.attach('QTo-straight-draw-call', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
  for (const locale of ['en', 'zh-TW', 'ja', 'ko', 'es', 'it', 'pt', 'de', 'fr', 'ru', 'zh-CN']) {
    await page.locator('#language-select').evaluate((el, locale) => {
      el.value = locale;
      el.dispatchEvent(new Event('change'));
    }, locale);
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    if (!['zh-CN', 'zh-TW', 'ja'].includes(locale)) {
      await expect(bot).not.toContainText(/\p{Script=Han}/u);
      await expect(hero).not.toContainText(/\p{Script=Han}/u);
    }
    await expect(bot).toContainText('6.3K');
    await expect(bot).toContainText('7K');
    await expect(bot).not.toContainText(/\{\d+\}/);
  }
});
