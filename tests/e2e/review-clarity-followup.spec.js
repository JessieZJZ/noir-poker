import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { groupedPreflopReview, lunaCheapEntry } from '../fixtures/review-clarity-followup.js';
import {
  planBotTurn,
  executeBotTurn,
  act,
  advanceStreet,
  legalActions,
} from '../../src/engine/poker.js';
import { SUPPORTED_LOCALES } from '../../src/i18n/index.js';

async function openOpponent(page, game) {
  await page.goto('/');
  await page.waitForFunction(() => window.qa);
  await page.evaluate((g) => window.qa.loadRecordedGame(g), game);
  await page.locator('#review-hand-button').click();
  await page.locator('#review-opponents-tab').click();
  return page.locator('#review-opponent-detail .review-explanation');
}

test('the displayed squeeze review aggregates four real limps and explains suited AJ without boilerplate', async ({
  page,
}, info) => {
  const { game } = groupedPreflopReview();
  const summary = await openOpponent(page, game);
  await expect(summary).toContainText(
    '你在 UTG 位、Mia在 LJ 位、Alex在 HJ 位、River在 CO 位都先跟注 20K 入池',
  );
  await expect(summary).toContainText('小对子、同花牌或连接牌');
  await expect(summary).toContainText('坚果同花听牌');
  await expect(summary).not.toContainText(/明显大于普通开池|不能只根据位置套用|与你底牌同花色/);
  expect((await summary.innerText()).match(/先跟注 20K 入池/g)).toHaveLength(1);
  await summary.locator('p').last().scrollIntoViewIfNeeded();
  await mkdir('.artifacts/review-clarity-2026-10-25/web', { recursive: true });
  await page.screenshot({
    path: path.resolve(
      '.artifacts/review-clarity-2026-10-25/web',
      `${info.project.name}-grouped-aj.png`,
    ),
  });
});

test('the actual K8s limp executes and its displayed review explains the small price and remaining risks', async ({
  page,
}, info) => {
  const game = lunaCheapEntry();
  const plan = planBotTurn(game, () => 0.4, { timingRandom: () => 0.4 });
  executeBotTurn(game, plan, { expedited: true });
  expect(game.botDecisions.at(-1).action).toBe('call');
  expect(game.botDecisions.at(-1).trace.suitedLimp).toBe(true);
  while (game.phase !== 'done') {
    if (game.phase === 'between') advanceStreet(game);
    else act(game, game.actor, legalActions(game).canCheck ? 'check' : 'fold');
  }
  game.decisions = [];
  const summary = await openOpponent(page, game);
  await expect(summary).toContainText('Luna在 UTG 位拿 K♥ 8♥');
  await expect(summary).toContainText('20K');
  await expect(summary).toContainText('1.53M');
  await expect(summary).toContainText('同花听牌和成花机会');
  await expect(summary).toContainText('更高同花');
  await expect(summary).toContainText('新的价格重新决定');
  await summary.locator('p').last().scrollIntoViewIfNeeded();
  await mkdir('.artifacts/review-clarity-2026-10-25/web', { recursive: true });
  await page.screenshot({
    path: path.resolve(
      '.artifacts/review-clarity-2026-10-25/web',
      `${info.project.name}-k8-limp.png`,
    ),
  });
});

test('actual rendered review clauses switch through all supported locales without losing facts', async ({
  page,
}) => {
  const { game } = groupedPreflopReview();
  await page.goto('/');
  for (const locale of SUPPORTED_LOCALES) {
    await page.evaluate((value) => localStorage.setItem('noir-locale', value), locale);
    const summary = await openOpponent(page, game);
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    const text = await summary.innerText();
    for (const amount of ['20K', '190K', '760K'])
      expect(text, `${locale}/${amount}`).toContain(amount);
    if (!['zh-CN', 'zh-TW', 'ja'].includes(locale))
      expect(text, locale).not.toMatch(/\p{Script=Han}/u);
    if (locale !== 'zh-CN') expect(text, locale).not.toMatch(/这类平跟|与底牌同花色/);
    if (!['zh-CN', 'zh-TW'].includes(locale)) expect(text, locale).not.toMatch(/都先跟注/);
  }
});
