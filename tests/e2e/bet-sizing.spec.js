import { test, expect } from '@playwright/test';

test('pot presets use the pot after calling and apply the exact screenshot amounts', async ({
  page,
}) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.qa);
  const before = await page.evaluate(() => window.qa.potSizing());
  expect(before.pot).toBe(3075);
  expect(before.legal.callAmount).toBe(800);
  await expect(page.locator('#pot-value')).toHaveText('3.075K');
  await expect(page.locator('#bet-sizing-note')).toHaveCount(0);
  await page.locator('[data-preset="half"]').click();
  await expect(page.locator('#bet-slider')).toHaveAttribute('step', '1');
  await expect(page.locator('#bet-value')).toHaveText('2.75K');
  await expect(page.locator('#raise-button')).toHaveAttribute('aria-label', '2-bet 加注至 2.75K');
  await page.locator('[data-preset="pot"]').click();
  await expect(page.locator('#bet-value')).toHaveText('4.675K');
  await expect(page.locator('#raise-button')).toHaveAttribute('aria-label', '2-bet 全下至 4.675K');
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
  await expect(page.locator('#hero-last-action')).toContainText('4.675K');
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
      await expect(page.locator('#bet-slider')).toHaveAttribute('data-raise-to', String(target));
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
  await page.locator('#bet-slider').focus();
  await page.locator('#bet-slider').press('Home');
  await page.locator('#bet-slider').press('ArrowRight');
  await expect(page.locator('#bet-value')).toHaveText('1.625K');
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
  await expect(page.locator('#bet-slider')).toHaveAttribute('data-raise-to', '4875');
  await page.locator('[data-preset="half"]').click();
  await expect(page.locator('#bet-slider')).toHaveAttribute('data-raise-to', '2850');
  await page.evaluate(() => window.qa.bettingTurn(3, 0, true));
  const short = await page.evaluate(() => window.noir.getState());
  for (const preset of ['half', 'pot']) {
    await page.locator(`[data-preset="${preset}"]`).click();
    await expect(page.locator('#bet-slider')).toHaveAttribute(
      'data-raise-to',
      String(short.legal.maxRaiseTo),
    );
  }
});

test('dragging from the rail reaches pot at halfway and all-in at the right edge', async ({
  page,
}) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.qa);
  await page.evaluate(() => window.qa.potSizing({ stack: 20000 }));
  const slider = page.locator('#bet-slider');
  await page.locator('[data-preset="pot"]').click();
  const pot = await slider.getAttribute('data-raise-to');
  await expect(slider).toHaveValue('500000');
  const box = await slider.boundingBox();
  // Begin on the rail away from its thumb, then drag both directions.
  await page.mouse.move(box.x + box.width * 0.25, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(slider).toHaveAttribute('data-raise-to', pot);
  await slider.press('End');
  await expect(slider).toHaveValue('1000000');
  const state = await page.evaluate(() => window.noir.getState());
  await expect(slider).toHaveAttribute('data-raise-to', String(state.legal.maxRaiseTo));
});

test('rounded raise amounts do not pull the rail thumb away from the finger after rerender', async ({
  page,
}) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.qa);
  await page.evaluate(() => window.qa.potSizing({ stack: 20000 }));
  const slider = page.locator('#bet-slider');
  await slider.evaluate((el) => {
    el.value = '318725';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const before = await slider.getAttribute('data-raise-to');
  await expect(slider).toHaveValue('318725');
  await page.locator('#opponents-button').click();
  await page.locator('#hint-toggle').click();
  await page.locator('#opponents-dialog .close-dialog').first().click();
  await expect(slider).toHaveValue('318725');
  await expect(slider).toHaveAttribute('data-raise-to', before);
  await page.locator('[data-preset="pot"]').click();
  await expect(slider).toHaveValue('500000');
});
