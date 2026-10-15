import { test, expect } from '@playwright/test';
import { causalReraiseGame } from '../fixtures/review-spots.js';
import { BOT_DIFFICULTIES } from '../../src/engine/bot-difficulty.js';

test('review shares one collapsed activity section, highlights each perspective and has no step navigation', async ({
  page,
}, info) => {
  const game = causalReraiseGame();
  await page.goto('/');
  await page.waitForFunction(() => window.qa);
  await page.evaluate((g) => window.qa.loadRecordedGame(g), game);
  await page.locator('#review-hand-button').click();
  await expect(page.locator('#review-dialog')).toHaveAttribute('data-analysis-status', 'done', {
    timeout: 30000,
  });
  await expect(page.locator('#review-activity')).not.toHaveAttribute('open', '');
  await expect(
    page.locator('#review-public-actions, .review-step-nav, [data-opponent-nav]'),
  ).toHaveCount(0);
  await expect(page.locator('#review-coach-explanation .review-matchups')).toHaveCount(1);
  await expect(page.locator('#review-coach-explanation [data-matchup-direction]')).toHaveCount(2);
  await expect(page.locator('#review-coach-explanation h4')).toHaveText('复盘分析总结');
  await page.locator('#review-timeline [data-review-index="0"]').click();
  await page.locator('#review-activity summary').click();
  await expect(page.locator('#review-activity .review-activity-current')).toHaveCount(1);
  await expect(page.locator('#review-activity .review-activity-emphasis')).toHaveCount(
    game.decisions.length,
  );
  expect(
    await page
      .locator('#review-activity .review-activity-current')
      .evaluate((el) => Number(getComputedStyle(el).fontWeight)),
  ).toBeGreaterThanOrEqual(700);
  const heroLogs = await page.locator('#review-activity-list').innerText();
  await page.locator('#review-opponents-tab').click();
  await expect(page.locator('#review-activity')).toHaveAttribute('open', '');
  await expect(page.locator('#review-activity .review-activity-current')).toContainText('Mia');
  await expect(page.locator('#review-opponent-detail')).toContainText('推断');
  expect(await page.locator('#review-activity-list').innerText()).toBe(heroLogs);
  for (const text of await page
    .locator('#review-activity .review-activity-emphasis')
    .allTextContents())
    expect(text).toContain('Mia');
  await page.locator('#review-dialog .icon-button.close-dialog').click();
  await page.locator('#review-hand-button').click();
  await expect(page.locator('#review-activity')).not.toHaveAttribute('open', '');
  await info.attach('review-layout', { body: await page.screenshot(), contentType: 'image/png' });
});

test('difficulty settings describe the growing strategy set and emotion boundaries in all locales', async ({
  page,
}) => {
  await page.goto('/');
  await page.waitForFunction(() => window.qa);
  await page.locator('#opponents-button').click();
  for (const difficulty of ['easy', 'normal', 'hard']) {
    await page
      .locator('.difficulty-option')
      .filter({ has: page.locator(`input[value="${difficulty}"]`) })
      .click();
    await expect(page.locator('#difficulty-description')).toHaveText(
      BOT_DIFFICULTIES[difficulty].description,
    );
  }
  await expect(page.locator('.emotion-module')).toContainText('不增加策略能力');
  for (const locale of ['en', 'zh-TW', 'ja', 'ko', 'es', 'it', 'pt', 'de', 'fr', 'ru']) {
    await page.locator('#language-select').selectOption(locale);
    await expect(page.locator('#difficulty-description')).not.toBeEmpty();
    if (!['ja', 'zh-TW'].includes(locale)) {
      await expect(page.locator('#difficulty-description')).not.toContainText(/\p{Script=Han}/u);
      await expect(page.locator('.emotion-module .setting-description')).not.toContainText(
        /\p{Script=Han}/u,
      );
    }
  }
});
