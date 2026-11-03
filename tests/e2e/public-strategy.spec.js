import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { topPairFlushTurn, finishValueGame } from '../fixtures/review-value-targets.js';
import { strategyRiverGame } from '../fixtures/strategy-review.js';
import { SUPPORTED_LOCALES } from '../../src/i18n/index.js';
const output = '.artifacts/strategy-gaps-2026-10-26/web';
const record = () => {
  const row = topPairFlushTurn({ hole: 'Ad Jd', turnCard: '2s' });
  const g = finishValueGame(row.game);
  g.decisions = [row.flop];
  return g;
};
async function open(page, game) {
  await page.goto('/');
  await page.waitForFunction(() => window.qa);
  await page.evaluate((g) => window.qa.loadRecordedGame(g), game);
  await page.locator('#review-hand-button').click();
  await expect(page.locator('#review-dialog')).toHaveAttribute('data-analysis-status', 'done', {
    timeout: 120000,
  });
  return page.locator('#review-coach-explanation');
}
test('a nut draw review connects improvement, fold pressure and next-street cost without repeating the wager', async ({
  page,
}, info) => {
  const body = await open(page, record());
  const summary = body.locator('.review-analysis-heading ~ p').first();
  await expect(summary).toContainText('最大同花听牌');
  await expect(summary).toContainText('下一张没改善或再遭加注');
  expect((await summary.innerText()).match(/810K/g)).toHaveLength(1);
  await expect(summary).not.toContainText(/这次拿出|必然|模拟|抽样/);
  await summary.scrollIntoViewIfNeeded();
  await mkdir(output, { recursive: true });
  await page.screenshot({ path: output + '/' + info.project.name + '-nut-draw.png' });
});
for (const [group, locales] of [
  SUPPORTED_LOCALES.slice(0, 6),
  SUPPORTED_LOCALES.slice(6),
].entries())
  test('strategy explanation and guide switch locale ' + group, async ({ page }) => {
    const game = record();
    await page.goto('/');
    for (const locale of locales) {
      await page.evaluate((l) => localStorage.setItem('noir-locale', l), locale);
      const body = await open(page, game);
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      const text = await body.innerText();
      expect(text).toContain('810K');
      expect(text).not.toMatch(/\{\d+\}/);
      if (!['zh-CN', 'zh-TW', 'ja'].includes(locale))
        expect(text, locale).not.toMatch(/\p{Script=Han}/u);
      await page.locator('#review-dialog .dialog-header .close-dialog').click();
      await page.locator('#rules-button').click();
      await page.locator('#guide-menu-item').click();
      const glossary = page.locator('#review-glossary');
      await expect(glossary.locator('.position-glossary > div > b')).toHaveCount(35);
      const guide = await glossary.innerText();
      expect(guide).not.toMatch(/\{\d+\}/);
      if (!['zh-CN', 'zh-TW', 'ja'].includes(locale))
        expect(guide, locale).not.toMatch(/\p{Script=Han}/u);
    }
  });

test('a royal public board explains a guaranteed split call in the actual review', async ({
  page,
}, info) => {
  const { game: g, snapshot } = strategyRiverGame();
  g.decisions = [snapshot];
  const body = await open(page, g);
  await expect(body).toContainText('至少可分回 3.1K');
  await expect(body).toContainText('本次成本为 1.2K');
  await expect(body).toContainText('因此应保留跟注');
  await expect(body).not.toContainText('需要结合这条下注线判断');
  await mkdir(output, { recursive: true });
  await body.locator('p').last().scrollIntoViewIfNeeded();
  await page.screenshot({ path: output + '/' + info.project.name + '-guaranteed-split.png' });
});
