import { test, expect } from '@playwright/test';
import { heroValueGame } from '../fixtures/review-spots.js';
import {
  reportedKeyInfoCall,
  reportedGutshotCall,
  turnStraightCallRecord,
} from '../fixtures/review-summary.js';

function recordedExamples() {
  const game = heroValueGame('overpair');
  const call = reportedKeyInfoCall();
  const fold = { ...structuredClone(call), action: 'fold', amount: 0 };
  const check = { ...structuredClone(call), action: 'check', amount: 0 };
  Object.assign(check.legal, { canCheck: true, callAmount: 0, toCall: 0 });
  const raise = { ...structuredClone(call), action: 'raise', amount: 400000 };
  const shove = { ...structuredClone(call), action: 'raise', amount: 2710000 };
  const allinCall = structuredClone(call);
  allinCall.stack = allinCall.players[0].stack = 140000;
  allinCall.legal.maxRaiseTo = 200000;
  game.decisions = [call, fold, check, raise, shove, allinCall, reportedGutshotCall()];
  const opponent = turnStraightCallRecord();
  opponent.trace.reason = 'stack-pressure';
  game.botDecisions = [opponent];
  return game;
}

test('review prices, actor references and draw verdicts stay coherent in the existing layout', async ({
  page,
}, info) => {
  await page.goto('/');
  await page.waitForFunction(() => window.qa);
  await page.evaluate((game) => window.qa.loadRecordedGame(game), recordedExamples());
  await page.locator('#review-hand-button').click();
  await expect(page.locator('#review-dialog')).toHaveAttribute('data-analysis-status', 'done', {
    timeout: 30000,
  });
  const evidence = page.locator('#review-evidence');
  const summary = page.locator('#review-coach-explanation');
  const select = (i) => page.locator(`[data-review-index="${i}"]`).click();
  await select(0);
  await expect(evidence.locator('li')).toHaveCount(6);
  await expect(evidence).toContainText('跟注前底池 460K，底池赔率约 3.29:1');
  await expect(evidence).toContainText('需要至少 23.3% 的胜率，风险和收益才能持平。');
  await expect(summary).toContainText(/你若再加注.*你若只跟注/);
  await expect(summary).toContainText(/坚果同花听牌.*击中 A.*较弱 Ax/);
  await expect(summary).not.toContainText('；');
  await evidence.scrollIntoViewIfNeeded();
  await info.attach('call-key-information', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
  for (const [i, expected] of [
    [1, /弃牌不再投入.*若跟注/],
    [2, /过牌无需投入/],
    [3, /加注拿出 340K/],
    [4, /全下拿出 2.65M/],
    [5, /跟注全下拿出 140K/],
  ]) {
    await select(i);
    await expect(evidence).toContainText(expected);
    await expect(evidence).not.toContainText('；');
  }
  await select(6);
  await expect(page.locator('#review-selected-status')).toHaveText('需要比较');
  await expect(summary).toContainText('这手需要比较跟注与弃牌');
  await expect(summary).not.toContainText(/这手建议跟注|；/);
  await summary.scrollIntoViewIfNeeded();
  await info.attach('gutshot-comparison', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
  await page.locator('#review-opponents-tab').click();
  const bot = page.locator('#review-opponent-detail .review-explanation');
  await expect(bot).toContainText('他选择保住后手');
  const paragraphs = await bot.locator('.review-analysis-heading ~ p').allTextContents();
  expect(paragraphs.join('').match(/Kai/g)).toHaveLength(1);
  await expect(bot).not.toContainText('；');
  expect(
    await page.locator('#review-dialog').evaluate((el) => el.scrollWidth - el.clientWidth),
  ).toBeLessThanOrEqual(1);
});

test('new recommendation clauses and key information switch across all locales', async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.goto('/');
  await page.waitForFunction(() => window.qa);
  await page.evaluate((game) => window.qa.loadRecordedGame(game), recordedExamples());
  await page.locator('#review-hand-button').click();
  await expect(page.locator('#review-dialog')).toHaveAttribute('data-analysis-status', 'done', {
    timeout: 30000,
  });
  for (const locale of ['en', 'zh-TW', 'ja', 'ko', 'es', 'it', 'pt', 'de', 'fr', 'ru', 'zh-CN']) {
    await page.locator('#language-select').evaluate((el, locale) => {
      el.value = locale;
      el.dispatchEvent(new Event('change'));
    }, locale);
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    for (const i of [0, 6]) {
      await page.locator(`[data-review-index="${i}"]`).click();
      const text = await page
        .locator('#review-coach-explanation, #review-evidence')
        .allTextContents();
      expect(text.join('')).not.toMatch(/\{\d+\}/);
      if (!['zh-CN', 'zh-TW', 'ja'].includes(locale))
        expect(text.join('')).not.toMatch(/\p{Script=Han}/u);
      await expect(page.locator('#review-evidence')).toContainText(i === 0 ? '140K' : '520K');
    }
  }
});
