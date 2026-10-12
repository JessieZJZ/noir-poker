import { assignNamedLineup } from './settings-helpers.js';
import { test, expect } from '@playwright/test';
import { closeSettings } from './settings-helpers.js';

async function expectSeatsClear(page) {
  const issues = () =>
    page.evaluate(() => {
      const arenaElement = document.querySelector('#arena'),
        arena = (
          matchMedia('(max-width: 900px), (max-width: 1100px) and (orientation: portrait)').matches
            ? document.querySelector('.table-viewport')
            : arenaElement
        ).getBoundingClientRect(),
        board = document.querySelector('#board').getBoundingClientRect(),
        seats = [...document.querySelectorAll('.seat')],
        overlap = (a, b) =>
          a.left < b.right - 0.5 &&
          a.right > b.left + 0.5 &&
          a.top < b.bottom - 0.5 &&
          a.bottom > b.top + 0.5;
      const parts = (seat) =>
        [...seat.querySelectorAll('.mini-cards, .seat-profile, .hand-rank, .seat-action')].filter(
          (el) => !el.hidden && getComputedStyle(el).display !== 'none',
        );
      const issues = [];
      for (const [i, seat] of seats.entries()) {
        for (const part of parts(seat)) {
          const box = part.getBoundingClientRect();
          if (overlap(box, board)) issues.push(`seat ${seat.dataset.player} overlaps public board`);
          if (box.top < arena.top - 1 || box.bottom > arena.bottom + 1)
            issues.push(`seat ${seat.dataset.player} outside arena`);
          for (const other of seats.slice(i + 1))
            for (const target of parts(other))
              if (overlap(box, target.getBoundingClientRect()))
                issues.push(
                  `seats ${seat.dataset.player}/${other.dataset.player}: ${part.className}/${target.className}`,
                );
        }
      }
      return issues;
    });
  await expect.poll(issues).toEqual([]);
}

test('settled nine-seat actions clear other card backs, profiles and the section below', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.waitForFunction(() => !!window.qa);
  await page.evaluate(() => document.fonts.ready);
  for (const named of [false, true]) {
    if (named) {
      await page.locator('#opponents-button').click();
      await assignNamedLineup(page);
      await closeSettings(page);
    }
    for (const width of [320, 390, 768, 1115, 1280]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.evaluate(() =>
        window.qa.scene('Td 8c', 'Ks 2c 2h 2s 6h', {
          count: 9,
          totals: [5000, 25, 50, 50, 50, 1125, 5000, 0, 5000],
          folded: [1, 2, 3, 4, 5, 7],
          otherHoles: { 6: 'Th Kd', 8: '7d 7h' },
        }),
      );
      await expectSeatsClear(page);
      await expect(page.locator('.seat-6 .winner-indicator')).toBeVisible();
      await expect(page.locator('.seat-7 .seat-action')).toHaveText('弃牌');
      // Revealing a folded hand grows its footprint; resizing must remeasure it.
      await page.locator('.seat-7 .seat-peek').click();
      await expectSeatsClear(page);
      await page.locator('.seat-7 .seat-peek').click();
      await expectSeatsClear(page);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    }
  }
  expect(errors).toEqual([]);
});

test('all-in settlement retains every recent action without crowding at any table size', async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.goto('/');
  await page.waitForFunction(() => !!window.qa);
  await page.evaluate(() => document.fonts.ready);
  for (const count of [5, 6, 7, 8, 9]) {
    await page.evaluate((count) => {
      window.qa.heroTurn(count);
      while (window.noir.getState().phase !== 'done') {
        window.qa.allinRest();
        window.qa.finish();
      }
    }, count);
    for (const width of [320, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: 1000 });
      await expect
        .poll(() => page.locator('#arena').evaluate((el) => el.clientWidth))
        .toBeGreaterThan(0);
      await expectSeatsClear(page);
      await expect(page.locator('.seat .seat-action')).toHaveCount(count - 1);
      for (const text of await page.locator('.seat .seat-action').allTextContents())
        expect(text).toContain('全下');
      await expect(page.locator('#hero-last-action')).toContainText('全下');
    }
    await page.evaluate((count) => window.qa.heroTurn(count), count);
    await expect(page.locator('#arena')).not.toHaveClass(/is-done/);
    // Live layout can reserve two-line captions. Reset must reproduce the
    // fresh live geometry rather than retaining a settlement measurement.
    const resetHeight = await page.locator('#arena').evaluate((el) => el.style.minHeight);
    await page.reload();
    await page.waitForFunction(() => !!window.qa);
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate((count) => window.qa.heroTurn(count), count);
    expect(await page.locator('#arena').evaluate((el) => el.style.minHeight)).toBe(resetHeight);
  }
});
