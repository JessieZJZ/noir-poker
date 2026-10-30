import { test, expect } from '@playwright/test';
import { heroValueGame } from '../fixtures/review-spots.js';
import { reviewFlexibilitySnapshot } from '../fixtures/review-flexibility.js';
import {
  reportedKeyInfoCall,
  reportedGutshotCall,
  reportedLowConnectorCall,
  reportedFivesAllIn,
  turnStraightCallRecord,
} from '../fixtures/review-summary.js';

test('deep button suited connectors receive a concrete call and conditional squeeze plan', async ({
  page,
}) => {
  const game = heroValueGame('overpair');
  game.decisions = [reviewFlexibilitySnapshot()];
  await page.goto('/');
  await page.waitForFunction(() => window.qa);
  await page.evaluate((record) => window.qa.loadRecordedGame(record), game);
  await page.locator('#review-hand-button').click();
  await expect(page.locator('#review-dialog')).toHaveAttribute('data-analysis-status', 'done', {
    timeout: 120000,
  });
  const detail = page.locator('#review-detail');
  await expect(page.locator('#review-selected-status')).toHaveText('建议跟注 500');
  await expect(page.locator('#review-timeline .review-status')).toHaveText(['建议跟注 500']);
  await expect(detail).toContainText('先比较跟注 500 与有条件的3-bet 加注至 2K');
  await expect(detail).toContainText('若开池者范围较宽、平跟者有足够弃牌空间');
  await expect(detail).toContainText('3-bet 加注至 2K');
  await expect(detail).toContainText('不代表天然拥有范围优势');
  await expect(detail).toContainText('免费过牌则保留机会');
  await expect(page.locator('#review-timeline .review-status')).not.toContainText('值得保留');
});

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
  Object.assign(allinCall.legal, {
    canRaise: false,
    minRaiseTo: 200000,
    maxRaiseTo: 200000,
    isShortAllin: true,
  });
  const paired = reportedGutshotCall();
  paired.hole = reportedKeyInfoCall('Ks Ad').hole;
  paired.board = [
    { rank: 6, suit: 3, key: '3-6' },
    { rank: 5, suit: 1, key: '1-5' },
    { rank: 3, suit: 0, key: '0-3' },
    { rank: 5, suit: 3, key: '3-5' },
    { rank: 13, suit: 1, key: '1-13' },
  ];
  paired.street = 3;
  game.decisions = [
    call,
    fold,
    check,
    raise,
    shove,
    allinCall,
    reportedGutshotCall(),
    reportedLowConnectorCall(),
    reportedFivesAllIn(),
    paired,
  ];
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
    timeout: 120000,
  });
  const evidence = page.locator('#review-evidence');
  const summary = page.locator('#review-coach-explanation');
  const select = (i) => page.locator(`[data-review-index="${i}"]`).click();
  await select(0);
  await expect(evidence.locator('li')).toHaveCount(6);
  await expect(evidence).toContainText('跟注前底池 460K，底池赔率约 3.29:1');
  await expect(evidence).toContainText('需要至少 23.3% 的胜率，风险和收益才能持平。');
  await expect(summary).toContainText('你若再加注，需要同时考虑加注范围和跟注入池的范围');
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
  // The bettor's full public line (check flop, bet turn) keeps bluffs in range:
  // both range estimates clear the 30.1% price, so the gutshot call is kept.
  await select(6);
  await expect(page.locator('#review-selected-status')).toHaveText('建议跟注 520K');
  await expect(page.locator('#review-selected-status')).toHaveClass(/sound/);
  await expect(summary).toContainText(/卡顺听牌.*4 张直接成牌候选.*约 9%.*不等于你的全部获胜机会/);
  await expect(summary).toContainText('这次跟注后已没有后续下注');
  await expect(summary).not.toContainText(/这手建议跟注|；/);
  await summary.scrollIntoViewIfNeeded();
  await info.attach('gutshot-comparison', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
  await select(7);
  await expect(evidence).toContainText('4 / 5 同花连接牌');
  await expect(summary).toContainText(
    /同花连接牌.*37.0%.*点数仍偏低.*更高同花.*若出现加注或者再加注.*建议弃牌/,
  );
  await expect(summary).not.toContainText(/被强 A.*压制|[。；，]{2}/);
  await summary.scrollIntoViewIfNeeded();
  await info.attach('low-connector-fold-rationale', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
  await select(8);
  await expect(page.locator('#review-selected-status')).toHaveText('建议全下跟注 1.62M');
  await expect(summary).toContainText(/全下跟注.*27.0%.*看完剩余公共牌.*足够较弱牌.*比较弃牌/);
  await expect(summary).not.toContainText(/还留.*0|你在翻后有位置|你需要重新决定/);
  const ownParagraph = summary.locator('p').last();
  expect((await ownParagraph.textContent()).match(/1.62M/g)).toHaveLength(1);
  await info.attach('all-in-causal-rationale', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
  await select(9);
  const board = summary.locator('.review-board-summary');
  const strength = summary.locator('.review-matchup-hand');
  await expect(board).toContainText('公共牌有对子');
  await expect(strength).toContainText('底牌击中顶对 K，与公共牌的一对 5 共同组成两对，A 作为踢脚');
  expect(
    await board.evaluate(
      (a) =>
        a.compareDocumentPosition(a.parentElement.querySelector('.review-matchup-hand')) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ),
  ).toBeTruthy();
  await page.locator('#review-opponents-tab').click();
  const bot = page.locator('#review-opponent-detail .review-explanation');
  // The opponent tab explains his own draw and price, not player coaching.
  await expect(bot).toContainText('当前主要依靠两头顺听牌改善');
  await expect(bot).toContainText('当前保本门槛为 24.3%');
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
  test.setTimeout(240000);
  await page.goto('/');
  await page.waitForFunction(() => window.qa);
  await page.evaluate((game) => window.qa.loadRecordedGame(game), recordedExamples());
  await page.locator('#review-hand-button').click();
  await expect(page.locator('#review-dialog')).toHaveAttribute('data-analysis-status', 'done', {
    timeout: 120000,
  });
  for (const locale of ['en', 'zh-TW', 'ja', 'ko', 'es', 'it', 'pt', 'de', 'fr', 'ru', 'zh-CN']) {
    await page.locator('#language-select').evaluate((el, locale) => {
      el.value = locale;
      el.dispatchEvent(new Event('change'));
    }, locale);
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    for (const i of [0, 6, 7, 8, 9]) {
      await page.locator(`[data-review-index="${i}"]`).click();
      const text = await page
        .locator(
          '#review-coach-explanation, #review-evidence, #review-selected-status, #review-timeline .review-status',
        )
        .allTextContents();
      expect(text.join('')).not.toMatch(/\{\d+\}/);
      if (locale === 'zh-CN')
        await expect(page.locator('#review-selected-status')).toHaveText(/^建议/);
      if (locale === 'zh-TW')
        await expect(page.locator('#review-selected-status')).toHaveText(/^建議/);
      if (!['zh-CN', 'zh-TW', 'ja'].includes(locale))
        expect(text.join('')).not.toMatch(/\p{Script=Han}/u);
      await expect(page.locator('#review-evidence')).toContainText(
        i === 0 ? '140K' : [6, 9].includes(i) ? '520K' : i === 8 ? '1.62M' : '100K',
      );
    }
  }
});

test('guide glossary is at the end and explains review terms in every locale', async ({
  page,
}, info) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-app-ready', 'true');
  await page.locator('#rules-button').click();
  await page.locator('#guide-menu-item').click();
  const glossary = page.locator('#review-glossary');
  await glossary.scrollIntoViewIfNeeded();
  await expect(glossary).toContainText('底池赔率／保本胜率');
  await expect(glossary).toContainText('全下只会结束自己的下注选择');
  await info.attach('guide-glossary', { body: await page.screenshot(), contentType: 'image/png' });
  await page.locator('#rules-dialog .dialog-header .close-dialog').click();
  for (const locale of ['en', 'zh-TW', 'ja', 'ko', 'es', 'it', 'pt', 'de', 'fr', 'ru']) {
    await page.locator('#language-select').evaluate((el, locale) => {
      el.value = locale;
      el.dispatchEvent(new Event('change'));
    }, locale);
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    const text = await glossary.textContent();
    expect(text).not.toMatch(/\{\d+\}/);
    if (!['zh-TW', 'ja'].includes(locale)) expect(text).not.toMatch(/\p{Script=Han}/u);
  }
});
