import { test, expect } from '@playwright/test';
const defaults = { smallBlind: 100, bigBlind: 200, startingStack: 20000, chipUnit: 100 };
test('default stakes, local icon and custom new games use the per-hand denomination', async ({
  page,
}) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.qa);
  await page.evaluate(() => window.qa.stop());
  expect((await page.evaluate(() => window.noir.getState())).stakes).toEqual(defaults);
  await expect(page.locator('#blind-values')).toHaveText('100 / 200');
  await expect(page.locator('.brand-mark img')).toHaveAttribute('src', '/app-icon.png');
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', 'favicon.png');
  await expect(page.locator('#starting-stack')).toHaveCount(0);
  for (const stakes of [
    defaults,
    { smallBlind: 25, bigBlind: 75, startingStack: 7500, chipUnit: 25 },
    { smallBlind: 500, bigBlind: 1000, startingStack: 100000, chipUnit: 500 },
  ]) {
    const before = await page.evaluate((stakes) => window.qa.configuredTurn(stakes), stakes);
    await expect(page.locator('#bet-slider')).toHaveAttribute('step', '1');
    expect(before.legal.fullRaiseTo).toBe(2 * stakes.bigBlind);
    await page.locator('[data-preset="pot"]').click();
    const target = Number(await page.locator('#bet-slider').getAttribute('data-raise-to'));
    expect(target % stakes.chipUnit).toBe(0);
    await page.locator('#raise-button').click();
    await page.evaluate(() => window.qa.stop());
    const after = await page.evaluate(() => window.qa.snapshot());
    expect(after.players[0].bet).toBe(target);
    expect(after.decisions[0].bigBlind).toBe(stakes.bigBlind);
    expect(after.decisions[0].chipUnit).toBe(stakes.chipUnit);
    expect(after.players.reduce((sum, p) => sum + p.stack + p.total, 0)).toBe(
      stakes.startingStack * 5,
    );
  }
  await page.evaluate(() =>
    window.qa.configuredTurn({
      smallBlind: 50000,
      bigBlind: 100000,
      startingStack: 10000000,
      chipUnit: 50000,
    }),
  );
  await expect(page.locator('#hero-stack')).toHaveText('10M');
  await expect(page.locator('#blind-values')).toHaveText('50K / 100K');
});
test('desktop actions align at the bottom and finish, review and retry share their height', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop');
  await page.goto('/');
  await page.waitForFunction(() => !!window.qa);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() =>
    window.qa.configuredTurn({
      smallBlind: 100,
      bigBlind: 200,
      startingStack: 20000,
      chipUnit: 100,
    }),
  );
  const boxes = await page.evaluate(() =>
    ['.bet-presets', '#raise-button', '#fold-button', '#call-button'].map((selector) => {
      const r = document.querySelector(selector).getBoundingClientRect();
      return { height: r.height, bottom: r.bottom };
    }),
  );
  await info.attach('desktop-action-geometry', {
    body: JSON.stringify(
      await page.evaluate(() =>
        [
          '.action-panel',
          '.bet-controls',
          '.bet-controls > label',
          '.bet-controls input',
          '.bet-presets',
          '.action-buttons',
          '#raise-button',
        ].map((selector) => {
          const el = document.querySelector(selector);
          if (!el) return { selector, missing: true };
          const rect = el.getBoundingClientRect();
          const style = getComputedStyle(el);
          return {
            selector,
            top: rect.top,
            bottom: rect.bottom,
            height: rect.height,
            display: style.display,
            alignSelf: style.alignSelf,
            alignItems: style.alignItems,
            gridRows: style.gridTemplateRows,
            padding: style.padding,
            margin: style.margin,
          };
        }),
      ),
    ),
    contentType: 'application/json',
  });
  for (const r of boxes.slice(1)) {
    expect(r.height).toBe(52);
    expect(Math.abs(r.bottom - boxes[0].bottom)).toBeLessThan(1);
  }
  await page.screenshot({ path: '.artifacts/stakes/desktop-actions.png', fullPage: true });
  await page.locator('#fold-button').click();
  await expect(page.locator('#continue-deal-button')).toBeVisible();
  expect((await page.locator('#continue-deal-button').boundingBox()).height).toBe(52);
  await page.locator('#continue-deal-button').click();
  await expect(page.locator('#review-hand-button')).toBeVisible();
  for (const id of ['#next-button', '#restart-hand-button', '#review-hand-button'])
    expect((await page.locator(id).boundingBox()).height).toBe(52);
  await page.screenshot({ path: '.artifacts/stakes/desktop-settled.png', fullPage: true });
});

test('changing blinds immediately resets hand, balances and statistics and invalidates old work', async ({
  page,
}) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.qa);
  await page.evaluate(() => window.qa.stop());
  await page.evaluate(() => window.qa.foldWin(5, 0));
  const after = await page.evaluate(() => {
    const changed = window.noir.setStakes({ smallBlind: 300, bigBlind: 600 });
    window.qa.stop();
    return { changed, state: window.qa.snapshot() };
  });
  expect(after.changed).toBe(true);
  expect(after.state.hand).toBe(1);
  expect(after.state.stats).toEqual({ hands: 0, wins: 0, buyin: 60000 });
  expect(after.state.players.every((p) => p.stack + p.total === 60000)).toBe(true);
  await expect(page.locator('#blind-values')).toHaveText('300 / 600');
  await expect(page.locator('#review-hand-button')).toBeHidden();
  await expect(page.locator('#restart-hand-button')).toBeHidden();
  const noChange = await page.evaluate(() => {
    const before = JSON.stringify(window.qa.snapshot());
    const changed = window.noir.setStakes({ smallBlind: 300, bigBlind: 600 });
    let rejected = false;
    try {
      window.noir.setStakes({ smallBlind: 30, bigBlind: 60 });
    } catch {
      rejected = true;
    }
    return { changed, rejected, same: before === JSON.stringify(window.qa.snapshot()) };
  });
  expect(noChange).toEqual({ changed: false, rejected: true, same: true });
  await page.reload();
  await page.waitForFunction(() => !!window.qa);
  await page.evaluate(() => window.qa.stop());
  expect((await page.evaluate(() => window.noir.getState())).stakes).toEqual({
    smallBlind: 300,
    bigBlind: 600,
    startingStack: 60000,
    chipUnit: 300,
  });
});
