import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { reviewedAllInGame } from '../fixtures/all-in-decisions.js';
import { allInRandom, finishAfterResponse } from '../fixtures/all-in-decisions.js';
import { buttonIsolation, lateColdShove } from '../fixtures/preflop-pressure.js';
import { planBotTurn, executeBotTurn } from '../../src/engine/poker.js';

test('nine-seat strong preflop defense executes and replays without exposing other private cards', async ({
  page,
}) => {
  await page.goto('/');
  await page.waitForFunction(() => window.qa);
  for (const [game, hand] of [
    [lateColdShove(), 'A♠ K♦'],
    [buttonIsolation('As Qc', 16.5), 'A♠ Q♣'],
  ]) {
    const plan = planBotTurn(game, allInRandom(17), { timingRandom: allInRandom(2) });
    const response = executeBotTurn(game, plan, { expedited: true });
    expect(response).toBeTruthy();
    const record = game.botDecisions.at(-1);
    expect(record.action).not.toBe('fold');
    // Finish only the remaining actors; the recorded defense has already run.
    const pending = game.phase === 'playing' ? { action: 'fold' } : null;
    if (pending) finishAfterResponse(game, pending);
    else {
      // An all-in call can leave the normal automatic runout between streets.
      const { advanceStreet } = await import('../../src/engine/poker.js');
      while (game.phase !== 'done') advanceStreet(game);
    }
    await page.evaluate((snapshot) => window.qa.loadRecordedGame(snapshot), game);
    await page.locator('#review-hand-button').click();
    await page.locator('#review-opponents-tab').click();
    const detail = page.locator('#review-opponent-detail .review-explanation');
    await expect(detail).toContainText(hand);
    await expect(detail).toContainText(/跟注|加注/);
    await expect(detail).not.toContainText(/抽样|价格门槛|EV|模拟器|模型/);
    await page
      .locator('#review-dialog')
      .getByRole('button', { name: '关闭复盘', exact: true })
      .click();
  }
});

test('real all-in bot calls and tight 4-bet folds replay the actual public action and motive', async ({
  page,
}, info) => {
  await page.goto('/');
  await page.waitForFunction(() => window.qa);
  for (const [kind, name, action, cost, wealth, hole] of [
    ['flop-qq', 'Mia', 'call', '4.95K', 25000, 'Q♠ Q♦'],
    ['multi-qq', 'River', 'fold', '4.85K', 30000, 'Q♠ Q♦'],
    ['made-redraw', 'Mia', 'call', '4.95K', 25000, '7♥ 7♦'],
    ['draw-fold', 'Mia', 'fold', '4.95K', 25000, 'Q♠ 7♠'],
  ]) {
    const game = reviewedAllInGame(kind);
    expect(game.botDecisions[0].action).toBe(action);
    expect(game.players.reduce((sum, p) => sum + p.stack, 0)).toBe(wealth);
    await page.evaluate((snapshot) => window.qa.loadRecordedGame(snapshot), game);
    await page.locator('#review-hand-button').click();
    await page.locator('#review-opponents-tab').click();
    const opponent = page.locator('#review-opponent-detail');
    await expect(opponent.locator('.review-explanation')).toContainText(name);
    await expect(opponent.locator('.review-explanation')).toContainText(cost);
    await expect(opponent.locator('.review-explanation')).toContainText('全下');
    await expect(opponent.locator('.review-explanation')).toContainText(hole);
    await expect(opponent).not.toContainText(/随机范围|抽样|价格门槛|它|EV|模拟器|模型/);
    await expect(page.locator('.opponent-metrics, .review-method')).toHaveCount(0);
    if (kind === 'flop-qq') {
      await expect(opponent.locator('.review-explanation')).toContainText(/超对 Q/);
      await expect(opponent.locator('.review-explanation')).toContainText('10.15K');
      // After an all-in call the bot only sees the rest of the board.
      await expect(opponent.locator('.review-explanation')).toContainText('之后不再参与下注决策');
      await expect(opponent.locator('.review-explanation')).toContainText('无需再支付筹码');
      await expect(opponent.locator('.review-explanation')).not.toContainText('9♦ 8♣');
    } else if (kind === 'multi-qq') {
      await expect(opponent.locator('.review-explanation')).toContainText('弃牌');
      await expect(opponent.locator('.review-explanation')).toContainText(/4-bet/);
    } else if (kind === 'made-redraw') {
      await expect(opponent.locator('.review-explanation')).toContainText('暗三条 7');
      await expect(opponent.locator('.review-explanation')).toContainText(
        /(?:另有|另外还有)同花听牌/,
      );
      await expect(opponent.locator('.review-explanation')).not.toContainText(
        /卡顺听牌|两头顺听牌/,
      );
      await expect(opponent.locator('.review-explanation')).toContainText('10K');
      await expect(opponent.locator('.review-explanation')).not.toContainText('赔率支持继续追');
      await expect(opponent.locator('.review-explanation')).toContainText('之后不再参与下注决策');
    } else {
      await expect(opponent.locator('.review-explanation')).toContainText('同花听牌');
      await expect(opponent.locator('.review-explanation')).toContainText('弃牌');
      await expect(opponent.locator('.review-explanation')).not.toContainText(
        /接住后续下注|后续下注|还会.*施压/,
      );
    }
    expect(
      await page.locator('#review-dialog').evaluate((el) => el.scrollWidth - el.clientWidth),
    ).toBeLessThanOrEqual(1);
    await mkdir('.artifacts/causal-review-2026-10-14', { recursive: true });
    const artifact = path.resolve(
      '.artifacts/causal-review-2026-10-14',
      `${info.project.name}-${kind}.png`,
    );
    await page.screenshot({ path: artifact });
    await info.attach(`${kind}-actual-bot-review`, { path: artifact, contentType: 'image/png' });
    await page
      .locator('#review-dialog')
      .getByRole('button', { name: '关闭复盘', exact: true })
      .click();
  }
});
