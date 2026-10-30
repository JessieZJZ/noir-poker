import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { observerRecord } from '../fixtures/opponent-observer.js';
import { heroValueGame } from '../fixtures/review-spots.js';
import { lastRiverCall } from '../fixtures/review-call-streets.js';
import { SUPPORTED_LOCALES } from '../../src/i18n/index.js';

async function open(page, record) {
  const game = heroValueGame('overpair');
  game.botDecisions = [record];
  game.players[1].name = 'Alex';
  game.players[1].botProfile = 'balanced';
  game.decisions = [lastRiverCall()];
  await page.goto('/');
  await page.waitForFunction(() => window.qa);
  await page.evaluate((g) => window.qa.loadRecordedGame(g), game);
  await page.locator('#review-hand-button').click();
  await page.waitForFunction(
    () => document.querySelector('#review-dialog')?.dataset.analysisStatus === 'done',
  );
  await page.locator('#review-opponents-tab').click();
  return page.locator('#review-opponent-detail .review-explanation');
}

test('opponent summary describes the A2 fold and its threats, with no future coaching in any locale', async ({
  page,
}, info) => {
  const detail = await open(page, observerRecord());
  await expect(detail).toContainText('Alex在 SB 位拿 A♠ 2♦');
  await expect(detail).toContainText('选择弃牌');
  await expect(detail).toContainText('三张同花色');
  await expect(detail).not.toContainText(/过牌先|再遇下注|要结合金额|应比较|需要按新的价格/);
  const output =
    process.env.NOIR_REVIEW_ARTIFACT_DIR || '.artifacts/opponent-observer-2026-10-26/web';
  await mkdir(output, { recursive: true });
  await detail.locator('.review-analysis-heading').scrollIntoViewIfNeeded();
  await page.screenshot({
    path: `${output}/${info.project.name}-fold.png`,
  });
  for (const locale of SUPPORTED_LOCALES) {
    await page.locator('#language-select').evaluate((el, value) => {
      el.value = value;
      el.dispatchEvent(new Event('change'));
    }, locale);
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await expect(detail).toContainText('Alex');
    await expect(detail).toContainText('300');
    await expect(detail).not.toContainText(/\{\d+\}/);
    if (!['zh-CN', 'zh-TW', 'ja'].includes(locale))
      await expect(detail).not.toContainText(/\p{Script=Han}/u);
  }
});

test('observed set check retains board danger and redraws without advising a future response', async ({
  page,
}) => {
  const detail = await open(
    page,
    observerRecord({ action: 'check', reason: 'pot-control', hole: '5c 5d', board: '4d Qh Ah 5h' }),
  );
  await expect(detail).toContainText('选择过牌');
  await expect(detail).toContainText('过牌避免主动扩大当前底池');
  await expect(detail).toContainText('葫芦或四条');
  await expect(detail).not.toContainText(
    /再遇下注时|后面仍有玩家可以下注，过牌不保证|需要按新的价格/,
  );
});

test('observer draw calls keep their concrete outs without a repeated improvement closing', async ({
  page,
}, info) => {
  const detail = await open(
    page,
    observerRecord({
      action: 'call',
      reason: 'price-continue',
      hole: 'As 4c',
      board: '2d Kc Qs 3d',
      publicStrategy: {
        draw: { straightDraw: true, pairedBoard: false },
        options: [],
        call: { eligible: true, futurePayBound: 300, impliedValue: 5 },
      },
    }),
  );
  await expect(detail).toContainText('选择跟注');
  await expect(detail).toContainText('卡顺听牌');
  await expect(detail).toContainText('共有 4 张牌可能补成顺子');
  await expect(detail).not.toContainText('这次跟注保留了听牌的改善机会');
  await expect(detail).not.toContainText(/建议|再遇下注时|机器人/);
  await detail.locator('.review-analysis-heading').scrollIntoViewIfNeeded();
  const output = process.env.NOIR_REVIEW_ARTIFACT_DIR || '.artifacts/observer-dedup-review-web';
  await mkdir(output, { recursive: true });
  await page.screenshot({ path: `${output}/${info.project.name}.png` });
});
