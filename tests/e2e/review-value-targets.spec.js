import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import {
  topPairFlushTurn,
  limpedSmallFlush,
  shortFlushShove,
  finishValueGame,
} from '../fixtures/review-value-targets.js';
const output = '.artifacts/review-value-targets-2026-10-25/web';
async function open(page, make, key) {
  const row = make(),
    snapshot = row[key],
    g = finishValueGame(row.game);
  g.decisions = [snapshot];
  await page.goto('/');
  await page.waitForFunction(() => window.qa);
  await page.evaluate((game) => window.qa.loadRecordedGame(game), g);
  await page.locator('#review-hand-button').click();
  await expect(page.locator('#review-dialog')).toHaveAttribute('data-analysis-status', 'done', {
    timeout: 60000,
  });
  return page.locator('#review-coach-explanation');
}
test('top-pair flop value includes real draws and states the 810K bet once', async ({
  page,
}, info) => {
  const body = await open(page, topPairFlushTurn, 'flop'),
    summary = body.locator('.review-analysis-heading ~ p').first();
  await expect(summary).toContainText('顺子听牌或同花听牌的跟注');
  expect((await summary.innerText()).match(/810K/g)).toHaveLength(1);
  await summary.scrollIntoViewIfNeeded();
  await mkdir(output, { recursive: true });
  await page.screenshot({ path: output + '/' + info.project.name + '-flop-draw-value.png' });
});
test('the turn review explains the completed diamond draw and compares a smaller commitment', async ({
  page,
}, info) => {
  const body = await open(page, topPairFlushTurn, 'turn'),
    summary = body.locator('.review-analysis-heading ~ p').first();
  await expect(summary).toContainText(/第三张方块.*两张方块.*已成同花/);
  await expect(summary).toContainText('过牌或较小下注');
  await expect(page.locator('#review-selected-status')).not.toHaveText('值得保留');
  await expect(summary).not.toContainText(/这次拿出 1.21M|强牌可比较价值全下|只有更强/);
  await summary.scrollIntoViewIfNeeded();
  await mkdir(output, { recursive: true });
  await page.screenshot({ path: output + '/' + info.project.name + '-turn-flush-risk.png' });
});
test('the limped small flush lists higher suited connectors and boats using the paired four', async ({
  page,
}, info) => {
  const body = await open(page, limpedSmallFlush, 'river');
  await expect(body).toContainText('9♣ 10♣');
  await expect(body).toContainText('6♣ 7♣');
  await expect(body).toContainText('4♠ Q♠');
  await expect(body).toContainText('4♠ 10♠');
  await expect(body).not.toContainText(/Q♠ Q♥|K♣ A♣|10♠ 10♥/);
  await body.locator('.review-analysis-heading').scrollIntoViewIfNeeded();
  await mkdir(output, { recursive: true });
  await page.screenshot({ path: output + '/' + info.project.name + '-limped-examples.png' });
});
test('the shallow river flush keeps a price-aware value comparison with one 200K amount', async ({
  page,
}, info) => {
  const body = await open(page, shortFlushShove, 'river'),
    summary = body.locator('.review-analysis-heading ~ p').first();
  await expect(summary).toContainText('5.2%');
  await expect(summary).toContainText('更高的同花');
  expect((await summary.innerText()).match(/200K/g)).toHaveLength(1);
  await expect(summary).not.toContainText('不能只看成花就把筹码全部投入');
  await summary.scrollIntoViewIfNeeded();
  await mkdir(output, { recursive: true });
  await page.screenshot({ path: output + '/' + info.project.name + '-short-flush-value.png' });
});
for (const locale of ['en', 'zh-TW', 'ja', 'ko', 'es', 'it', 'pt', 'de', 'fr', 'ru'])
  test('new turn explanation renders completely in ' + locale, async ({ page }) => {
    await page.goto('/');
    await page.evaluate((l) => localStorage.setItem('noir-locale', l), locale);
    const body = await open(page, topPairFlushTurn, 'turn');
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    const text = await body.innerText();
    for (const n of ['1.21M', '2.43M']) expect(text).toContain(n);
    expect(text).not.toMatch(/\{\d+\}/);
    if (!['zh-TW', 'ja'].includes(locale)) expect(text).not.toMatch(/\p{Script=Han}/u);
  });
