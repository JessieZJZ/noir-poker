import { test, expect } from '@playwright/test';

async function openCalculator(page) {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-app-ready', 'true');
  await page.evaluate(() => window.qa.stop());
  await page.locator('#rules-button').click();
  await page.locator('#win-rate-menu-item').click();
  await expect(page.locator('#win-rate-dialog')).toBeVisible();
}
const hole = (page, player, card = 0) =>
  page.locator(`[data-player="${player}"][data-card="${card}"]`);
const pick = async (page, ...keys) => {
  for (const key of keys) await page.locator(`[data-pick="${key}"]`).click();
};
const pickerSettled = (page) =>
  page
    .locator('#win-rate-picker')
    .evaluate((element) => Promise.all(element.getAnimations().map(({ finished }) => finished)));
async function dealReferenceHand(page) {
  await hole(page, 0).click();
  await pick(page, '0-14', '0-13');
  await hole(page, 1).click();
  await pick(page, '0-8', '0-7');
  await page.locator('#win-rate-add').click();
  await hole(page, 2).click();
  await pick(page, '2-10', '1-10');
  await page.locator('[data-board="0"]').click();
  await pick(page, '0-6', '0-11', '2-11');
}
const odds = (page) =>
  page
    .locator('.win-rate-odds-values strong')
    .evaluateAll((values) => values.map((value) => value.textContent));

test('guide menu opens the calculator and leaves the live hand untouched', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-app-ready', 'true');
  await page.evaluate(() => window.qa.stop());
  const before = await page.evaluate(() => window.qa.state());
  await page.locator('#rules-button').click();
  await expect(page.locator('#guide-menu [role="menuitem"]')).toHaveText([
    '对局记录',
    '新手引导',
    '玩法指南',
    '胜率计算器',
  ]);
  await page.locator('#win-rate-menu-item').click();
  await expect(page.locator('#win-rate-title')).toHaveText('胜率计算器');
  await expect(page.locator('#guide-menu')).toBeHidden();
  await expect(page.locator('#win-rate-dialog button', { hasText: /^计算$/ })).toHaveCount(0);
  await hole(page, 0).click();
  await pick(page, '0-14');
  await page.locator('#win-rate-picker-back').click();
  await page.locator('#win-rate-dialog .close-dialog').click();
  await expect(page.locator('#win-rate-dialog')).toBeHidden();
  expect(await page.evaluate(() => window.qa.state())).toEqual(before);
  await page.locator('#rules-button').click();
  await page.locator('#win-rate-menu-item').click();
  await expect(hole(page, 0)).toContainText('A♠');
});

test('cards auto-advance, block duplicates and calculate live with outs', async ({ page }) => {
  await openCalculator(page);
  await expect(page.locator('#win-rate-status')).toBeHidden();
  await hole(page, 0).click();
  await expect(page.locator('#win-rate-delete')).toBeHidden();
  await expect(page.locator('#win-rate-picker-title')).toHaveText('你的第 1 张底牌');
  const backdrop = await page.evaluate(() => {
    const style = getComputedStyle(document.querySelector('#win-rate-picker'), '::backdrop');
    return { filter: style.backdropFilter, color: style.backgroundColor };
  });
  expect(backdrop.filter).toBe('none');
  expect(Number(backdrop.color.match(/[\d.]+/g)[3])).toBeLessThanOrEqual(0.4);
  await pick(page, '0-14');
  await expect(page.locator('#win-rate-picker-title')).toHaveText('你的第 2 张底牌');
  await expect(page.locator('[data-pick="0-14"]')).toBeDisabled();
  await pick(page, '0-13');
  await expect(page.locator('#win-rate-picker')).toBeHidden();
  await hole(page, 1).click();
  await pick(page, '0-8', '0-7');
  await expect(page.locator('#win-rate-status')).toContainText('1712304');
  await expect.poll(() => odds(page)).toEqual(['63.25%', '36.21%']);
  await expect(page.locator('.win-rate-odds-tie').first()).toHaveText('平局 0.54%');
  await expect(page.locator('.win-rate-outs')).toHaveCount(0);

  await page.locator('#win-rate-add').click();
  await expect(page.locator('.win-rate-seat')).toHaveCount(3);
  await expect.poll(() => odds(page)).toEqual(['63.25%', '36.21%']);
  await hole(page, 2).click();
  await pick(page, '2-10', '1-10');
  await page.locator('[data-board="4"]').click();
  await expect(page.locator('#win-rate-picker-title')).toHaveText('翻牌第 1 张');
  await pick(page, '0-6', '0-11', '2-11');
  await expect(page.locator('#win-rate-picker')).toBeHidden();
  await expect.poll(() => odds(page)).toEqual(['44.85%', '2.99%', '51.83%']);
  await expect(page.locator('#win-rate-status')).toContainText('903');

  const seats = page.locator('.win-rate-seat');
  await expect(seats.nth(0).locator('.win-rate-outs-heading b')).toHaveText('12');
  await expect(seats.nth(0).locator('.win-rate-outs-cards .playing-card')).toHaveCount(12);
  await expect(page.locator('.win-rate-outs button')).toHaveCount(0);
  await expect(seats.nth(1).locator('.win-rate-outs-heading b')).toHaveText('0');
  await expect(seats.nth(2).locator('.win-rate-outs')).toHaveCount(0);
  await expect(page.locator('#win-rate-outs-note')).toBeVisible();
});

test('opponents can be removed and every card can be deleted or cleared', async ({ page }) => {
  await openCalculator(page);
  await expect(page.locator('.win-rate-remove')).toHaveCount(0);
  await dealReferenceHand(page);
  await expect(page.locator('.win-rate-remove')).toHaveCount(2);
  await page.getByRole('button', { name: '删除对手 1' }).click();
  await expect(page.locator('.win-rate-seat')).toHaveCount(2);
  await expect(page.locator('.win-rate-remove')).toHaveCount(0);
  await expect(page.locator('#win-rate-status')).toContainText('990');
  await page.locator('[data-board="1"]').click();
  await expect(page.locator('[data-pick="0-11"]')).toHaveAttribute('aria-pressed', 'true');
  const remove = page.locator('#win-rate-delete');
  await expect(remove).toHaveText('删除');
  const widths = await page.evaluate(() =>
    ['#win-rate-delete', '#win-rate-picker-back'].map(
      (selector) => document.querySelector(selector).getBoundingClientRect().width,
    ),
  );
  expect(Math.abs(widths[0] - widths[1])).toBeLessThan(1);
  await remove.click();
  await expect(page.locator('[data-board="1"] .playing-card')).toHaveCount(0);
  await expect(page.locator('#win-rate-picker')).toBeHidden();
  await expect(page.locator('.win-rate-outs')).toHaveCount(0);
  await page.locator('[data-board="4"]').click();
  await expect(page.locator('#win-rate-picker-title')).toHaveText('翻牌第 2 张');
  await expect(remove).toBeHidden();
  const back = await page.locator('#win-rate-picker-back').boundingBox();
  const grid = await page.locator('#win-rate-picker-grid').boundingBox();
  expect(back.width).toBeGreaterThan(grid.width - 40);
  await pick(page, '0-11');
  await expect(page.locator('#win-rate-picker')).toBeHidden();
  await page.locator('#win-rate-clear').click();
  await expect(page.locator('.win-rate-seat')).toHaveCount(2);
  await expect(page.locator('.win-rate-slot .playing-card')).toHaveCount(0);
  await expect(page.locator('.win-rate-waiting').first()).toHaveText('胜率：?');
  for (let count = 3; count <= 9; count++) {
    await page.locator('#win-rate-add').click();
    await expect(page.locator('.win-rate-seat')).toHaveCount(count);
  }
  await expect(page.locator('#win-rate-add')).toBeDisabled();
});

test('Escape closes the picker first and the keyboard reaches every step', async ({ page }) => {
  await openCalculator(page);
  await hole(page, 0).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#win-rate-picker')).toBeVisible();
  await expect(page.locator('[data-pick="0-14"]')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#win-rate-picker-title')).toHaveText('你的第 2 张底牌');
  await expect(page.locator('#win-rate-picker')).toBeVisible();
  await expect(page.locator('[data-pick="0-13"], [data-pick="0-14"]:focus').first()).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#win-rate-picker')).toBeHidden();
  await expect(page.locator('#win-rate-dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#win-rate-dialog')).toBeHidden();
});

test('closing mid-calculation cancels the run and reopening finishes it', async ({ page }) => {
  await openCalculator(page);
  await hole(page, 0).click();
  await pick(page, '0-14', '0-13');
  await hole(page, 1).click();
  await page.evaluate(() => {
    document.querySelector('[data-pick="0-8"]').click();
    document.querySelector('[data-pick="0-7"]').click();
    document.querySelector('#win-rate-dialog').close();
  });
  await expect(page.locator('#win-rate-dialog')).toBeHidden();
  await page.evaluate(async () => {
    await new Promise((resolve) => setTimeout(resolve, 400));
  });
  await page.locator('#rules-button').click();
  await page.locator('#win-rate-menu-item').click();
  await expect.poll(() => odds(page)).toEqual(['63.25%', '36.21%']);
});

for (const [width, height] of [
  [320, 568],
  [390, 844],
  [768, 1024],
]) {
  test(`calculator fits ${width}x${height} without page overflow`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await openCalculator(page);
    await dealReferenceHand(page);
    const body = page.locator('.win-rate-body');
    const fit = await page.locator('#win-rate-dialog').evaluate((dialog) => ({
      width: dialog.scrollWidth <= dialog.clientWidth,
      body: dialog.querySelector('.win-rate-body').scrollWidth <= dialog.clientWidth,
    }));
    expect(fit).toEqual({ width: true, body: true });
    await body.evaluate((element) => (element.scrollTop = element.scrollHeight));
    await expect(page.locator('#win-rate-add')).toBeInViewport();
    expect((await page.locator('#win-rate-clear').boundingBox()).y + 44).toBeLessThanOrEqual(
      height,
    );
    await page.locator('.win-rate-seat').first().locator('[data-card="0"]').click();
    await expect(page.locator('#win-rate-picker-back')).toBeInViewport();
    await pickerSettled(page);
    const box = await page.locator('#win-rate-picker').boundingBox();
    expect(box.y + box.height).toBeLessThanOrEqual(height + 1);
    expect(box.width).toBeLessThanOrEqual(width);
    const grid = page.locator('#win-rate-picker-grid');
    await grid.evaluate((element) => (element.scrollTop = element.scrollHeight));
    await expect(page.locator('[data-pick="3-2"]')).toBeInViewport();
  });
}

// Phone portrait, tablets in both orientations and the short 600dp Android tablet.
const sheetClear = (page) =>
  page.evaluate(() => {
    const sheet = document.querySelector('#win-rate-picker').getBoundingClientRect(),
      slot = document.querySelector('.win-rate-slot.is-active').getBoundingClientRect(),
      grid = document.querySelector('#win-rate-picker-grid');
    return {
      beside: sheet.left >= slot.right,
      above: sheet.top >= slot.bottom,
      half: sheet.height <= innerHeight / 2 + 1,
      fits: sheet.right <= innerWidth + 1 && sheet.bottom <= innerHeight + 1,
      scrolls: grid.scrollHeight - grid.clientHeight > 1,
    };
  });
for (const [width, height, layout] of [
  [320, 568, 'bottom'],
  [390, 844, 'bottom'],
  [600, 904, 'bottom'],
  [768, 1024, 'bottom'],
  [820, 1180, 'bottom'],
  [1024, 768, 'bottom'],
  [1180, 820, 'bottom'],
  [960, 544, 'side'],
]) {
  test(`picker leaves the slot being filled in view at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await openCalculator(page);
    await hole(page, 0).click();
    await pick(page, '0-14', '0-13');
    await hole(page, 1).click();
    await pick(page, '0-8', '0-7');
    await page.locator('#win-rate-add').click();
    await hole(page, 2).click();
    await pickerSettled(page);
    const clear = await sheetClear(page);
    expect(clear.fits).toBe(true);
    if (layout === 'side') expect(clear.beside).toBe(true);
    else expect(clear).toMatchObject({ above: true, half: true });
    // Only a phone has to scroll the deck; wider sheets show all four suits.
    expect(clear.scrolls).toBe(width <= 560);
  });
}

test('rotating with the picker open keeps the slot in view and restores the page', async ({
  page,
}) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await openCalculator(page);
  await hole(page, 0).click();
  await pick(page, '0-14', '0-13');
  await hole(page, 1).click();
  await pick(page, '0-8', '0-7');
  await page.locator('#win-rate-add').click();
  await page.locator('#win-rate-add').click();
  await hole(page, 3).click();
  await pickerSettled(page);
  for (const [width, height, place] of [
    [1024, 768, 'above'],
    [960, 544, 'beside'],
    [600, 904, 'above'],
  ]) {
    await page.setViewportSize({ width, height });
    await expect(page.locator('#win-rate-picker')).toBeVisible();
    await expect.poll(async () => (await sheetClear(page))[place]).toBe(true);
    expect((await page.locator('#win-rate-picker').boundingBox()).x).toBeGreaterThanOrEqual(0);
  }
  await pick(page, '2-10');
  await expect(page.locator('#win-rate-picker-title')).toHaveText('对手 3 的第 2 张底牌');
  await page.locator('#win-rate-picker-back').click();
  await expect(page.locator('#win-rate-picker')).not.toBeVisible();
  expect(await page.locator('.win-rate-body').evaluate((body) => body.style.paddingBottom)).toBe(
    '',
  );
});

test('the phone deck scrolls from the top and stays put between picks', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openCalculator(page);
  const grid = page.locator('#win-rate-picker-grid');
  const top = () => grid.evaluate((element) => element.scrollTop);
  await hole(page, 0).click();
  await pickerSettled(page);
  expect(await top()).toBe(0);
  await pick(page, '3-2');
  const kept = await top();
  expect(kept).toBeGreaterThan(0);
  await page.locator('#win-rate-picker-back').click();
  await hole(page, 1).click();
  await pickerSettled(page);
  expect(await top()).toBe(0);
  // Editing a filled slot brings its current card back into view.
  await page.locator('#win-rate-picker-back').click();
  await hole(page, 0).click();
  await pickerSettled(page);
  await expect(page.locator('[data-pick="3-2"]')).toBeInViewport();
});

// tablet.css only applies with a touch pointer, so these run on an emulated tablet.
for (const [width, height, layout] of [
  [768, 1024, 'bottom'],
  [820, 1180, 'bottom'],
  [1024, 768, 'bottom'],
  [1180, 820, 'bottom'],
  [960, 700, 'side'],
]) {
  test(`touch tablet sizing fits the calculator at ${width}x${height}`, async ({
    browser,
    baseURL,
  }) => {
    const context = await browser.newContext({
      baseURL,
      locale: 'zh-CN',
      hasTouch: true,
      isMobile: true,
      viewport: { width, height },
      screen: { width, height },
    });
    const page = await context.newPage();
    try {
      await openCalculator(page);
      const readings = await page.evaluate(() => ({
        title: parseFloat(getComputedStyle(document.querySelector('#win-rate-title')).fontSize),
        slot: document.querySelector('.win-rate-slot').getBoundingClientRect().width,
        overflow: document.documentElement.scrollWidth > innerWidth,
      }));
      expect(readings).toEqual({ title: 24, slot: 52, overflow: false });
      await hole(page, 0).click();
      await pick(page, '0-14', '0-13');
      await hole(page, 1).click();
      await pick(page, '0-8', '0-7');
      await page.locator('#win-rate-add').click();
      await hole(page, 2).click();
      await pickerSettled(page);
      const clear = await sheetClear(page);
      expect(clear).toMatchObject({ fits: true, scrolls: false });
      if (layout === 'side') {
        expect(clear.beside).toBe(true);
        const sheet = await page.locator('#win-rate-picker').boundingBox();
        const river = await page.locator('[data-board="4"]').boundingBox();
        expect(river.x + river.width).toBeLessThanOrEqual(sheet.x);
      } else expect(clear).toMatchObject({ above: true, half: true });
    } finally {
      await context.close();
    }
  });
}

test('native safe areas keep the calculator controls clear of system bars', async ({ page }) => {
  await openCalculator(page);
  await page.evaluate(() => {
    document.documentElement.classList.add('native-app');
    document.documentElement.style.setProperty('--safe-area-inset-top', '44px');
    document.documentElement.style.setProperty('--safe-area-inset-bottom', '34px');
  });
  const viewport = page.viewportSize();
  expect((await page.locator('.win-rate-header').boundingBox()).y).toBeGreaterThanOrEqual(44);
  const clear = await page.locator('#win-rate-clear').boundingBox();
  expect(clear.y + clear.height).toBeLessThanOrEqual(viewport.height - 34);
  await hole(page, 0).click();
  await pickerSettled(page);
  const back = await page.locator('#win-rate-picker-back').boundingBox();
  expect(back.y + back.height).toBeLessThanOrEqual(viewport.height - 34);
});

for (const locale of ['en', 'ko', 'es', 'it', 'pt', 'de', 'fr', 'ru']) {
  test(`calculator is fully localized in ${locale}`, async ({ page }) => {
    await page.addInitScript((value) => localStorage.setItem('noir-locale', value), locale);
    await openCalculator(page);
    await dealReferenceHand(page);
    await page.locator('[data-board="3"]').click();
    const text = await page.evaluate(() =>
      [...document.querySelectorAll('#win-rate-dialog, #win-rate-picker')]
        .flatMap((root) => [
          root.innerText,
          ...[...root.querySelectorAll('[aria-label]')].map((node) =>
            node.getAttribute('aria-label'),
          ),
          ...[...root.querySelectorAll('.sr-only')].map((node) => node.textContent),
        ])
        .join('\n'),
    );
    expect(text).not.toMatch(/\p{Script=Han}/u);
    await page.locator('#win-rate-picker-back').click();
    const seat = await page
      .locator('.win-rate-odds')
      .first()
      .evaluate((element) => ({
        overflow: element.scrollWidth <= element.clientWidth + 1,
      }));
    expect(seat.overflow).toBe(true);
  });
}

test('Back closes the calculator and stays on the table; the close button leaves no extra entry', async ({
  page,
}) => {
  await openCalculator(page);
  const url = page.url();
  await page.goBack();
  await expect(page.locator('#win-rate-dialog')).toBeHidden();
  expect(page.url()).toBe(url);
  await expect(page.locator('html')).toHaveAttribute('data-app-ready', 'true');
  const length = await page.evaluate(() => history.length);
  await page.locator('#rules-button').click();
  await page.locator('#win-rate-menu-item').click();
  await expect(page.locator('#win-rate-dialog')).toBeVisible();
  await page.locator('#win-rate-dialog .close-dialog').click();
  await expect(page.locator('#win-rate-dialog')).toBeHidden();
  // The entry the calculator pushed is popped again when it closes itself.
  await expect.poll(() => page.evaluate(() => history.state?.noirLayer ?? null)).toBeNull();
  // Reopening replaced the forward entry left by Back, so the history did not grow.
  expect(await page.evaluate(() => history.length)).toBe(length);
});

test('the header and board stay at the top while the seats scroll', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await openCalculator(page);
  for (let i = 0; i < 4; i++) await page.locator('#win-rate-add').click();
  const top = () =>
    page.evaluate(() => ({
      header: document.querySelector('.win-rate-header').getBoundingClientRect().top,
      board: document.querySelector('.win-rate-felt').getBoundingClientRect().top,
      seats: document.querySelector('.win-rate-seats').getBoundingClientRect().top,
    }));
  const before = await top();
  await page.locator('.win-rate-body').evaluate((body) => (body.scrollTop = body.scrollHeight));
  const after = await top();
  expect(await page.locator('.win-rate-body').evaluate((body) => body.scrollTop)).toBeGreaterThan(
    0,
  );
  expect(after.header).toBe(before.header);
  expect(after.board).toBe(before.board);
  expect(after.seats).toBeLessThan(before.seats);
  // Scrolled seats pass under the board, never over it.
  const felt = await page.locator('.win-rate-felt').boundingBox();
  const body = await page.locator('.win-rate-body').boundingBox();
  expect(body.y).toBeGreaterThanOrEqual(felt.y + felt.height);
});
