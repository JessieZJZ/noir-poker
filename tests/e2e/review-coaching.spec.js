import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
test('draw review connects the full public line and keeps only the requested modules', async ({
  page,
}, info) => {
  await page.goto('/');
  await page.waitForFunction(() => window.qa);
  await page.evaluate(() => window.qa.reviewDrawLine());
  await page.locator('#review-hand-button').click();
  await expect(page.locator('#review-dialog')).toHaveAttribute('data-analysis-status', 'done', {
    timeout: 20000,
  });
  await expect(page.locator('#review-coach-explanation')).toContainText('两头顺听牌');
  await expect(page.locator('#review-coach-explanation')).toContainText('125');
  await expect(page.locator('#review-coach-explanation')).toContainText('此前在翻牌过牌');
  await expect(page.locator('#review-coach-explanation')).toContainText(/河牌.*诈唬/);
  await expect(page.locator('#review-evidence')).toBeVisible();
  await expect(page.locator('#review-hero-panel')).toContainText('当时的关键信息');
  await expect(
    page.locator(
      '#review-your-action, #review-suggestion, #review-advanced, #review-routes, #review-simulation',
    ),
  ).toHaveCount(0);
  await page.getByText('此前的公开行动', { exact: true }).click();
  await expect(page.locator('#review-public-actions')).toContainText('翻牌，');
  await expect(page.locator('#review-public-actions')).toContainText('转牌，');
  const kept = await page.locator('#review-selected-status').textContent();
  if (kept === '值得保留') await expect(page.locator('#review-practice-focus')).toBeHidden();
  else await expect(page.locator('#review-practice-focus')).toBeVisible();
  expect(
    await page.locator('#review-dialog').evaluate((el) => el.scrollWidth - el.clientWidth),
  ).toBeLessThanOrEqual(1);
  await info.attach('contextual-draw-review', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
});

test('opponent review uses names and hand logic without numeric or developer panels', async ({
  page,
}) => {
  await page.goto('/');
  await page.waitForFunction(() => window.qa);
  await page.evaluate(() => window.qa.reviewLine());
  await page.locator('#review-hand-button').click();
  await page.locator('#review-opponents-tab').click();
  await expect(page.locator('#review-opponent-detail .review-explanation')).not.toBeEmpty();
  await expect(page.locator('.opponent-metrics, .review-method, #review-method')).toHaveCount(0);
  await expect(page.locator('#review-opponent-detail')).not.toContainText(
    /随机范围估计|抽样\s*\d+\s*次|价格门槛|它|EV|模型|模拟器/,
  );
  await expect(
    page.locator(
      '#review-opponent-detail .review-choice, #review-opponent-detail .review-status, #review-opponent-detail details, .opponent-warning',
    ),
  ).toHaveCount(0);
  await expect(page.locator('.review-scope')).toContainText('按当时信息判断');
});

test('reported 52s shove and TT call explain actual cards, size and facing action', async ({
  page,
}, info) => {
  await page.goto('/');
  await page.waitForFunction(() => window.qa);
  await page.evaluate(() => window.qa.reviewReportedShove());
  await page.locator('#review-hand-button').click();
  await expect(page.locator('#review-dialog')).toHaveAttribute('data-analysis-status', 'done', {
    timeout: 20000,
  });
  const hero = page.locator('#review-coach-explanation');
  await expect(hero).toContainText(/100\s*BB/);
  await expect(hero).toContainText('5,000');
  await expect(hero).toContainText('225');
  await expect(hero).toContainText('UTG');
  await expect(hero).toContainText('150');
  await expect(hero).not.toContainText(
    /一对|非坚果听牌|先前跟注|单看一张高牌|依据仍受对手继续范围限制/,
  );
  await expect(page.locator('#review-evidence')).not.toContainText(/40(?:\.0)?%/);
  await expect(page.locator('#review-selected-status')).toHaveText('弃牌');
  await expect(page.locator('#review-practice-focus')).toBeVisible();
  await info.attach('reported-52s-shove', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });

  await page.locator('#review-opponents-tab').click();
  await page.locator('[data-opponent-index="1"]').click();
  const opponent = page.locator('#review-opponent-detail');
  await expect(opponent).toContainText('4,650');
  await expect(opponent).toContainText('Kai');
  await expect(opponent.locator('.review-explanation')).toContainText(/大对|JJ|QQ|KK|AA/);
  await expect(opponent.locator('.review-explanation')).toContainText(/两高张|AK|AQ/);
  await expect(opponent).not.toContainText(
    /随机范围估计|抽样\s*\d+\s*次|价格门槛|71\.7%|先前跟注不能替|它|EV|模型|模拟器/,
  );
  await expect(opponent.locator('.opponent-metrics')).toHaveCount(0);
  expect(
    await page.locator('#review-dialog').evaluate((el) => el.scrollWidth - el.clientWidth),
  ).toBeLessThanOrEqual(1);
  await info.attach('reported-TT-call', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
});

test('all review locales switch immediately and preserve the recorded hand', async ({ page }) => {
  test.setTimeout(60000);
  await page.goto('/');
  await page.waitForFunction(() => window.qa);
  await page.evaluate(() => window.qa.reviewDrawLine());
  const before = await page.evaluate(() => window.qa.snapshot());
  for (const locale of ['zh-CN', 'en', 'zh-TW', 'ja', 'ko', 'es', 'it', 'pt', 'de', 'fr', 'ru']) {
    await page.locator('#opponents-button').click();
    await page.locator('#language-select').selectOption(locale);
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await page.locator('#opponents-dialog .close-dialog').click();
    await page.locator('#review-hand-button').click();
    await expect(page.locator('#review-dialog')).toHaveAttribute('data-analysis-status', 'done', {
      timeout: 20000,
    });
    const texts = await page
      .locator('#review-coach-explanation, #review-evidence')
      .allTextContents();
    expect(texts.join('')).toContain('8');
    if (!['zh-CN', 'zh-TW', 'ja'].includes(locale))
      expect(texts.join('')).not.toMatch(/\p{Script=Han}/u);
    await page.locator('#review-opponents-tab').click();
    const bot = await page.locator('#review-opponent-detail .review-explanation').allTextContents();
    if (!['zh-CN', 'zh-TW', 'ja'].includes(locale))
      expect(bot.join('')).not.toMatch(/\p{Script=Han}/u);
    await page.locator('#review-dialog .close-dialog').first().click();
  }
  expect(await page.evaluate(() => window.qa.snapshot())).toEqual(before);
});

test('executed traps, trash raises, donks and 2–7 bluffs explain their actual motives', async ({
  page,
}, info) => {
  await page.goto('/');
  await page.waitForFunction(() => window.qa);
  const records = await page.evaluate(() => window.qa.reviewDeception());
  await page.locator('#review-hand-button').click();
  await page.locator('#review-opponents-tab').click();
  const expected = [
    /(?=.*埋牌)(?=.*(?:平跟|只补))/,
    /(?=.*埋牌)(?=.*过牌)/,
    /(?=.*埋牌)(?=.*只跟)/,
    /脏牌开池/,
    /脏牌再加注/,
    /donk.*先领打/,
    /donk.*付费/,
    /2–7.*(?:开池|偷盲)/,
    /(?=.*2–7)(?=.*本轮已经过牌)(?=.*诈唬)/,
  ];
  expect(records).toHaveLength(expected.length);
  for (let index = 0; index < expected.length; index++) {
    await page.locator(`[data-opponent-index="${index}"]`).click();
    await expect(page.locator('#review-opponent-detail .review-explanation')).toContainText(
      expected[index],
    );
    await expect(page.locator('.opponent-metrics')).toHaveCount(0);
    expect(
      await page.locator('#review-dialog').evaluate((el) => el.scrollWidth - el.clientWidth),
    ).toBeLessThanOrEqual(1);
    if ([1, 4, 5, 8].includes(index))
      await info.attach(records[index].reason + '-' + index, {
        body: await page.screenshot(),
        contentType: 'image/png',
      });
  }
  await expect(page.locator('#review-opponent-detail')).not.toContainText(/奖励|它|EV|抽样|模拟器/);
});

test('deceptive motives survive live switching of all locales without changing the hand', async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.goto('/');
  await page.waitForFunction(() => window.qa);
  await page.evaluate(() => window.qa.reviewDeception());
  const before = await page.evaluate(() => window.qa.snapshot());
  for (const locale of ['zh-CN', 'en', 'zh-TW', 'ja', 'ko', 'es', 'it', 'pt', 'de', 'fr', 'ru']) {
    await page.locator('#opponents-button').click();
    await page.locator('#language-select').selectOption(locale);
    await page.locator('#opponents-dialog .close-dialog').click();
    await page.locator('#review-hand-button').click();
    await page.locator('#review-opponents-tab').click();
    for (const index of [4, 5, 8]) {
      await page.locator(`[data-opponent-index="${index}"]`).click();
      const text = await page.locator('#review-opponent-detail .review-explanation').textContent();
      expect(text).not.toMatch(/\{\d+\}/);
      if (!['zh-CN', 'zh-TW', 'ja'].includes(locale)) expect(text).not.toMatch(/\p{Script=Han}/u);
      if (index === 5) expect(text.toLowerCase()).toContain('donk');
      if (index === 8) expect(text).toContain('2–7');
    }
    await page.locator('#review-dialog .close-dialog').first().click();
  }
  expect(await page.evaluate(() => window.qa.snapshot())).toEqual(before);
});

test('small three-bet defense keeps its bounded explanation in the simplified opponent panel', async ({
  page,
}) => {
  await page.goto('/');
  await page.waitForFunction(() => window.qa);
  await page.evaluate(() => window.qa.reviewSmallReraise());
  await page.locator('#review-hand-button').click();
  await page.locator('#review-opponents-tab').click();
  await expect(page.locator('#review-opponent-detail .review-explanation')).toContainText(
    '小尺度 3-bet 防守',
  );
  await expect(page.locator('#review-opponent-detail .review-explanation')).toContainText('75');
  await expect(page.locator('.opponent-metrics')).toHaveCount(0);
  await expect(page.locator('#review-opponent-detail .review-explanation')).not.toContainText(
    /它|EV|模型|模拟器|抽样/,
  );
});

test('69o three-bet shows real later public responses separately and Mia AQ four-bet explains the actual action', async ({
  page,
}, info) => {
  await page.goto('/');
  await page.waitForFunction(() => window.qa);
  await page.evaluate(() => window.qa.reviewCausalReraise());
  await page.locator('#review-hand-button').click();
  await expect(page.locator('#review-dialog')).toHaveAttribute('data-analysis-status', 'done', {
    timeout: 30000,
  });
  await page.locator('[data-review-index="0"]').click();
  const hero = page.locator('#review-coach-explanation');
  await expect(hero).toContainText('350');
  await expect(hero).toContainText('200');
  await expect(hero).toContainText(/Mia.*1,000/);
  await expect(hero).toContainText(/River.*950/);
  await expect(hero).toContainText(/Luna.*800/);
  await expect(hero.locator('p').filter({ hasText: /Mia.*1,000/ })).toHaveCount(1);
  await expect(hero.locator('p').last()).toContainText(/Luna.*800/);
  await expect(hero).not.toContainText(/A[♦♥♣♠]|Q[♦♥♣♠]|赢家|获胜/);
  await expect(hero).not.toContainText(/EV|模型|模拟器|它|新增投入|有效剩余/);
  await expect(page.locator('#review-evidence')).toContainText('5,000');
  await expect(page.locator('#review-evidence')).toContainText('350');
  await expect(page.locator('#review-evidence')).not.toContainText(/赔率|盈亏平衡|权益.*%/);
  for (const selector of ['#review-timeline', '#review-detail-title', '#review-public-actions'])
    await expect(page.locator(selector)).not.toContainText('·');
  await info.attach('69o-actual-public-responses', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
  await page.locator('#review-opponents-tab').click();
  const opponent = page.locator('#review-opponent-detail');
  await expect(opponent).toContainText('Mia');
  await expect(opponent.locator('.review-explanation')).toContainText('350');
  await expect(opponent.locator('.review-explanation')).toContainText('1,000');
  await expect(opponent.locator('.review-explanation')).toContainText('975');
  await expect(opponent.locator('.review-explanation')).not.toContainText(
    /它|EV|模型|模拟器|抽样|0 人尚|尚(?:可)?行动 0/,
  );
  await expect(page.locator('.opponent-metrics, .review-method, #review-method')).toHaveCount(0);
  await info.attach('Mia-AQ-fourbet-cause', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
});

test('common strong-hand all-ins and preflop flats explain actual value and conditional opposing hands', async ({
  page,
}, info) => {
  test.setTimeout(60000);
  await page.goto('/');
  await page.waitForFunction(() => window.qa);
  for (const [kind, index] of [
    ['set-shove', 1],
    ['aa-flat', 0],
  ]) {
    await page.evaluate((kind) => window.qa.reviewHeroValue(kind), kind);
    await page.locator('#review-hand-button').click();
    await expect(page.locator('#review-dialog')).toHaveAttribute('data-analysis-status', 'done', {
      timeout: 30000,
    });
    await page.locator(`[data-review-index="${index}"]`).click();
    const explanation = page.locator('#review-coach-explanation');
    if (kind === 'set-shove') {
      await expect(explanation).toContainText(/暗三条\s*5/);
      await expect(explanation).toContainText(/全下/);
      await expect(explanation).toContainText(/价值|取值/);
      await expect(explanation).toContainText('1,000');
      await expect(explanation).toContainText(/领先|能赢|压过/);
      await expect(explanation).toContainText(/落后|输给|不如/);
    } else {
      await expect(explanation).toContainText(/埋牌|藏在平跟|隐藏.*强|藏.*强/);
      await expect(explanation).toContainText('150');
      await expect(explanation).toContainText(/领先|能赢|压过/);
    }
    await expect(explanation).not.toContainText(/EV|模型|模拟器|抽样|最终赢家|已摊牌|看到对手底牌/);
    await expect(page.locator('.review-method,.opponent-metrics')).toHaveCount(0);
    const output = path.resolve('.artifacts/causal-review-2026-10-14');
    await mkdir(output, { recursive: true });
    const screenshot = await page.screenshot({
      path: path.join(output, info.project.name + '-' + kind + '.png'),
    });
    await info.attach('hero-' + kind, { body: screenshot, contentType: 'image/png' });
    await page.locator('#review-dialog .close-dialog').first().click();
  }
});
