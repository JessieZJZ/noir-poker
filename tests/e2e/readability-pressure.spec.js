import { test, expect } from '@playwright/test';
import { openSettings, closeSettings } from './settings-helpers.js';
test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.qa);
  await page.evaluate(() => {
    window.qa.foldWin(9);
    return document.fonts.ready;
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
});
test('mix is a persistent toggle and never undoes manual ownership', async ({ page }) => {
  await openSettings(page);
  await page.locator('[data-bot-seat="1"]').selectOption('rook');
  const button = page.locator('#mix-opponents');
  await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('noir-opponents-v1')));
  expect(saved.assignments[1]).toBe('rook');
  expect(saved.mixedSeats).toHaveLength(7);
  await page.locator('[data-bot-seat="3"]').selectOption('sage');
  await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'false');
  for (const id of [2, 4, 5, 6, 7, 8])
    await expect(page.locator(`[data-bot-seat="${id}"]`)).toHaveValue('balanced');
  await expect(page.locator('[data-bot-seat="1"]')).toHaveValue('rook');
  await expect(page.locator('[data-bot-seat="3"]')).toHaveValue('sage');
  await closeSettings(page);
  await page.reload();
  await page.waitForFunction(() => !!window.qa);
  await openSettings(page);
  await expect(button).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('[data-bot-seat="3"]')).toHaveValue('sage');
});
test('portraits span style and stack, cards grow on nine-seat phones, persona cards start at the top', async ({
  page,
}) => {
  for (const width of [390, 820, 1032, 1280]) {
    await page.setViewportSize({ width, height: width === 1032 ? 1376 : 900 });
    await page.evaluate(() => window.qa.foldWin(9));
    await openSettings(page);
    await expect
      .poll(() =>
        page.locator('.profile-card').evaluateAll((cards) =>
          cards.every((card) => {
            const box = card.getBoundingClientRect(),
              avatar = card.querySelector('.profile-portrait').getBoundingClientRect();
            return (
              Math.abs(avatar.top - box.top - parseFloat(getComputedStyle(card).paddingTop) - 1) < 1
            );
          }),
        ),
      )
      .toBe(true);
    await closeSettings(page);
    const metric = await page.evaluate(() => {
      const card = document.querySelector('#board > *').getBoundingClientRect();
      const rows = [...document.querySelectorAll('.seat-profile')].map((row) => {
        const a = row.querySelector('.avatar').getBoundingClientRect(),
          s = row.querySelector('.seat-style-label').getBoundingClientRect(),
          c = row.querySelector('.seat-stack').getBoundingClientRect();
        return {
          span: a.top <= s.top + 1 && a.bottom >= c.bottom - 1,
          beside: a.right <= Math.min(s.left, c.left),
          size: a.width,
        };
      });
      return { card: card.width, rows };
    });
    expect(metric.rows.every((row) => row.span && row.beside)).toBe(true);
    if (width === 390) expect(metric.card).toBeGreaterThan(37);
  }
  await page.screenshot({ path: test.info().outputPath('larger-board-and-portraits.png') });
});
test('guide shows every hand and position in each supported locale', async ({ page }) => {
  await page.locator('#rules-button').click();
  await page.locator('#guide-menu-item').click();
  await expect(page.locator('.hand-example')).toHaveCount(9);
  await expect(page.locator('.guide-card')).toHaveCount(45);
  await expect(page.locator('.position-glossary')).toContainText('HJ · Hijack');
  for (const locale of ['en', 'zh-TW', 'ja', 'ko', 'es', 'it', 'pt', 'de', 'fr', 'ru', 'zh-CN']) {
    await page.locator('#rules-dialog .close-dialog').first().click();
    await openSettings(page);
    await page.locator('#language-select').selectOption(locale);
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await closeSettings(page);
    await page.locator('#rules-button').click();
    await page.locator('#guide-menu-item').click();
    await expect(page.locator('.guide-card')).toHaveCount(45);
    if (!['zh-CN', 'zh-TW', 'ja'].includes(locale))
      expect(await page.locator('.hand-examples').textContent()).not.toMatch(/\p{Script=Han}/u);
  }
  await page.locator('.hand-examples').scrollIntoViewIfNeeded();
  await page
    .locator('#rules-dialog')
    .screenshot({ path: test.info().outputPath('visual-beginner-guide.png') });
});

test('hero turn vibrates once and changing settings cannot retrigger it', async ({ page }) => {
  await page.evaluate(() => {
    window.turnVibrations = [];
    navigator.vibrate = (ms) => {
      window.turnVibrations.push(ms);
      return true;
    };
    window.qa.heroTurn(6);
  });
  await expect.poll(() => page.evaluate(() => window.turnVibrations)).toEqual([50]);
  await openSettings(page);
  await page
    .locator('#difficulty .difficulty-option')
    .filter({ has: page.locator('input[value="hard"]') })
    .click();
  await closeSettings(page);
  expect(await page.evaluate(() => window.turnVibrations)).toEqual([50]);
  await page.locator('#fold-button').click();
  await page.evaluate(() => window.qa.stop());
  expect(await page.evaluate(() => window.turnVibrations)).toEqual([50]);
});
