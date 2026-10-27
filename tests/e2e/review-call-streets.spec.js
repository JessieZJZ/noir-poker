import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { heroValueGame } from '../fixtures/review-spots.js';
import { lastRiverCall } from '../fixtures/review-call-streets.js';
import { SUPPORTED_LOCALES } from '../../src/i18n/index.js';

test('the turn call explains the final river card separately from river betting in every locale', async ({
  page,
}, info) => {
  const game = heroValueGame('overpair');
  game.decisions = [lastRiverCall()];
  game.botDecisions = [];
  await page.goto('/');
  await page.waitForFunction(() => window.qa);
  await page.evaluate((g) => window.qa.loadRecordedGame(g), game);
  await page.locator('#review-hand-button').click();
  const summary = page.locator('#review-coach-explanation');
  await expect(summary).toContainText('本轮跟注后即可看到最后一张河牌');
  await expect(summary).toContainText('河牌若再面对下注，仍需另作决定');
  await expect(summary).not.toContainText(/不保证免费把剩余公共牌看完|不保证免费见完所有公共牌/);
  await mkdir('.artifacts/record-detail-2026-10-26/web', { recursive: true });
  await summary.locator('.review-analysis-heading').scrollIntoViewIfNeeded();
  await page.screenshot({
    path: `.artifacts/record-detail-2026-10-26/web/${info.project.name}-turn-call.png`,
  });
  for (const locale of SUPPORTED_LOCALES) {
    await page.locator('#language-select').evaluate((el, value) => {
      el.value = value;
      el.dispatchEvent(new Event('change'));
    }, locale);
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await expect(summary).toContainText('400K');
    await expect(summary).not.toContainText(/\{\d+\}/);
    if (!['zh-CN', 'zh-TW', 'ja'].includes(locale))
      await expect(summary).not.toContainText(/\p{Script=Han}/u);
  }
});
