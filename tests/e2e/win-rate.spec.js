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
    '玩法指南',
    '对局记录',
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
  await expect(page.locator('#win-rate-status')).toHaveText('选满两位玩家的底牌后自动计算。');
  await hole(page, 0).click();
  await expect(page.locator('#win-rate-picker-title')).toHaveText('你的第 1 张底牌');
  await pick(page, '0-14');
  await expect(page.locator('#win-rate-picker-title')).toHaveText('你的第 2 张底牌');
  await expect(page.locator('[data-pick="0-14"]')).toBeDisabled();
  await pick(page, '0-13');
  await expect(page.locator('#win-rate-picker')).toBeHidden();
  await hole(page, 1).click();
  await pick(page, '0-8', '0-7');
  await expect(page.locator('#win-rate-status')).toContainText('1,712,304');
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
  await expect(seats.nth(0).locator('.win-rate-outs-cards .playing-card')).toHaveCount(8);
  await seats.nth(0).getByRole('button', { name: '展开' }).click();
  await expect(seats.nth(0).locator('.win-rate-outs-cards .playing-card')).toHaveCount(12);
  await seats.nth(0).getByRole('button', { name: '收起' }).click();
  await expect(seats.nth(0).locator('.win-rate-outs-cards .playing-card')).toHaveCount(8);
  await expect(seats.nth(1).locator('.win-rate-outs-heading b')).toHaveText('0');
  await expect(seats.nth(2).locator('.win-rate-outs')).toHaveCount(0);
  await expect(page.locator('#win-rate-outs-note')).toBeVisible();
});

test('opponents can be removed and every card can be unset or cleared', async ({ page }) => {
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
  await page.locator('#win-rate-unset').click();
  await expect(page.locator('[data-board="1"] .playing-card')).toHaveCount(0);
  await expect(page.locator('#win-rate-picker')).toBeHidden();
  await expect(page.locator('.win-rate-outs')).toHaveCount(0);
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
    await expect(page.locator('#win-rate-unset')).toBeInViewport();
    await pickerSettled(page);
    const box = await page.locator('#win-rate-picker').boundingBox();
    expect(box.y + box.height).toBeLessThanOrEqual(height + 1);
    expect(box.width).toBeLessThanOrEqual(width);
    const grid = page.locator('#win-rate-picker-grid');
    await grid.evaluate((element) => (element.scrollTop = element.scrollHeight));
    await expect(page.locator('[data-pick="3-2"]')).toBeInViewport();
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
  const unset = await page.locator('#win-rate-unset').boundingBox();
  expect(unset.y + unset.height).toBeLessThanOrEqual(viewport.height - 34);
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
