import { test, expect } from '@playwright/test';
import { openSettings, closeSettings } from './settings-helpers.js';
import { readTableLayout, assertTableLayout } from '../native/layout.mjs';
test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.waitForFunction(() => !!window.qa);
  await page.evaluate(() => {
    window.qa.stop();
    return document.fonts.ready;
  });
});
test('wide live tables and controls fit the first screen at every player count', async ({
  page,
}) => {
  for (const width of [963, 1024, 1280, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    for (const count of [5, 6, 7, 8, 9]) {
      await page.evaluate((count) => window.qa.heroTurn(count), count);
      await expect
        .poll(() =>
          page.locator('.action-dock').evaluate((el) => el.getBoundingClientRect().bottom),
        )
        .toBeLessThanOrEqual(893);
      await expect
        .poll(() =>
          page.locator('.action-dock').evaluate((el) => el.getBoundingClientRect().bottom),
        )
        .toBeGreaterThan(890);
      assertTableLayout(await page.evaluate(readTableLayout));
      const density = await page.evaluate(() => {
        const felt = document.querySelector('.poker-table').getBoundingClientRect();
        return {
          aspect: felt.width / felt.height,
          card: document.querySelector('#board > *').getBoundingClientRect().width,
          profile: document.querySelector('.seat-profile').getBoundingClientRect().width,
        };
      });
      expect(density.aspect).toBeLessThan(1.9);
      expect(density.card).toBeGreaterThan(48);
      expect(density.profile).toBeGreaterThan(90);
    }
  }
});
test('wide hero and opponent actions preserve the page scroll position', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.evaluate(() => window.qa.heroTurn(7));
  await page.waitForTimeout(100);
  await page.evaluate(() => window.scrollTo(0, 40));
  const before = await page.evaluate(() => scrollY);
  expect(before).toBeGreaterThan(0);
  await page.locator('#call-button').click();
  await page.evaluate(() => {
    window.qa.stop();
    window.qa.respondToHero();
  });
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(before);
});
test('live and settlement buttons share the compact height without resizing the table', async ({
  page,
}) => {
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const count of [5, 6, 7, 8, 9]) {
      await page.evaluate((count) => window.qa.heroTurn(count), count);
      const read = () => ({
        table: document.querySelector('.table-viewport').getBoundingClientRect().height,
        buttons: [
          ...document.querySelectorAll(
            '.action-panel .action, .action-panel > button:not([hidden])',
          ),
        ]
          .filter((el) => el.offsetHeight > 0)
          .map((el) => el.getBoundingClientRect().height),
      });
      const before = await page.evaluate(read);
      expect(before.buttons).toEqual([38, 38, 38]);
      await page.evaluate(() => {
        while (window.noir.getState().phase !== 'done') {
          window.qa.allinRest();
          window.qa.finish();
        }
      });
      const after = await page.evaluate(read);
      expect(after.table).toBe(before.table);
      expect(after.buttons.length).toBeGreaterThanOrEqual(3);
      expect(after.buttons.every((height) => height === 38)).toBe(true);
    }
  }
});
test('wide settlement captions put actions above ranks as on phones', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.evaluate(() => {
    window.qa.heroTurn(7);
    while (window.noir.getState().phase !== 'done') {
      window.qa.allinRest();
      window.qa.finish();
    }
  });
  await expect(page.locator('.seat .hand-rank')).toHaveCount(6);
  await expect
    .poll(() =>
      page.locator('.seat').evaluateAll((seats) =>
        seats.every((seat) => {
          const rank = seat.querySelector('.hand-rank').getBoundingClientRect();
          const action = seat.querySelector('.seat-action').getBoundingClientRect();
          return rank.top > action.top;
        }),
      ),
    )
    .toBe(true);
});
test('pot detail freezes the page, scrolls internally and restores the original position', async ({
  page,
}) => {
  await page.setViewportSize({ width: page.viewportSize().width, height: 540 });
  await page.evaluate(() => window.qa.shortAllinSettlement());
  await page.waitForTimeout(100);
  await page.evaluate(() => window.scrollTo(0, 40));
  const before = await page.evaluate(() => ({
    y: scrollY,
    top: document.querySelector('.game-surface').getBoundingClientRect().top,
  }));
  await page.locator('#pot-details-button').click();
  await expect(page.locator('html')).toHaveAttribute('data-home-scroll-locked', 'true');
  await page.mouse.move(5, 100);
  await page.mouse.wheel(0, 400);
  await expect
    .poll(() => page.locator('.game-surface').evaluate((el) => el.getBoundingClientRect().top))
    .toBe(before.top);
  for (const summary of await page.locator('#pot-dialog .pot-distribution summary').all())
    await summary.click();
  await page.locator('#pot-dialog').evaluate((el) => (el.scrollTop = el.scrollHeight));
  await expect
    .poll(() => page.locator('#pot-dialog').evaluate((el) => el.scrollTop))
    .toBeGreaterThan(0);
  await page.locator('#pot-dialog .close-dialog').first().click();
  await expect(page.locator('html')).not.toHaveAttribute('data-home-scroll-locked', 'true');
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(before.y);
});
test('native combined feedback switch mutes subsequent hero-turn notifications', async ({
  page,
}) => {
  await page.evaluate(() => {
    document.documentElement.classList.add('native-app');
    navigator.vibrate = () => {
      window.feedbackCalls++;
      return true;
    };
    window.feedbackCalls = 0;
  });
  await openSettings(page);
  await page.locator('#sound-button').click();
  await expect(page.locator('#sound-label')).toHaveText('音效与振动');
  await expect(page.locator('#sound-button')).toHaveAttribute('title', '音效与振动已关闭');
  await closeSettings(page);
  await page.evaluate(() => window.qa.heroTurn(7));
  expect(await page.evaluate(() => window.feedbackCalls)).toBe(0);
  await openSettings(page);
  await page.locator('#sound-button').click();
  await closeSettings(page);
  await page.evaluate(() => window.qa.heroTurn(6));
  await expect.poll(() => page.evaluate(() => window.feedbackCalls)).toBe(1);
});
test('mixed lineup has a transparent unselected state', async ({ page }) => {
  await openSettings(page);
  await expect(page.locator('#mix-opponents')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await page.locator('#mix-opponents').click();
  await expect(page.locator('#mix-opponents')).not.toHaveCSS(
    'background-color',
    'rgba(0, 0, 0, 0)',
  );
  await page.locator('#mix-opponents').click();
  await expect(page.locator('#mix-opponents')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
});
