import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { reviewedAllInGame } from '../fixtures/all-in-decisions.js';

test('real all-in bot calls and tight 4-bet folds replay the actual public action and motive', async ({
  page,
}, info) => {
  await page.goto('/');
  await page.waitForFunction(() => window.qa);
  for (const [kind, name, action, cost, wealth, hole] of [
    ['flop-qq', 'Mia', 'call', '4,950', 25000, 'Q♠ Q♦'],
    ['multi-qq', 'River', 'fold', '4,850', 30000, 'Q♠ Q♦'],
    ['made-redraw', 'Mia', 'call', '4,950', 25000, '7♥ 7♦'],
    ['draw-fold', 'Mia', 'fold', '4,950', 25000, 'Q♠ 7♠'],
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
      await expect(opponent.locator('.review-explanation')).toContainText('10,150');
      await expect(opponent.locator('.review-explanation')).toContainText(/只能等发牌|只能等待/);
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
      await expect(opponent.locator('.review-explanation')).toContainText('10,000');
      await expect(opponent.locator('.review-explanation')).not.toContainText('赔率支持继续追');
      await expect(opponent.locator('.review-explanation')).toContainText(/只能等发牌或摊牌/);
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
