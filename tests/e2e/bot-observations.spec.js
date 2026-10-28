import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import {
  coldShoveResponse,
  pendingShoveResponse,
  allInRandom,
  finishAfterResponse,
} from '../fixtures/all-in-decisions.js';
import {
  planBotTurn,
  executeBotTurn,
  advanceStreet,
  act,
  legalActions,
} from '../../src/engine/poker.js';
import { observedSqueeze } from '../fixtures/observed-preflop.js';

test('the actual multiway QQ fold explains the pending all-in responses in rendered review', async ({
  page,
}) => {
  const game = pendingShoveResponse();
  const response = executeBotTurn(
    game,
    planBotTurn(game, allInRandom(1), { timingRandom: allInRandom(2) }),
    { expedited: true },
  );
  expect(response.action).toBe('fold');
  const record = game.botDecisions[0];
  expect(record.trace.view.actionContext.pendingResponseIds).toHaveLength(5);
  expect(record.trace.equity).toBeGreaterThan(record.trace.odds);
  expect(record.trace.equity).toBeLessThan(record.trace.requiredEquity);
  while (game.phase !== 'done') {
    if (game.phase === 'between') advanceStreet(game);
    else act(game, game.actor, legalActions(game).canCheck ? 'check' : 'fold');
  }
  await page.goto('/');
  await page.waitForFunction(() => window.qa);
  await page.evaluate((g) => window.qa.loadRecordedGame(g), game);
  await page.locator('#review-hand-button').click();
  await page.locator('#review-opponents-tab').click();
  const text = page.locator('#review-opponent-detail .review-explanation');
  await expect(text).toContainText('Q♣ Q♠');
  await expect(text).toContainText('后面 5 位尚未回应这次全下的玩家会用强牌跟入');
  await expect(text).toContainText('48.5%');
  await expect(text).not.toContainText(/这次没有用当前起手牌|机器人|模型|建议/);
});

test('an observed wide squeeze produces a real affordable AJ defense and actor-centered review', async ({
  page,
}) => {
  const game = observedSqueeze();
  const response = executeBotTurn(
    game,
    planBotTurn(game, allInRandom(73), { timingRandom: allInRandom(2) }),
    { expedited: true },
  );
  expect(response.action).not.toBe('fold');
  expect(game.botDecisions[0].trace.observedDefense.hands).toBe(32);
  while (game.phase !== 'done') {
    if (game.phase === 'between') advanceStreet(game);
    else act(game, game.actor, legalActions(game).canCheck ? 'check' : 'fold');
  }
  await page.goto('/');
  await page.waitForFunction(() => window.qa);
  await page.evaluate((g) => window.qa.loadRecordedGame(g), game);
  await page.locator('#review-hand-button').click();
  await page.locator('#review-opponents-tab').click();
  const text = page.locator('#review-opponent-detail .review-explanation');
  await expect(text).toContainText('A♠ J♣');
  await expect(text).toContainText(/此前 32 手中 32 手翻前大额加注/);
  await expect(text).toContainText('保留了更多非顶级起手牌');
  await expect(text).not.toContainText(/9♦ 8♣|机器人|EV|模型|抽样|建议/);
});

test('a real response with constructed past public observations renders its causal explanation and preserves it on reopen', async ({
  page,
}, info) => {
  const game = coldShoveResponse('As Kd');
  game.difficulty = 'hard';
  // Deliberately constructed past public actions, not 32 additional natural hands.
  game.players[0].publicReads = Array.from({ length: 32 }, () => ({
    hands: 1,
    voluntaryHands: 1,
    raisingHands: 1,
    largeRaiseHands: 1,
    postActions: 4,
    postRaises: 4,
  }));
  const response = executeBotTurn(
    game,
    planBotTurn(game, allInRandom(73), { timingRandom: allInRandom(2) }),
    { expedited: true },
  );
  expect(response.action).toBe('call');
  if (game.phase === 'playing') finishAfterResponse(game, { action: 'fold' });
  else while (game.phase !== 'done') advanceStreet(game);
  await page.goto('/');
  await page.waitForFunction(() => window.qa);
  await page.evaluate((g) => window.qa.loadRecordedGame(g), game);
  const show = async () => {
    await page.locator('#review-hand-button').click();
    await page.locator('#review-opponents-tab').click();
    const text = page.locator('#review-opponent-detail .review-explanation');
    await expect(text).toContainText(/Mia.*此前 32 手中 32 手翻前大额加注/);
    await expect(text).toContainText('保留了更多非顶级起手牌');
    await expect(text).toContainText('A♠ K♦');
    await expect(text).not.toContainText(/9♦ 8♣|机器人|EV|模型|抽样|建议/);
    return text.innerText();
  };
  const initial = await show();
  await page.locator('#review-dialog .close-dialog').first().click();
  expect(await show()).toBe(initial);
  await page.locator('#review-opponent-detail .review-explanation').scrollIntoViewIfNeeded();
  const folder = path.join(info.project.outputDir, 'observed-defense');
  await mkdir(folder, { recursive: true });
  const file = path.join(folder, `${info.project.name}.png`);
  await page.screenshot({ path: file });
  await info.attach('observed-defense', { path: file, contentType: 'image/png' });
});
