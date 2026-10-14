import { test, expect } from '@playwright/test';
import { closeSettings, openSettings } from './settings-helpers.js';

const defaultStakes = { smallBlind: 100, bigBlind: 200, startingStack: 20000, chipUnit: 100 };
const stakes = (smallBlind) => ({
  smallBlind,
  bigBlind: 2 * smallBlind,
  startingStack: 200 * smallBlind,
  chipUnit: smallBlind,
});

async function editSmallBlind(page, value) {
  if (!(await page.locator('#small-blind-input').isVisible()))
    await page.locator('#small-blind-button').click();
  await page.locator('#small-blind-input').fill(value);
}

async function saveSmallBlind(page, value) {
  await editSmallBlind(page, value);
  await page.locator('#small-blind-input').press('Enter');
}

async function finishHand(page) {
  await page.evaluate(() => {
    window.qa.stop();
    window.qa.foldRest();
  });
  await expect(page.locator('#next-button')).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.qa && !!window.noir);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate((configured) => window.qa.configuredTurn(configured), defaultStakes);
});

test('small-blind editor rejects invalid syntax and amounts without changing the hand or saved stakes', async ({
  page,
}) => {
  await openSettings(page);
  await expect(page.locator('#small-blind-button')).toHaveText('100');
  await expect(page.locator('#big-blind-value')).toHaveText('200');
  await expect(page.locator('#stakes-change-note')).toBeHidden();
  const before = await page.evaluate(() => ({
    game: window.qa.snapshot(),
    saved: localStorage.getItem('noir-table-v1'),
  }));
  for (const value of ['', '0', '-25', '25.0', '25.5', '30', '1K', '1e3', '50025']) {
    await editSmallBlind(page, value);
    await expect(page.locator('#stakes-error')).toBeVisible();
    await expect(page.locator('#stakes-error')).toHaveAttribute('role', 'alert');
    await expect(page.locator('#stakes-error')).toHaveText(
      '小盲只能输入25的正整数倍，且不超过50K。',
    );
    await expect(page.locator('#small-blind-input')).toHaveAttribute('aria-invalid', 'true');
    const red = await page.locator('#stakes-error').evaluate((el) => {
      const channels = getComputedStyle(el).color.match(/\d+/g).map(Number);
      return channels[0] > channels[1] && channels[0] > channels[2];
    });
    expect(red).toBe(true);
    expect(
      await page.evaluate(() => ({
        game: window.qa.snapshot(),
        saved: localStorage.getItem('noir-table-v1'),
      })),
    ).toEqual(before);
    await expect(page.locator('#stakes-change-note')).toBeHidden();
  }
  await saveSmallBlind(page, '25');
  await expect(page.locator('#stakes-error')).toBeHidden();
  await expect(page.locator('#small-blind-button')).toHaveText('25');
  await expect(page.locator('#big-blind-value')).toHaveText('50');
  await expect(page.locator('#stakes-change-note')).toHaveText(
    '下一手起始盲注25/50·筹码恢复为5K，统计重新开始',
  );
  expect((await page.evaluate(() => window.qa.snapshot())).stakes).toEqual(defaultStakes);
});

test('saved blind changes leave the current hand and retries intact, then reset the next session once', async ({
  page,
}) => {
  await finishHand(page);
  const settled = await page.evaluate(() => window.qa.snapshot());
  expect(settled.stats.hands).toBe(1);
  await openSettings(page);
  await saveSmallBlind(page, '300');
  await expect(page.locator('#small-blind-button')).toHaveText('300');
  await expect(page.locator('#big-blind-value')).toHaveText('600');
  await expect(page.locator('#stakes-change-note')).toHaveText(
    '下一手起始盲注300/600·筹码恢复为60K，统计重新开始',
  );
  expect(await page.evaluate(() => window.qa.snapshot())).toEqual(settled);
  await closeSettings(page);
  for (const attempt of [1, 2]) {
    await page.locator('#restart-hand-button').click();
    await page.evaluate(() => window.qa.stop());
    const retried = await page.evaluate(() => window.qa.snapshot());
    expect(retried.stakes).toEqual(defaultStakes);
    expect(retried.hand).toBe(settled.hand);
    expect(retried.replayAttempt).toBe(attempt);
    expect(retried.players.map((player) => player.hole)).toEqual(
      settled.players.map((player) => player.hole),
    );
    expect(retried.stats.hands).toBe(0);
    expect(retried.players.every((player) => player.stack + player.total === 20000)).toBe(true);
    await openSettings(page);
    await expect(page.locator('#small-blind-button')).toHaveText('300');
    await expect(page.locator('#stakes-change-note')).toBeVisible();
    await closeSettings(page);
    await finishHand(page);
  }
  await page.locator('#next-button').click();
  await page.evaluate(() => window.qa.stop());
  const next = await page.evaluate(() => window.qa.snapshot());
  expect(next.stakes).toEqual(stakes(300));
  expect(next.hand).toBe(1);
  expect(next.replayAttempt || 0).toBe(0);
  expect(next.stats).toEqual({ hands: 0, wins: 0, buyin: 60000 });
  expect(next.players.every((player) => player.stack + player.total === 60000)).toBe(true);
  expect(next.players.reduce((total, player) => total + player.stack + player.total, 0)).toBe(
    next.players.length * 60000,
  );
  await expect(page.locator('#blind-values')).toHaveText('300 / 600');
  await openSettings(page);
  await expect(page.locator('#stakes-change-note')).toBeHidden();
  await closeSettings(page);
  await finishHand(page);
  await page.locator('#next-button').click();
  await page.evaluate(() => window.qa.stop());
  const later = await page.evaluate(() => window.qa.snapshot());
  expect(later.hand).toBe(2);
  expect(later.stats.hands).toBe(1);
  expect(later.stakes).toEqual(stakes(300));
});

test('the 50K small-blind limit saves raw digits, displays K/M, and applies when reloading a fresh hand', async ({
  page,
}) => {
  await openSettings(page);
  await saveSmallBlind(page, '50000');
  await expect(page.locator('#small-blind-button')).toHaveText('50K');
  await expect(page.locator('#big-blind-value')).toHaveText('100K');
  await expect(page.locator('#stakes-change-note')).toHaveText(
    '下一手起始盲注50K/100K·筹码恢复为10M，统计重新开始',
  );
  expect((await page.evaluate(() => window.qa.snapshot())).stakes).toEqual(defaultStakes);
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('noir-table-v1')).stakes),
  ).toEqual(stakes(50000));
  await page.locator('#small-blind-button').click();
  await expect(page.locator('#small-blind-input')).toHaveValue('50000');
  await page.reload();
  await page.waitForFunction(() => !!window.qa && !!window.noir);
  await page.evaluate(() => window.qa.stop());
  const fresh = await page.evaluate(() => window.qa.snapshot());
  expect(fresh.stakes).toEqual(stakes(50000));
  expect(fresh.hand).toBe(1);
  expect(fresh.stats).toEqual({ hands: 0, wins: 0, buyin: 10000000 });
  expect(fresh.players.every((player) => player.stack + player.total === 10000000)).toBe(true);
  await expect(page.locator('#blind-values')).toHaveText('50K / 100K');
  await openSettings(page);
  await expect(page.locator('#stakes-change-note')).toBeHidden();
});

test('causal review keeps the recorded blind scale while a new scale is queued across retry', async ({
  page,
}) => {
  await page.evaluate(() => window.qa.reviewCausalReraise());
  const original = await page.evaluate(() => window.qa.snapshot());
  expect(original.stakes).toEqual(stakes(25));
  await openSettings(page);
  await saveSmallBlind(page, '50000');
  await expect(page.locator('#stakes-change-note')).toHaveText(
    '下一手起始盲注50K/100K·筹码恢复为10M，统计重新开始',
  );
  await closeSettings(page);
  expect(await page.evaluate(() => window.qa.snapshot())).toEqual(original);
  await page.locator('#review-hand-button').click();
  await expect(page.locator('#review-dialog')).toHaveAttribute('data-analysis-status', 'done', {
    timeout: 30000,
  });
  await page.locator('[data-review-index="0"]').click();
  const explanation = page.locator('#review-coach-explanation');
  await expect(explanation).toContainText('350');
  await expect(explanation).toContainText(/Mia.*1K/);
  await expect(explanation).toContainText(/River.*950/);
  await expect(explanation).not.toContainText(/10M|100K|50K/);
  await expect(page.locator('#review-evidence')).toContainText('5K');
  await page.locator('#review-dialog .close-dialog').first().click();
  await page.locator('#restart-hand-button').click();
  await page.evaluate(() => window.qa.stop());
  const retried = await page.evaluate(() => window.qa.snapshot());
  expect(retried.stakes).toEqual(stakes(25));
  expect(retried.hand).toBe(original.hand);
  expect(retried.replayAttempt).toBe(1);
  expect(retried.stats.hands).toBe(0);
  await openSettings(page);
  await expect(page.locator('#small-blind-button')).toHaveText('50K');
  await expect(page.locator('#stakes-change-note')).toBeVisible();
  await closeSettings(page);
  await finishHand(page);
  await page.locator('#next-button').click();
  await page.evaluate(() => window.qa.stop());
  const next = await page.evaluate(() => window.qa.snapshot());
  expect(next.stakes).toEqual(stakes(50000));
  expect(next.hand).toBe(1);
  expect(next.stats).toEqual({ hands: 0, wins: 0, buyin: 10000000 });
  expect(next.players.every((player) => player.stack + player.total === 10000000)).toBe(true);
  await expect(page.locator('#blind-values')).toHaveText('50K / 100K');
});

test('restoring the current blinds removes the pending reset and preserves statistics next hand', async ({
  page,
}) => {
  await finishHand(page);
  await openSettings(page);
  await saveSmallBlind(page, '300');
  await expect(page.locator('#stakes-change-note')).toBeVisible();
  await saveSmallBlind(page, '100');
  await expect(page.locator('#stakes-change-note')).toBeHidden();
  await closeSettings(page);
  await page.locator('#next-button').click();
  await page.evaluate(() => window.qa.stop());
  const next = await page.evaluate(() => window.qa.snapshot());
  expect(next.stakes).toEqual(defaultStakes);
  expect(next.hand).toBe(2);
  expect(next.stats.hands).toBe(1);
});

test('hero action and activity amount labels consistently show K/M while the engine keeps integer chips', async ({
  page,
}) => {
  for (const scenario of [
    { configured: defaultStakes, amount: 1200, displayed: '1.2K' },
    { configured: defaultStakes, amount: 18800, displayed: '18.8K' },
    { configured: defaultStakes, amount: 20000, displayed: '20K' },
    { configured: stakes(50000), amount: 10000000, displayed: '10M' },
  ]) {
    await page.evaluate((configured) => window.qa.configuredTurn(configured), scenario.configured);
    await page.locator('#bet-slider').evaluate((el, amount) => {
      el.value = String(amount);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, scenario.amount);
    await page.locator('#raise-button').click();
    await page.evaluate(() => window.qa.stop());
    const after = await page.evaluate(() => window.qa.snapshot());
    expect(after.players[0].bet).toBe(scenario.amount);
    expect(after.logs.some((entry) => entry.text.includes(String(scenario.amount)))).toBe(true);
    await expect(page.locator('#hero-last-action')).toContainText(scenario.displayed);
    await expect(page.locator('#activity-list')).toContainText(scenario.displayed);
    await expect(page.locator('#hero-last-action')).not.toContainText(String(scenario.amount));
    await expect(page.locator('#activity-list')).not.toContainText(String(scenario.amount));
    expect(after.players.reduce((sum, player) => sum + player.stack + player.total, 0)).toBe(
      after.players.length * scenario.configured.startingStack,
    );
  }
});

test('blind editing, validation and next-hand notices are localized without changing compact amounts', async ({
  page,
}) => {
  test.setTimeout(60000);
  await openSettings(page);
  for (const locale of ['zh-CN', 'en', 'zh-TW', 'ja', 'ko', 'es', 'it', 'pt', 'de', 'fr', 'ru']) {
    await page.locator('#language-select').selectOption(locale);
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await saveSmallBlind(page, '50000');
    const expected = await page.evaluate(async () => {
      const { localizeText } = await import('/src/i18n/index.js');
      return {
        note: localizeText('下一手起始盲注50K/100K·筹码恢复为10M，统计重新开始'),
        button: localizeText('修改起始小盲'),
        error: localizeText('小盲只能输入25的正整数倍，且不超过50K。'),
      };
    });
    await expect(page.locator('#small-blind-button')).toHaveText('50K');
    await expect(page.locator('#small-blind-button')).toHaveAttribute(
      'aria-label',
      expected.button,
    );
    await expect(page.locator('#big-blind-value')).toHaveText('100K');
    await expect(page.locator('#stakes-change-note')).toHaveText(expected.note);
    for (const amount of ['50K', '100K', '10M']) expect(expected.note).toContain(amount);
    if (!['zh-CN', 'zh-TW', 'ja'].includes(locale)) {
      expect(expected.note).not.toMatch(/\p{Script=Han}/u);
      expect(expected.error).not.toMatch(/\p{Script=Han}/u);
    }
    await editSmallBlind(page, '50025');
    await expect(page.locator('#stakes-error')).toHaveText(expected.error);
    await expect(page.locator('#stakes-error')).toBeVisible();
    await saveSmallBlind(page, '100');
    await expect(page.locator('#stakes-change-note')).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(
      false,
    );
  }
});
