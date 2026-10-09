import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.waitForFunction(() => !!window.qa);
  await page.evaluate(() => {
    window.qa.stop();
    return document.fonts.ready;
  });
});

async function nativeInsets(page, enabled, insets = { top: 59, bottom: 34 }) {
  await page.evaluate(
    ({ enabled, insets }) => {
      const root = document.documentElement;
      root.classList.toggle('native-app', enabled);
      root.style.setProperty('--safe-area-inset-top', `${enabled ? insets.top : 0}px`);
      root.style.setProperty('--safe-area-inset-bottom', `${enabled ? insets.bottom : 0}px`);
    },
    { enabled, insets },
  );
}

async function layout(page) {
  return page.evaluate(() => {
    const box = (selector) => {
      const r = document.querySelector(selector).getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height };
    };
    const viewport = document.querySelector('.table-viewport');
    return {
      width: innerWidth,
      height: innerHeight,
      pageScroll: scrollY,
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
      table: box('.table-viewport'),
      arena: box('#arena'),
      hero: box('.hero-area'),
      heroCards: [...document.querySelectorAll('.hero-cards .playing-card')].map((el) => {
        const r = el.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom };
      }),
      board: box('#board'),
      dock: box('.action-dock'),
      buttons: ['#raise-button', '#fold-button', '#call-button'].map(box),
      scroll: viewport.scrollTop,
      maxScroll: viewport.scrollHeight - viewport.clientHeight,
    };
  });
}

async function assertActionsOnScreen(page, bottomInset = 0) {
  await expect
    .poll(async () => {
      const l = await layout(page);
      return (
        !l.horizontalOverflow &&
        l.table.height > 70 &&
        l.table.bottom <= l.dock.top + 1 &&
        l.buttons.every(
          (r) =>
            r.height >= 44 &&
            r.top >= 0 &&
            r.bottom <= l.height - bottomInset + 1 &&
            r.left >= 0 &&
            r.right <= l.width,
        )
      );
    })
    .toBe(true);
}

async function assertHeroAndBoardVisible(page) {
  await expect
    .poll(async () => {
      const l = await layout(page);
      return [l.hero, l.board, ...l.heroCards].every(
        (r) => r.top >= l.table.top - 1 && r.bottom <= l.table.bottom + 1,
      );
    })
    .toBe(true);
}

async function assertFollowsBottom(page) {
  await expect
    .poll(async () => {
      const l = await layout(page);
      return Math.abs(l.scroll - l.maxScroll);
    })
    .toBeLessThan(2);
}

test('first-screen mobile actions and the default board and hero remain visible in every player mode', async ({
  page,
}) => {
  test.setTimeout(60000);
  for (const named of [false, true]) {
    if (named) {
      await page.locator('#opponents-button').click();
      await page.locator('#mix-opponents').click();
      await page.locator('#save-opponents').click();
    }
    for (const size of [
      { width: 390, height: 844 },
      { width: 402, height: 874 },
    ]) {
      await page.setViewportSize(size);
      for (const native of [false, true]) {
        await nativeInsets(page, native);
        for (const count of [5, 6, 7, 8, 9]) {
          await page.evaluate((count) => window.qa.heroTurn(count), count);
          // Measure before locator.click can implicitly scroll the page.
          await assertActionsOnScreen(page, native ? 34 : 0);
          await assertHeroAndBoardVisible(page);
          expect((await layout(page)).pageScroll).toBe(0);
        }
      }
    }
  }
});

test('short portrait and landscape keep the controls usable while the table scrolls independently', async ({
  page,
}) => {
  for (const size of [
    { width: 375, height: 667 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(size);
    for (const native of [false, true]) {
      const insets = size.width > size.height ? { top: 0, bottom: 21 } : { top: 59, bottom: 34 };
      await nativeInsets(page, native, insets);
      await page.evaluate(() => window.qa.heroTurn(9));
      await assertActionsOnScreen(page, native ? insets.bottom : 0);
      await assertFollowsBottom(page);
      const before = await layout(page);
      expect(before.maxScroll).toBeGreaterThan(40);
      await page.mouse.move((before.table.left + before.table.right) / 2, before.table.top + 25);
      await page.mouse.wheel(0, -2000);
      await expect.poll(async () => (await layout(page)).scroll).toBeLessThan(before.scroll - 20);
      const after = await layout(page);
      expect(after.pageScroll).toBe(before.pageScroll);
      expect(after.dock).toEqual(before.dock);
      await assertActionsOnScreen(page, native ? insets.bottom : 0);
      await page.locator('#call-button').click();
      await page.evaluate(() => window.qa.stop());
      await expect(page.locator('#hero-last-action')).toContainText('跟注');
    }
  }
});

test('manual table inspection is preserved when the same hand renders another action', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.qa.heroTurn(9));
  await assertActionsOnScreen(page);
  await page.locator('#call-button').click();
  await page.evaluate(() => window.qa.stop());
  await assertFollowsBottom(page);
  const before = await layout(page);
  expect(before.maxScroll).toBeGreaterThan(40);
  await page.mouse.move((before.table.left + before.table.right) / 2, before.table.top + 25);
  await page.mouse.wheel(0, -2000);
  await expect.poll(async () => (await layout(page)).scroll).toBeLessThan(5);
  const hand = await page.evaluate(() => window.noir.getState().hand);
  await page.evaluate(() => window.qa.respondToHero(150));
  expect(await page.evaluate(() => window.noir.getState().hand)).toBe(hand);
  await expect(page.locator('#hero-turn')).toHaveText('你的回合');
  await expect.poll(async () => (await layout(page)).scroll).toBeLessThan(5);
  await assertActionsOnScreen(page);
});

test('resizing and safe-area changes retain hero focus unless the user has scrolled the table', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.qa.heroTurn(9));
  await assertFollowsBottom(page);
  await page.setViewportSize({ width: 844, height: 390 });
  await assertFollowsBottom(page);
  await nativeInsets(page, true);
  await page.setViewportSize({ width: 390, height: 844 });
  await assertFollowsBottom(page);
  await assertActionsOnScreen(page, 34);
  await assertHeroAndBoardVisible(page);
  await nativeInsets(page, false);
  await assertFollowsBottom(page);
  await assertHeroAndBoardVisible(page);
});

test('pinch zoom does not collapse the native table surface around its action controls', async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    reducedMotion: 'reduce',
  });
  try {
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:4175');
    await page.waitForFunction(() => !!window.qa);
    await nativeInsets(page, true);
    await page.evaluate(() => {
      window.qa.heroTurn(9);
      return document.fonts.ready;
    });
    await assertActionsOnScreen(page, 34);
    const cap = await page
      .locator('.game-surface')
      .evaluate((el) => getComputedStyle(el).maxHeight);
    const cdp = await context.newCDPSession(page);
    for (const scale of [2, 1.5, 1]) {
      await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: scale });
      await expect.poll(() => page.evaluate(() => visualViewport.scale)).toBe(scale);
      // Zoom shrinks the visual viewport. Reflowing into that height would
      // clip the actions inside overflow:hidden rather than allow normal pan.
      await expect
        .poll(() => page.locator('.game-surface').evaluate((el) => getComputedStyle(el).maxHeight))
        .toBe(cap);
      await expect
        .poll(() =>
          page.evaluate(() => {
            const surface = document.querySelector('.game-surface').getBoundingClientRect();
            return ['#raise-button', '#fold-button', '#call-button'].every((selector) => {
              const r = document.querySelector(selector).getBoundingClientRect();
              return r.top >= surface.top && r.bottom <= surface.bottom;
            });
          }),
        )
        .toBe(true);
    }
    await assertActionsOnScreen(page, 34);
    await assertFollowsBottom(page);
    await assertHeroAndBoardVisible(page);
  } finally {
    await context.close();
  }
});

test('a real touch pan keeps the inspected part of the table through the next action render', async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    reducedMotion: 'reduce',
  });
  try {
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:4175');
    await page.waitForFunction(() => !!window.qa);
    await nativeInsets(page, true);
    await page.evaluate(() => window.qa.heroTurn(9));
    await assertActionsOnScreen(page, 34);
    await page.locator('#call-button').click();
    await page.evaluate(() => window.qa.stop());
    await assertFollowsBottom(page);
    const before = await layout(page);
    const cdp = await context.newCDPSession(page);
    const x = (before.table.left + before.table.right) / 2;
    const y = before.table.top + 30;
    const point = (y) => [{ x, y, id: 1 }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point(y) });
    for (let step = 1; step <= 6; step++) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: point(y + step * 20),
      });
      await page.waitForTimeout(50);
    }
    await page.waitForTimeout(100);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(async () => (await layout(page)).scroll).toBeLessThan(before.scroll - 30);
    // Wait for the compositor's touch scroll to stop, then trigger a real
    // engine/render transition. No synthetic scroll event toggles the follow.
    await page.waitForTimeout(250);
    const inspected = await layout(page);
    await page.evaluate(() => window.qa.respondToHero(150));
    await expect(page.locator('#hero-turn')).toHaveText('你的回合');
    await expect
      .poll(async () => Math.abs((await layout(page)).scroll - inspected.scroll))
      .toBeLessThan(2);
    await assertActionsOnScreen(page, 34);
  } finally {
    await context.close();
  }
});

test('settlement releases the table and the next hand restores playable focus', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.qa.foldWin(9));
  await expect(page.locator('.game-surface')).not.toHaveClass(/has-live-hand/);
  const settled = await layout(page);
  expect(settled.table.height).toBeGreaterThan(600);
  expect(settled.table.height).toBeCloseTo(settled.arena.height, 0);
  expect(settled.maxScroll).toBe(0);
  await page.locator('#next-button').click();
  await page.evaluate(() => window.qa.stop());
  await expect(page.locator('.game-surface')).toHaveClass(/has-live-hand/);
  await assertFollowsBottom(page);
  await assertActionsOnScreen(page);
  await assertHeroAndBoardVisible(page);
  await page.locator('#reset-button').click();
  await page.locator('#confirm-reset').click();
  await page.evaluate(() => window.qa.stop());
  await assertFollowsBottom(page);
  await assertActionsOnScreen(page);
  await assertHeroAndBoardVisible(page);
});

test('desktop retains its full table and normal document flow', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.evaluate(() => window.qa.heroTurn(9));
  const l = await layout(page);
  expect(l.table.height).toBeCloseTo(l.arena.height, 0);
  expect(l.maxScroll).toBe(0);
  expect(l.scroll).toBe(0);
  expect(l.dock.top).toBeGreaterThanOrEqual(l.table.bottom);
  expect(await page.locator('.game-surface').evaluate((el) => getComputedStyle(el).maxHeight)).toBe(
    'none',
  );
  expect(l.horizontalOverflow).toBe(false);
});
