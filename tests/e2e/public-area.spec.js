import { test, expect } from '@playwright/test';

test('public area clears player cards and labels with pot details to the right in every table mode', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.waitForFunction(() => !!window.qa);
  await page.evaluate(() => document.fonts.ready);
  for (const named of [false, true]) {
    if (named) {
      await page.locator('#opponents-button').click();
      await page.locator('#mix-opponents').click();
      await page.locator('#save-opponents').click();
    }
    for (const width of [320, 390, 768, 1115, 1280, 1700]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const count of [5, 6, 7, 8, 9]) {
        await page.evaluate((count) => window.qa.publicBoard(count), count);
        await expect
          .poll(() =>
            page.evaluate(() => {
              const box = (selector) => document.querySelector(selector).getBoundingClientRect();
              const overlaps = (a, b) =>
                a.left < b.right - 0.5 &&
                a.right > b.left + 0.5 &&
                a.top < b.bottom - 0.5 &&
                a.bottom > b.top + 0.5;
              const problems = [];
              const amount = box('#pot-value'),
                details = box('#pot-details-button'),
                arena = box('#arena');
              if (
                details.left < amount.right + 4 ||
                Math.abs((details.top + details.bottom - amount.top - amount.bottom) / 2) > 1
              )
                problems.push('details not aligned to right of amount');
              for (const selector of ['.pot', '#board', '#board-caption']) {
                const rect = box(selector);
                if (rect.left < arena.left || rect.right > arena.right)
                  problems.push(selector + ' overflow');
                for (const player of document.querySelectorAll(
                  '.seat .mini-cards, .seat-profile, .seat .seat-action, .hero-cards',
                ))
                  if (overlaps(rect, player.getBoundingClientRect()))
                    problems.push(
                      selector +
                        ' overlaps ' +
                        player.className +
                        ' seat ' +
                        player.closest('.seat')?.dataset.player,
                    );
              }
              return problems;
            }),
          )
          .toEqual([]);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
      }
    }
  }
  await page.locator('#pot-details-button').click();
  await expect(page.locator('#pot-dialog')).toBeVisible();
});
