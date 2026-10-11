import { test, expect } from '@playwright/test';
import { readTableLayout, assertTableLayout } from '../native/layout.mjs';
import { openSettings, closeSettings } from './settings-helpers.js';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.qa);
  await page.evaluate(() => {
    window.qa.stop();
    return document.fonts.ready;
  });
});

test('first deal, its filled animation and the next render keep opponent backs half tucked', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  for (const size of [
    { width: 375, height: 667 },
    { width: 390, height: 844 },
    { width: 440, height: 956 },
    { width: 768, height: 1024 },
    { width: 1032, height: 1376 },
    { width: 1280, height: 900 },
  ]) {
    await page.setViewportSize(size);
    for (const count of [5, 9]) {
      await page.evaluate((count) => {
        window.qa.heroTurn(count);
        for (const animation of document.querySelector('#arena').getAnimations({ subtree: true }))
          animation.pause();
      }, count);
      await expect(page.locator('.seat .card-back.card-deal')).toHaveCount((count - 1) * 2);
      await expect(page.locator('.seat .playing-card.small')).toHaveCount(0);
      let filled;
      for (const phase of [-1, 300, 600, 1200]) {
        await page.evaluate((phase) => {
          for (const back of document.querySelectorAll('.seat .card-back')) {
            const animation = back.getAnimations()[0];
            animation.currentTime = Number(animation.effect.getTiming().delay) + phase;
          }
        }, phase);
        const layout = await page.evaluate(readTableLayout);
        assertTableLayout(layout);
        if (phase === 1200)
          filled = await page.locator('.seat .card-back').evaluateAll((backs) =>
            backs.map((back) => {
              const r = back.getBoundingClientRect();
              return { top: r.top, height: r.height };
            }),
          );
      }
      await page.evaluate(() => window.qa.raiseActions());
      await expect(page.locator('.seat .card-back.card-deal')).toHaveCount(0);
      const next = await page.locator('.seat .card-back').evaluateAll((backs) =>
        backs.map((back) => {
          const r = back.getBoundingClientRect();
          return { top: r.top, height: r.height };
        }),
      );
      for (let i = 0; i < filled.length; i++)
        for (const edge of ['top', 'height'])
          expect(Math.abs(next[i][edge] - filled[i][edge])).toBeLessThanOrEqual(1);
    }
  }
});

for (const locale of ['zh-CN', 'en']) {
  test(`hero identity and action type stay coordinated through settlement in ${locale}`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.evaluate((locale) => localStorage.setItem('noir-locale', locale), locale);
    await page.reload();
    await page.waitForFunction(() => !!window.qa);
    await page.evaluate(() => {
      window.qa.stop();
      return document.fonts.ready;
    });
    for (const size of [
      { width: 375, height: 667 },
      { width: 440, height: 956 },
      { width: 768, height: 1024 },
      { width: 960, height: 1440 },
      { width: 1032, height: 1376 },
    ]) {
      await page.setViewportSize(size);
      for (const count of [5, 9]) {
        await page.evaluate((count) => window.qa.heroTurn(count), count);
        const before = await page.evaluate(readTableLayout);
        assertTableLayout(before);
        await page.evaluate(
          (count) => window.qa.scene('Kh Ts', '9s 7d 6h 3c 2s', { count, folded: [0, 1] }),
          count,
        );
        const after = await page.evaluate(readTableLayout);
        assertTableLayout(after);
        for (const anchor of ['arena', 'publicArea'])
          for (const edge of ['top', 'left', 'right', 'height'])
            expect(Math.abs(after[anchor][edge] - before[anchor][edge])).toBeLessThanOrEqual(1);
        for (const edge of ['top', 'height'])
          expect(Math.abs(after.identity[edge] - before.identity[edge])).toBeLessThanOrEqual(1);
        // Chip digits can change the row's width. Its center stays anchored.
        expect(
          Math.abs(
            after.identity.left +
              after.identity.right -
              before.identity.left -
              before.identity.right,
          ),
        ).toBeLessThanOrEqual(2);
        const clearance = await page.evaluate(() => {
          const badge = document.querySelector('#hero-hand-rank').getBoundingClientRect(),
            identity = document.querySelector('.hero-identity').getBoundingClientRect();
          return identity.top - badge.bottom;
        });
        expect(clearance).toBeGreaterThanOrEqual(0);
      }
    }
  });

  test(`crown seats straddle the rail and chips leave room for named style tags in ${locale}`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.evaluate((locale) => localStorage.setItem('noir-locale', locale), locale);
    await page.reload();
    await page.waitForFunction(() => !!window.qa);
    await openSettings(page);
    await page.locator('#mix-opponents').click();
    await closeSettings(page);
    for (const size of [
      { width: 375, height: 667 },
      { width: 440, height: 956 },
      { width: 1032, height: 1376 },
    ]) {
      await page.setViewportSize(size);
      for (const count of [6, 8]) {
        await page.evaluate((count) => window.qa.heroTurn(count), count);
        const measure = () =>
          page.evaluate(() => {
            const crown = document
              .querySelector('.seat-crown .seat-profile')
              .getBoundingClientRect();
            const felt = document.querySelector('.poker-table').getBoundingClientRect();
            const seats = [...document.querySelectorAll('.seat-profile')].map((profile) => {
              const tag = profile.querySelector('.seat-style-label'),
                t = tag.getBoundingClientRect(),
                stack = profile.querySelector('.seat-stack').getBoundingClientRect();
              return { below: stack.top >= t.bottom, full: tag.scrollWidth <= tag.clientWidth + 1 };
            });
            return { straddles: crown.top < felt.top && crown.bottom > felt.top, seats };
          });
        const before = await measure();
        expect(before.straddles).toBe(true);
        expect(before.seats.every((seat) => seat.below)).toBe(true);
        expect(before.seats.filter((seat) => seat.full).length).toBeGreaterThanOrEqual(
          Math.ceil(before.seats.length / 2),
        );
        await page.evaluate(
          (count) => window.qa.scene('Kh Ts', '9s 7d 6h 3c 2s', { count, folded: [0, 1] }),
          count,
        );
        const after = await measure();
        expect(after).toEqual(before);
        assertTableLayout(await page.evaluate(readTableLayout));
      }
    }
  });
}
