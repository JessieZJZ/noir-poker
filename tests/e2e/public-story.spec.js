import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { riverStory } from '../fixtures/story-line-decisions.js';
import { clarityRandom } from '../fixtures/review-clarity-followup.js';
import {
  planBotTurn,
  executeBotTurn,
  advanceStreet,
  act,
  legalActions,
} from '../../src/engine/poker.js';
import { SUPPORTED_LOCALES } from '../../src/i18n/index.js';

function finished(config = {}) {
  const game = riverStory(config);
  executeBotTurn(game, planBotTurn(game, clarityRandom(71), { timingRandom: () => 0.4 }), {
    expedited: true,
  });
  while (game.phase !== 'done')
    if (game.phase === 'between') advanceStreet(game);
    else act(game, game.actor, legalActions(game).canCheck ? 'check' : 'fold');
  game.decisions = [];
  return game;
}
async function open(page, game) {
  await page.goto('/');
  await page.waitForFunction(() => window.qa);
  await page.evaluate((g) => window.qa.loadRecordedGame(g), game);
  await page.locator('#review-hand-button').click();
  await page.locator('#review-opponents-tab').click();
  return page.locator('#review-opponent-detail .review-explanation');
}
test('a real JJ response catches the river bet and its review shows the full public story', async ({
  page,
}, info) => {
  const game = finished();
  expect(game.botDecisions.at(-1).action).toBe('call');
  const body = await open(page, game);
  await expect(body).toContainText(/翻牌\s*过牌.*转牌\s*过牌后加注至 500K.*河牌\s*下注至 1.37M/s);
  await expect(body).toContainText('此前的过牌加注同时保留了强成牌和诈唬的可能');
  await expect(body).toContainText('第三张红桃');
  await expect(body).toContainText('选择跟注');
  await mkdir('.artifacts/story-lines-2026-10-25/web', { recursive: true });
  await body.locator('p').last().scrollIntoViewIfNeeded();
  await page.screenshot({
    path: '.artifacts/story-lines-2026-10-25/web/' + info.project.name + '-jj-catch.png',
  });
});
test('the same real JJ still folds when the river completes the heart draw', async ({ page }) => {
  const game = finished({ river: '2h' });
  expect(game.botDecisions.at(-1).action).toBe('fold');
  const body = await open(page, game);
  await expect(body).toContainText('选择弃牌');
  await expect(body).toContainText('河牌补出第三张红桃');
  await expect(body).not.toContainText('河牌没有补出第三张红桃');
});
for (const [group, locales] of [
  SUPPORTED_LOCALES.slice(0, 6),
  SUPPORTED_LOCALES.slice(6),
].entries())
  test('public story switches actual rendered locale group ' + group, async ({ page }) => {
    const game = finished();
    await page.goto('/');
    for (const locale of locales) {
      await page.evaluate((l) => localStorage.setItem('noir-locale', l), locale);
      const body = await open(page, game);
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      const text = await body.innerText();
      for (const amount of ['500K', '1.37M']) expect(text).toContain(amount);
      if (!['zh-CN', 'zh-TW', 'ja'].includes(locale))
        expect(text, locale).not.toMatch(/\p{Script=Han}/u);
      if (locale !== 'zh-CN')
        expect(text, locale).not.toMatch(/此前的公开行动|过牌后加注至|第三张红桃/);
    }
  });
