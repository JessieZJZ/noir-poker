import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.qa);
  await page.evaluate(() => {
    window.qa.stop();
    return document.fonts.ready;
  });
});

test('one header settings control replaces table options and the footer follows all page content', async ({
  page,
}) => {
  await expect(page.locator('.table-heading, #table-tag, .table-settings')).toHaveCount(0);
  await expect(
    page.locator(
      '.surface-top #difficulty, .surface-top #player-count, .surface-top #opponents-button',
    ),
  ).toHaveCount(0);
  await expect(page.getByRole('button', { name: '设置', exact: true })).toBeVisible();
  await expect(page.locator('.header-actions button')).toHaveCount(2);
  await expect(page.locator('#opponents-dialog #difficulty')).toHaveCount(1);
  await expect(page.locator('#opponents-dialog #player-count')).toHaveCount(1);
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
            rules = box('#rules-button'),
            footer = box('.site-footer'),
            status = box('.practice-info > span'),
            reset = box('#reset-button'),
            about = box('#native-about-button');
          const middle = (r) => (r.top + r.bottom) / 2;
          return {
            blindsOnRight: blinds.left > hand.right,
            blindsAligned: Math.abs(middle(hand) - middle(blinds)) < 1,
            settingsBeforeRules: settings.right <= rules.left,
            settingsAligned: Math.abs(middle(settings) - middle(rules)) < 1,
            settingsFit: settings.left >= 0 && settings.height >= 44 && rules.right <= innerWidth,
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

test('mobile settings fill the screen, use accessible switches and return focus when dismissed', async ({
  page,
}) => {
  for (const size of [
    { width: 320, height: 667 },
    { width: 390, height: 844 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(size);
    await page.locator('#opponents-button').click();
    await expect(page.locator('#opponents-title')).toHaveText('设置');
    await expect(page.getByRole('switch', { name: '音效', exact: true })).toBeChecked();
    await expect(page.getByRole('switch', { name: '牌桌提示', exact: true })).toBeChecked();
    const layout = await page.locator('#opponents-dialog').evaluate((el) => {
      const r = el.getBoundingClientRect(),
        body = el.querySelector('.opponents-body');
      return {
        top: r.top,
        left: r.left,
        width: r.width,
        height: r.height,
        viewportWidth: innerWidth,
        viewportHeight: innerHeight,
        bodyScrollable:
          body.scrollHeight > body.clientHeight &&
          ['auto', 'scroll'].includes(getComputedStyle(body).overflowY),
      };
    });
    expect(layout.top).toBeCloseTo(0, 0);
    expect(layout.left).toBeCloseTo(0, 0);
    expect(layout.width).toBeCloseTo(layout.viewportWidth, 0);
    expect(layout.height).toBeCloseTo(layout.viewportHeight, 0);
    expect(layout.bodyScrollable).toBe(true);
    await page.keyboard.press('Escape');
    await expect(page.locator('#opponents-dialog')).toBeHidden();
    await expect(page.locator('#opponents-button')).toBeFocused();
  }
});

test('combined settings immediately save preferences without changing the current hand', async ({
  page,
}) => {
  await page.locator('#opponents-button').click();
  await expect(page.locator('#opponents-title')).toHaveText('设置');
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
  await expect(page.locator('[data-bot-seat="1"]')).toHaveValue('viktor');
  await expect(page.locator('#emotion-mode')).toHaveValue('lively');
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
  await expect(page.locator('[data-bot-seat="1"]')).toHaveValue('viktor');
  await expect(page.locator('#save-opponents')).toHaveCount(0);
});

test('desktop actions keep one-line labels and aligned button rows before and after settlement', async ({
  page,
}) => {
  for (const width of [1000, 1280, 1700]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const settled of [false, true]) {
      await page.evaluate(
        (settled) => (settled ? window.qa.foldWin(9) : window.qa.heroTurn(9)),
        settled,
      );
      if (!settled) await page.locator('[data-preset="all"]').click();
      await expect
        .poll(() =>
          page.evaluate((settled) => {
            const ids = settled
              ? ['#next-button', '#restart-hand-button', '#review-hand-button']
              : ['#raise-button', '#fold-button', '#call-button'];
            const issues = [],
              buttons = ids.map((id) => document.querySelector(id));
            const bounds = buttons.map((el) => el.getBoundingClientRect());
            if (Math.max(...bounds.map((r) => r.top)) - Math.min(...bounds.map((r) => r.top)) > 1)
              issues.push('buttons do not share a row');
            for (const [index, button] of buttons.entries()) {
              const walker = document.createTreeWalker(button, NodeFilter.SHOW_TEXT);
              const lines = [];
              while (walker.nextNode()) {
                const node = walker.currentNode;
                if (
                  !node.textContent.trim() ||
                  getComputedStyle(node.parentElement).display === 'none'
                )
                  continue;
                const range = document.createRange();
                range.selectNodeContents(node);
                lines.push(
                  ...[...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0),
                );
              }
              if (
                !lines.length ||
                Math.max(...lines.map((r) => r.top)) - Math.min(...lines.map((r) => r.top)) > 10
              )
                issues.push(`${ids[index]} text wraps`);
              const box = bounds[index];
              if (lines.some((r) => r.left < box.left || r.right > box.right))
                issues.push(`${ids[index]} text overflows button`);
            }
            return issues;
          }, settled),
        )
        .toEqual([]);
    }
  }
});

test('retry explanation stays aligned directly under the hand header and the desktop columns end together', async ({
  page,
}) => {
  for (const width of [1000, 1280, 1700]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(() => window.qa.foldWin(9));
    await page.locator('#restart-hand-button').click();
    await page.evaluate(() => window.qa.stop());
    await expect(page.locator('#replay-note')).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() => {
          const box = (selector) => document.querySelector(selector).getBoundingClientRect();
          const hand = box('.hand-label'),
            note = box('#replay-note'),
            table = box('.table-viewport');
          const header = document.querySelector('.surface-top'),
            sidebar = box('.sidebar'),
            footer = box('.site-footer');
          const surface = box('.game-surface');
          const activity = document.querySelector('#activity-list');
          const issues = [];
          if (!header.contains(document.querySelector('#replay-note')))
            issues.push('retry note is outside header');
          if (note.top < hand.bottom || note.top - hand.bottom > 34)
            issues.push('retry note is far below the hand');
          if (Math.abs(note.left - hand.left) > 1)
            issues.push('retry note is not aligned with the hand');
          if (note.bottom > table.top) issues.push('retry note covers the table');
          if (Math.abs(surface.bottom - sidebar.bottom) > 2)
            issues.push('desktop columns end at different heights');
          if (
            footer.top < Math.max(surface.bottom, sidebar.bottom) ||
            footer.top - Math.max(surface.bottom, sidebar.bottom) > 32
          )
            issues.push('extra blank strip before footer');
          if (
            !['auto', 'scroll'].includes(getComputedStyle(activity).overflowY) ||
            activity.clientHeight <= 0
          )
            issues.push('activity timeline has no usable independent scroll area');
          return issues;
        }),
      )
      .toEqual([]);
  }
});
