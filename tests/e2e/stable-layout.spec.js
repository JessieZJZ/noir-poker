import { assignNamedLineup } from './settings-helpers.js';
import { test, expect } from '@playwright/test';
import { openSettings, closeSettings } from './settings-helpers.js';

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.waitForFunction(() => !!window.qa);
  await page.evaluate(() => {
    window.qa.stop();
    return document.fonts.ready;
  });
  await openSettings(page);
  await assignNamedLineup(page);
  await closeSettings(page);
});

async function gameBounds(page) {
  return page.evaluate(() => {
    const height = (selector) => document.querySelector(selector).getBoundingClientRect().height;
    return {
      surface: height('.game-surface'),
      table: height('.table-viewport'),
      arena: height('#arena'),
    };
  });
}

test('wide action logs expand below the table without stretching the game area or moving the page', async ({
  page,
}) => {
  for (const width of [1101, 1280, 1700]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(() => {
      window.qa.heroTurn(9);
      window.qa.raiseActions(9);
    });
    await expect(page.locator('#activity-list li')).toHaveCount(11);
    const initial = await gameBounds(page);

    // Each player already has an action at the baseline. More actions change
    // the timeline length, not the table footprint or the active-hand layout.
    for (let round = 0; round < 6; round++) {
      await page.evaluate(() => window.qa.raiseActions(9));
      await expect
        .poll(async () => {
          const current = await gameBounds(page);
          return Object.keys(initial).every((key) => Math.abs(current[key] - initial[key]) <= 2);
        })
        .toBe(true);
    }
    const timeline = await page.locator('#activity-list').evaluate((el) => ({
      count: el.children.length,
      actualLogs: window.qa.state().totalLogs,
      numbers: [...el.children].map((item) => item.value),
      overflow: getComputedStyle(el).overflowY,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    }));
    expect(timeline.count).toBeGreaterThanOrEqual(63);
    expect(timeline.count).toBe(timeline.actualLogs);
    expect(timeline.numbers).toEqual(Array.from({ length: timeline.count }, (_, i) => i + 1));
    expect(timeline.overflow).toBe('visible');
    expect(timeline.clientHeight).toBeGreaterThan(0);
    expect(timeline.scrollHeight - timeline.clientHeight).toBeLessThanOrEqual(1);
    await page.locator('#activity-list li').last().scrollIntoViewIfNeeded();
    const readingPosition = await page.evaluate(() => scrollY);
    expect(readingPosition).toBeGreaterThan(0);
    await page.evaluate(() => window.qa.raiseActions(9));
    expect(await page.evaluate(() => scrollY)).toBeCloseTo(readingPosition, 0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
      false,
    );
    expect(await gameBounds(page)).toEqual(initial);
    await page.evaluate(() => scrollTo(0, 0));
    await page.evaluate(() => window.qa.raiseActions(9));
    expect(await page.evaluate(() => scrollY)).toBe(0);
  }
});

test('new streets, retries and subsequent hands do not accumulate the previous timeline height or scroll offset', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.evaluate(() => {
    window.qa.heroTurn(9);
    window.qa.raiseActions(45);
  });
  const initial = await gameBounds(page);
  await page.locator('#activity-list').evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  for (const street of ['翻牌', '转牌', '河牌']) {
    await page.locator('#call-button').click();
    const current = await page.evaluate(() => window.qa.respondToHero(0, true));
    expect(current.street).toBe(street);
    await expect
      .poll(async () => {
        const bounds = await gameBounds(page);
        return bounds.surface <= initial.surface + 2 && bounds.arena <= initial.arena + 2;
      })
      .toBe(true);
  }
  await page.locator('#call-button').click();
  await page.evaluate(() => window.qa.respondToHero(0, true));
  await expect(page.locator('#next-button')).toBeVisible();
  await page.locator('#restart-hand-button').click();
  await page.evaluate(() => window.qa.stop());
  await expect.poll(() => page.locator('#activity-list').evaluate((el) => el.scrollTop)).toBe(0);
  await expect(page.locator('#activity-list li')).toHaveCount(3);
  for (let hand = 0; hand < 3; hand++) {
    await page.evaluate(() => window.qa.foldRest());
    await page.locator('#next-button').click();
    await page.evaluate(() => window.qa.stop());
    await expect.poll(() => page.locator('#activity-list').evaluate((el) => el.scrollTop)).toBe(0);
    await expect(page.locator('#activity-list li')).toHaveCount(2);
    await expect
      .poll(async () => (await gameBounds(page)).arena)
      .toBeLessThanOrEqual(initial.arena + 2);
  }
});

test('mobile 5–9 player tables retain their first-screen space as the hand produces more actions', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    const root = document.documentElement;
    root.classList.add('native-app');
    root.style.setProperty('--safe-area-inset-top', '59px');
    root.style.setProperty('--safe-area-inset-bottom', '34px');
  });
  for (const count of [5, 6, 7, 8, 9]) {
    await page.evaluate((count) => {
      window.qa.heroTurn(count);
      window.qa.raiseActions(count);
    }, count);
    const baseline = await gameBounds(page);
    await page.evaluate((count) => window.qa.raiseActions(count * 4), count);
    await expect
      .poll(() =>
        page.evaluate((baseline) => {
          const surface = document.querySelector('.game-surface').getBoundingClientRect(),
            table = document.querySelector('.table-viewport'),
            tableBounds = table.getBoundingClientRect(),
            dock = document.querySelector('.action-dock').getBoundingClientRect();
          return {
            surfaceStable: Math.abs(surface.height - baseline.surface) <= 2,
            tableStable: Math.abs(tableBounds.height - baseline.table) <= 2,
            tableBeforeDock: tableBounds.bottom <= dock.top + 1,
            tableFixed:
              table.scrollTop === 0 &&
              ['clip', 'hidden'].includes(getComputedStyle(table).overflowY),
            controlsVisible: ['#raise-button', '#fold-button', '#call-button'].every((selector) => {
              const button = document.querySelector(selector).getBoundingClientRect();
              return (
                button.top >= 0 && button.bottom <= innerHeight - 34 + 1 && button.height >= 38
              );
            }),
            pageNotMoved: scrollY === 0,
          };
        }, baseline),
      )
      .toEqual({
        surfaceStable: true,
        tableStable: true,
        tableBeforeDock: true,
        tableFixed: true,
        controlsVisible: true,
        pageNotMoved: true,
      });
    expect(await page.locator('#activity-list li').count()).toBeGreaterThanOrEqual(count * 5);
  }
});
