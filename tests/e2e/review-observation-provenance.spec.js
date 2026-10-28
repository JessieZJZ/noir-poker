import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import {
  newGame,
  startHand,
  act,
  advanceStreet,
  legalActions,
  planBotTurn,
  executeBotTurn,
} from '../../src/engine/poker.js';
import { clarityRandom } from '../fixtures/review-clarity-followup.js';
import { observedSqueeze } from '../fixtures/observed-preflop.js';

function finishedObservedOpen() {
  const game = newGame(5);
  game.difficulty = 'normal';
  game.emotionMode = 'off';
  const saved = Math.random;
  Math.random = clarityRandom(81201);
  try {
    startHand(game);
  } finally {
    Math.random = saved;
  }
  game.players[game.actor].publicReads = [
    {
      hands: 24,
      voluntaryHands: 24,
      raisingHands: 24,
      largeRaiseHands: 16,
      postActions: 33,
      postRaises: 33,
    },
  ];
  act(game, game.actor, 'raise', 4 * game.bigBlind);
  executeBotTurn(game, planBotTurn(game, clarityRandom(73), { timingRandom: () => 0.4 }), {
    expedited: true,
  });
  expect(game.botDecisions[0].trace.view.publicEquity.rangeInputsVersion).toBe(
    'complete-public-weight-inputs-v1',
  );
  expect(game.botDecisions[0].trace.view.allIn).toBeUndefined();
  expect(game.botDecisions[0].trace.view.publicEquity.exact).not.toBe(true);
  while (game.phase !== 'done') {
    if (game.phase === 'between') advanceStreet(game);
    else act(game, game.actor, legalActions(game).canCheck ? 'check' : 'fold');
  }
  game.decisions = [];
  return game;
}

test('rendered review preserves a supported new observation but does not reuse it for a legacy sampled record', async ({
  page,
}, info) => {
  const current = finishedObservedOpen();
  const legacy = structuredClone(current);
  delete legacy.botDecisions[0].trace.view.publicEquity.rangeInputsVersion;
  delete legacy.botDecisions[0].trace.observationSizing;
  const output = '.artifacts/candidate06-release-review-provenance-web';
  await mkdir(output, { recursive: true });
  for (const [kind, game] of [
    ['current', current],
    ['legacy', legacy],
  ]) {
    await page.goto('/');
    await page.waitForFunction(() => window.qa);
    await page.evaluate((g) => window.qa.loadRecordedGame(g), game);
    await page.locator('#review-hand-button').click();
    await page.locator('#review-opponents-tab').click();
    const text = page.locator('#review-opponent-detail .review-explanation');
    if (kind === 'current') await expect(text).toContainText('此前 24 手中 24 手翻前加注');
    else await expect(text).not.toContainText('此前 24 手中 24 手翻前加注');
    await expect(text).toContainText(game.botDecisions[0].name);
    await expect(text).toContainText('选择');
    await expect(text).not.toContainText(/机器人|建议|完整范围输入|rangeInputsVersion/);
    await page.screenshot({ path: `${output}/${info.project.name}-${kind}.png` });
  }
});

test('rendered new and legacy reviews retain their own sizing basis across persisted cache reuse', async ({
  page,
}, info) => {
  const current = observedSqueeze();
  executeBotTurn(current, planBotTurn(current, clarityRandom(73), { timingRandom: () => 0.4 }), {
    expedited: true,
  });
  while (current.phase !== 'done') {
    if (current.phase === 'between') advanceStreet(current);
    else act(current, current.actor, legalActions(current).canCheck ? 'check' : 'fold');
  }
  current.decisions = [];
  expect(current.botDecisions).toHaveLength(1);
  expect(current.botDecisions[0].trace.observationSizing).toEqual({
    version: 1,
    largePreflopBB: 8,
  });
  const legacy = structuredClone(current);
  delete legacy.botDecisions[0].trace.observationSizing;
  expect(legacy.botDecisions[0].trace.view).toEqual(current.botDecisions[0].trace.view);
  const output = '.artifacts/candidate06-release-review-provenance-web';
  await mkdir(output, { recursive: true });
  for (const [kind, game] of [
    ['current-sizing', current],
    ['legacy-sizing', legacy],
    ['current-sizing-reopen', current],
  ]) {
    await page.goto('/');
    await page.waitForFunction(() => window.qa);
    await page.evaluate((g) => window.qa.loadRecordedGame(g), game);
    await page.locator('#review-hand-button').click();
    await page.locator('#review-opponents-tab').click();
    const text = page.locator('#review-opponent-detail .review-explanation');
    if (kind === 'legacy-sizing') {
      await expect(text).toContainText('此前 32 手中 32 手翻前加注的记录');
      await expect(text).not.toContainText('此前 32 手中 32 手翻前大额加注');
    } else await expect(text).toContainText('此前 32 手中 32 手翻前大额加注');
    await expect(text).toContainText(game.botDecisions[0].name);
    await expect(text).toContainText('选择');
    await expect(text).not.toContainText(/机器人|建议|observationSizing|rangeInputsVersion/);
    await page.screenshot({ path: `${output}/${info.project.name}-${kind}.png` });
  }
});
