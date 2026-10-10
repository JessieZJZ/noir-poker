import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.qa);
  await page.evaluate(() => {
    window.qa.stop();
    return document.fonts.ready;
  });
});

test('compact table controls keep blinds aligned and the adjacent reset button follows all page content', async ({
  page,
}) => {
  await expect(page.locator('.table-heading, #table-tag')).toHaveCount(0);
  await expect(page.locator('.surface-top #difficulty')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '对手设置', exact: true })).toBeVisible();
  await expect(page.locator('#opponents-dialog #difficulty')).toHaveCount(1);
  // The native platform appends this same button to the footer.
  await page.evaluate(() => {
    const button = document.createElement('button');
    button.id = 'native-about-button';
    button.textContent = '关于与隐私';
    document.querySelector('.table-footer').append(button);
  });
  for (const width of [320, 390, 768, 1280, 1700]) {
    await page.setViewportSize({ width, height: 900 });
    for (const count of [5, 6, 7, 8, 9]) {
      for (const settled of [false, true]) {
        await page.evaluate(
          ({ count, settled }) =>
            settled ? window.qa.foldWin(count, 2) : window.qa.heroTurn(count),
          { count, settled },
        );
        const layout = await page.evaluate(() => {
          const box = (selector) => document.querySelector(selector).getBoundingClientRect();
          const hand = box('.hand-label'),
            blinds = box('.blind-info'),
            settings = box('#opponents-button'),
            count = box('#player-count'),
            countControl = box('.surface-top .difficulty-label'),
            footer = box('.site-footer'),
            status = box('.practice-info > span'),
            reset = box('#reset-button'),
            about = box('#native-about-button');
          const middle = (r) => (r.top + r.bottom) / 2;
          return {
            blindsOnRight: blinds.left > hand.right,
            blindsAligned: Math.abs(middle(hand) - middle(blinds)) < 1,
            settingsBelowHand: settings.top >= hand.bottom,
            countOnRight: count.left > settings.right,
            settingsAligned: Math.abs(middle(settings) - middle(count)) < 1,
            settingsAdjacent: Math.abs(countControl.left - settings.right - 16) < 1,
            footerAtEnd: document.querySelector('.main').lastElementChild.matches('.site-footer'),
            footerAfterContent:
              footer.top >= Math.max(box('.game-column').bottom, box('.sidebar').bottom),
            resetAdjacent:
              Math.abs(middle(status) - middle(reset)) < 1 &&
              reset.left - status.right >= 8 &&
              reset.left - status.right <= 12,
            buttonsFit: [reset, about].every((r) => r.left >= 0 && r.right <= innerWidth),
            noOverflow: document.documentElement.scrollWidth <= innerWidth,
          };
        });
        expect(
          Object.values(layout).every(Boolean),
          JSON.stringify({ width, count, settled, layout }),
        ).toBe(true);
      }
    }
  }
  await page.locator('#reset-button').click();
  await expect(page.locator('#reset-dialog')).toBeVisible();
  await page.locator('#confirm-reset').click();
  await page.evaluate(() => window.qa.stop());
  await expect(page.locator('#stat-hands')).toHaveText('0');
});

test('combined opponent settings preserve immediate difficulty and discard unsaved style drafts', async ({
  page,
}) => {
  await page.locator('#opponents-button').click();
  await expect(page.locator('#opponents-title')).toHaveText('对手设置');
  await page
    .locator('.difficulty-option')
    .filter({ has: page.locator('input[value="hard"]') })
    .click();
  await expect(page.getByLabel('进阶', { exact: true })).toBeChecked();
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('noir-table-v1')).difficulty),
  ).toBe('hard');
  await page.locator('[data-bot-seat="1"]').selectOption('viktor');
  await page.locator('#emotion-mode').selectOption('lively');
  await page.locator('#opponents-dialog .close-dialog').click();
  await page.locator('#opponents-button').click();
  await expect(page.getByLabel('进阶', { exact: true })).toBeChecked();
  await expect(page.locator('[data-bot-seat="1"]')).toHaveValue('balanced');
  await expect(page.locator('#emotion-mode')).toHaveValue('subtle');
  await page.getByLabel('进阶', { exact: true }).focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByLabel('标准', { exact: true })).toBeChecked();
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('noir-table-v1')).difficulty),
  ).toBe('normal');
  await page.locator('#opponents-dialog .close-dialog').click();
  await page.reload();
  await page.waitForFunction(() => !!window.qa);
  await page.locator('#opponents-button').click();
  await expect(page.getByLabel('标准', { exact: true })).toBeChecked();
  await expect(page.locator('[data-bot-seat="1"]')).toHaveValue('balanced');
  await expect(page.locator('#save-opponents')).toBeVisible();
});
