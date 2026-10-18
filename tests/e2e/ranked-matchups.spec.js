import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { heroValueGame } from '../fixtures/review-spots.js';
import { decisionContext } from '../../src/review/context.js';
import { handMatchups } from '../../src/review/matchups.js';
import {
  bottomPairReview,
  topPairCheckReview,
  aceFourPreflopReview,
} from '../fixtures/bottom-pair-review.js';

test('consumer preflop review has one possible-hand group with causal ranges and a separate hand description', async ({
  page,
}) => {
  const game = heroValueGame('overpair');
  game.decisions = [aceFourPreflopReview()];
  await page.goto('/');
  await page.waitForFunction(() => window.qa);
  await page.evaluate((g) => window.qa.loadRecordedGame(g), game);
  await page.locator('#review-hand-button').click();
  await expect(page.locator('#review-dialog')).toHaveAttribute('data-analysis-status', 'done', {
    timeout: 30000,
  });
  const panel = page.locator('#review-coach-explanation');
  await expect(panel.locator('[data-matchup-direction]')).toHaveCount(1);
  await expect(panel.locator('[data-matchup-direction="possible"]')).toContainText('对手可能牌组');
  await expect(panel).toContainText('Luna在 UTG+1 位开池到 4K');
  await expect(panel).toContainText('Jade在 LJ 位跟住了这笔加注');
  await expect(panel).not.toContainText(/结构上较|不代表获胜概率|依据当时记录|旧记录/);
  const below = await panel
    .locator('.review-matchups')
    .evaluate(
      (el) =>
        el.querySelector('.review-matchup-hand').getBoundingClientRect().top >=
        el.querySelector('p').getBoundingClientRect().bottom,
    );
  expect(below).toBe(true);
  for (const locale of ['en', 'ja', 'ko', 'zh-CN']) {
    await page.locator('#language-select').evaluate((el, value) => {
      el.value = value;
      el.dispatchEvent(new Event('change'));
    }, locale);
    if (locale === 'en' || locale === 'ko')
      await expect(panel).not.toContainText(/\p{Script=Han}/u);
  }
});

test('reported bottom pair emphasizes stronger families and combo draws; top-pair checks explain value and risk', async ({
  page,
}, info) => {
  const game = heroValueGame('overpair');
  game.hand = 29;
  game.decisions = [bottomPairReview()];
  game.botDecisions = [topPairCheckReview()];
  await page.goto('/');
  await page.waitForFunction(() => window.qa);
  await page.evaluate((g) => window.qa.loadRecordedGame(g), game);
  await page.locator('#review-hand-button').click();
  await expect(page.locator('#review-dialog')).toHaveAttribute('data-analysis-status', 'done', {
    timeout: 30000,
  });
  const own = page.locator('#review-coach-explanation');
  await expect(own.locator('[data-matchup-direction="ahead"] .review-matchup-example')).toHaveCount(
    1,
  );
  await expect(
    own.locator('[data-matchup-direction="behind"] .review-matchup-example'),
  ).toHaveCount(4);
  await expect(own).toContainText('同花听牌 + 两头顺听牌');
  await expect(own.locator('[data-matchup-direction="behind"]')).toContainText('A♠ J♥');
  await own.locator('.review-matchups').scrollIntoViewIfNeeded();
  await mkdir('.artifacts/reported-bottom-pair', { recursive: true });
  await page.screenshot({ path: `.artifacts/reported-bottom-pair/${info.project.name}-hero.png` });
  await info.attach('reported-bottom-pair', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
  await page.locator('#review-opponents-tab').click();
  const opponent = page.locator('#review-opponent-detail');
  await expect(opponent).toContainText('顶对 J，A 踢脚');
  await expect(opponent).toContainText('过牌也可能是在等后位先下注');
  await expect(opponent).toContainText('免费看下一张');
  await expect(opponent).toContainText('后位仍可下注');
  for (const locale of ['en', 'ja', 'ko', 'zh-CN']) {
    await page.locator('#language-select').evaluate((select, value) => {
      select.value = value;
      select.dispatchEvent(new Event('change'));
    }, locale);
    if (locale === 'en' || locale === 'ko')
      await expect(opponent).not.toContainText(/\p{Script=Han}/u);
  }
  await info.attach('reported-top-pair-check', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
  await page.screenshot({
    path: `.artifacts/reported-bottom-pair/${info.project.name}-opponent.png`,
  });
});

test('review renders up to three ahead and four behind public-range examples without numeric probabilities', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const game = heroValueGame('overpair');
  const snapshot = game.decisions.find((decision) => decision.street === 1);
  const matchups = handMatchups(snapshot, decisionContext(snapshot));
  expect(matchups.ahead).toHaveLength(3);
  expect(matchups.behind.length).toBeGreaterThan(0);
  expect(matchups.behind.length).toBeLessThanOrEqual(4);
  expect(matchups.behind.length).not.toBe(matchups.ahead.length);
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
    await expect(examples).toHaveCount(matchups[direction].length);
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
    if (locale === 'zh-CN') await expect(comparison).toContainText('牌力与牌面');
    else await expect(explanation).not.toContainText('牌力与牌面');
    if (locale === 'en') await expect(comparison).not.toContainText(/\p{Script=Han}/u);
    for (const direction of ['ahead', 'behind']) {
      const examples = comparison.locator(
        `[data-matchup-direction="${direction}"] .review-matchup-example`,
      );
      await expect(examples).toHaveCount(matchups[direction].length);
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
