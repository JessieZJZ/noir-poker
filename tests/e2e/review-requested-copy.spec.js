import { test, expect } from '@playwright/test';
import { heroValueGame } from '../fixtures/review-spots.js';
import { observerRecord } from '../fixtures/opponent-observer.js';

test('reported opponent summaries explain the weak kicker, required win probability and joined all-in runout', async ({
  page,
}, info) => {
  // External public snapshots exercise display branches; these are not claimed
  // as actions newly played by the production bot in this settled hand.
  const cases = [
    [
      'weak-kicker',
      observerRecord({ action: 'check', reason: 'free-check', hole: 'Ad 6h', board: 'Ah 3h Ts' }),
    ],
    [
      'paired-board-kicker',
      observerRecord({ action: 'check', reason: 'free-check', hole: '5d Ad', board: 'Jc As Js' }),
    ],
    [
      'call-price',
      observerRecord({
        action: 'call',
        reason: 'price-continue',
        hole: 'Ad 6h',
        board: 'Ah 3h Ts',
        cost: 700,
        stack: 20000,
        pot: 3600,
        contestable: 4300,
      }),
    ],
    [
      'all-in-runout',
      observerRecord({
        action: 'call',
        reason: 'price-continue',
        hole: 'Ac Th',
        board: 'Jc Kd Qd',
        cost: 15100,
        stack: 15100,
        contestable: 40300,
      }),
    ],
  ];
  await page.goto('/');
  await page.waitForFunction(() => window.qa);
  for (const [name, record] of cases) {
    const game = heroValueGame('overpair');
    record.id = record.trace.view.id = 4;
    record.name = 'Kai';
    record.trace.view.position = 'BB';
    game.decisions = [];
    game.botDecisions = [record];
    await page.evaluate((g) => window.qa.loadRecordedGame(g), game);
    await page.locator('#review-hand-button').click();
    await page.locator('#review-opponents-tab').click();
    const summary = page.locator('#review-opponent-detail .review-analysis-heading ~ p');
    await expect(summary).toContainText('Kai');
    if (name === 'weak-kicker') {
      await expect(summary).toContainText(/6 踢脚偏弱.*踢脚更好.*落后.*过牌.*控制底池/);
      await expect(summary).not.toContainText(/把较强牌保留在过牌范围|等后位先下注/);
    } else if (name === 'paired-board-kicker') {
      await expect(summary).toContainText(
        /公共牌的一对 J 是所有玩家共用的.*底牌这对 A 和 5 踢脚.*一张 J 就是三条.*大于 5 也会领先.*过牌先控制底池/,
      );
      await expect(summary).not.toContainText(/把较强牌保留在过牌范围|仍可向较弱/);
    } else if (name === 'call-price') {
      await expect(summary).toContainText(
        '继续要补 700，可争夺跟注后的 4.3K 底池，需要至少 16.3% 的胜率。',
      );
      await expect(summary).not.toContainText('当前保本门槛');
    } else {
      await expect(summary).toContainText(
        '之后不再参与下注决策，可以看完剩余公共牌，无需再支付筹码。',
      );
      await expect(summary).not.toContainText('下注决策。可以');
      await expect(summary).toContainText('15.1K');
      await expect(summary).toContainText('40.3K');
    }
    await summary.scrollIntoViewIfNeeded();
    await info.attach(name, { body: await page.screenshot(), contentType: 'image/png' });
    await page.locator('#language-select').evaluate((select) => {
      select.value = 'en';
      select.dispatchEvent(new Event('change'));
    });
    await expect(summary).not.toContainText(/\p{Script=Han}/u);
    await page.locator('#language-select').evaluate((select) => {
      select.value = 'zh-CN';
      select.dispatchEvent(new Event('change'));
    });
    await expect(summary).toContainText('选择');
    await page
      .locator('#review-dialog')
      .getByRole('button', { name: '关闭复盘', exact: true })
      .click();
  }
});
