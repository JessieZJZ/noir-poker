import { test, expect } from '@playwright/test';

test('pot presets use the pot after calling and apply the exact screenshot amounts', async ({
  page,
}) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.qa);
  const before = await page.evaluate(() => window.qa.potSizing());
  expect(before.pot).toBe(3075);
  expect(before.legal.callAmount).toBe(800);
  await expect(page.locator('#pot-value')).toHaveText('3,075');
  await expect(page.locator('#bet-sizing-note')).toHaveCount(0);
  await page.locator('[data-preset="half"]').click();
  await expect(page.locator('#bet-slider')).toHaveAttribute('step', '25');
  await expect(page.locator('#bet-value')).toHaveText('2,750');
  await expect(page.locator('#raise-button')).toHaveAttribute('aria-label', '2-bet 加注至 2,750');
  await page.locator('[data-preset="pot"]').click();
  await expect(page.locator('#bet-value')).toHaveText('4,675');
  await expect(page.locator('#raise-button')).toHaveAttribute('aria-label', '2-bet 全下至 4,675');
  // Choosing a shortcut sizes the action; it does not call or mutate the pot.
  expect((await page.evaluate(() => window.noir.getState())).pot).toBe(3075);
  await page.locator('#raise-button').click();
  const after = await page.evaluate(() => {
    window.qa.stop();
    return window.noir.getState();
  });
  expect(after.players[0].bet).toBe(4675);
  expect(after.players[0].stack).toBe(0);
  expect(after.pot).toBe(7750);
  await expect(page.locator('#hero-last-action')).toContainText('4,675');
  await expect(page.locator('#bet-sizing-note')).toHaveCount(0);
});

test('checkable streets and existing contributions size correctly without overflowing narrow controls', async ({
  page,
}) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.qa);
  for (const [street, level] of [
    [0, 2],
    [1, 1],
    [1, 2],
    [2, 3],
  ]) {
    const state = await page.evaluate(
      ([level, street]) => window.qa.bettingTurn(level, street),
      [level, street],
    );
    for (const [preset, fraction] of [
      ['half', 0.5],
      ['pot', 1],
    ]) {
      const target = Math.min(
        state.legal.maxRaiseTo,
        Math.max(
          state.legal.minRaiseTo,
          state.players[0].bet +
            state.legal.callAmount +
            Math.round(((state.pot + state.legal.callAmount) * fraction) / 25) * 25,
        ),
      );
      await page.locator(`[data-preset="${preset}"]`).click();
      await expect(page.locator('#bet-slider')).toHaveValue(String(target));
    }
    await expect(page.locator('#bet-sizing-note')).toHaveCount(0);
  }
  await page.evaluate(() => window.qa.potSizing());
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    const fits = await page.locator('.bet-presets').evaluate((el) => {
      const box = el.getBoundingClientRect(),
        parent = el.parentElement.getBoundingClientRect(),
        actions = document.querySelector('.action-buttons').getBoundingClientRect();
      return (
        el.scrollWidth <= el.clientWidth &&
        box.left >= parent.left - 1 &&
        box.right <= parent.right + 1 &&
        (box.right <= actions.left || box.bottom <= actions.top)
      );
    });
    expect(fits).toBe(true);
  }
  // Custom raises, slider steps and shortcut targets all use whole 25 chips.
  await page.locator('#bet-slider').fill('1625');
  await expect(page.locator('#bet-value')).toHaveText('1,625');
  await page.locator('#raise-button').click();
  const custom = await page.evaluate(() => {
    window.qa.stop();
    return window.noir.getState();
  });
  expect(custom.players[0].bet).toBe(1625);
  const odd = await page.evaluate(() =>
    window.qa.potSizing({ opening: 375, wager: 825, stack: 6000 }),
  );
  expect(odd.pot).toBe(3225);
  await page.locator('[data-preset="pot"]').click();
  await expect(page.locator('#bet-slider')).toHaveValue('4875');
  await page.locator('[data-preset="half"]').click();
  await expect(page.locator('#bet-slider')).toHaveValue('2850');
  await page.evaluate(() => window.qa.bettingTurn(3, 0, true));
  const short = await page.evaluate(() => window.noir.getState());
  for (const preset of ['half', 'pot']) {
    await page.locator(`[data-preset="${preset}"]`).click();
    await expect(page.locator('#bet-slider')).toHaveValue(String(short.legal.maxRaiseTo));
  }
});
