import { test, expect } from '@playwright/test';
import { closeSettings } from './settings-helpers.js';

// Use visual bounds after the fit transform. Engine scenarios remain the same
// across devices; only their presentation may change with the viewport.
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

async function assertFixedTable(page, { bottomInset = 0, settled = false } = {}) {
  await expect
    .poll(() =>
      page.evaluate(
        ({ bottomInset, settled }) => {
          const box = (selector) => document.querySelector(selector).getBoundingClientRect();
          const table = box('.table-viewport'),
            dock = box('.action-dock'),
            viewport = document.querySelector('.table-viewport');
          const issues = [];
          if (document.documentElement.scrollWidth > innerWidth) issues.push('horizontal overflow');
          if (scrollY !== 0) issues.push('page moved before any interaction');
          if (table.height <= 70) issues.push('table is too short');
          if (table.top < 0 || table.bottom > dock.top + 1) issues.push('table covers controls');
          if (
            viewport.scrollTop !== 0 ||
            !['clip', 'hidden'].includes(getComputedStyle(viewport).overflowY)
          )
            issues.push('table can scroll');
          const visible = (el) => !el.hidden && getComputedStyle(el).display !== 'none';
          const parts = [
            ...document.querySelectorAll(
              '.seat-profile, .seat .mini-cards, .seat .seat-action, .seat .hand-rank, .table-center, .hero-area',
            ),
          ].filter(visible);
          for (const part of parts) {
            const r = part.getBoundingClientRect();
            if (!r.width || !r.height) continue;
            if (
              r.top < table.top - 1 ||
              r.bottom > table.bottom + 1 ||
              r.left < table.left - 1 ||
              r.right > table.right + 1
            )
              issues.push(`${part.className} outside visible table`);
          }
          const overlaps = (a, b) =>
            a.left < b.right - 0.5 &&
            a.right > b.left + 0.5 &&
            a.top < b.bottom - 0.5 &&
            a.bottom > b.top + 0.5;
          const publicParts = [...document.querySelectorAll('.pot, #board')].map((el) =>
            el.getBoundingClientRect(),
          );
          for (const seat of document.querySelectorAll('.seat'))
            for (const part of parts.filter((el) => seat.contains(el)))
              if (publicParts.some((r) => overlaps(r, part.getBoundingClientRect())))
                issues.push(`seat ${seat.dataset.player} covers public cards or pot`);
          const seats = [...document.querySelectorAll('.seat')];
          for (const [index, seat] of seats.entries()) {
            const own = parts.filter((el) => seat.contains(el));
            for (const other of seats.slice(index + 1))
              for (const a of own)
                for (const b of parts.filter((el) => other.contains(el)))
                  if (overlaps(a.getBoundingClientRect(), b.getBoundingClientRect()))
                    issues.push(`seats ${seat.dataset.player}/${other.dataset.player} overlap`);
            for (const part of own)
              if (overlaps(part.getBoundingClientRect(), box('.hero-area')))
                issues.push(`seat ${seat.dataset.player} covers hero`);
          }
          const ids = settled
            ? ['#next-button', '#restart-hand-button', '#review-hand-button']
            : ['#raise-button', '#fold-button', '#call-button'];
          for (const id of ids) {
            const el = document.querySelector(id),
              r = el.getBoundingClientRect();
            if (
              !visible(el) ||
              r.height < 44 ||
              r.top < 0 ||
              r.bottom > innerHeight - bottomInset + 1 ||
              r.left < 0 ||
              r.right > innerWidth
            )
              issues.push(`${id} is outside the first screen or too small`);
            const text = [...el.childNodes].filter(
              (node) =>
                node.nodeType === Node.TEXT_NODE ||
                (node.nodeType === Node.ELEMENT_NODE && getComputedStyle(node).display !== 'none'),
            );
            const ranges = text.flatMap((node) => {
              const range = document.createRange();
              range.selectNodeContents(node);
              return [...range.getClientRects()].filter(
                (rect) => rect.width > 0 && rect.height > 0,
              );
            });
            const rows = new Set(ranges.map((rect) => Math.round(rect.top)));
            // Nested span/strong glyph metrics differ slightly; separate lines
            // have substantially different vertical centers.
            if (
              rows.size &&
              Math.max(...ranges.map((rect) => rect.top)) -
                Math.min(...ranges.map((rect) => rect.top)) >
                10
            )
              issues.push(`${id} text wraps to another line`);
          }
          const label = document.querySelector('.bet-controls > label');
          if (!settled && label.getBoundingClientRect().height > 2)
            issues.push('duplicate raise amount still occupies table space');
          return issues;
        },
        { bottomInset, settled },
      ),
    )
    .toEqual([]);
}

async function settle(page, count) {
  await page.evaluate((count) => {
    window.qa.scene('3s 8h', 'Ks 7s Jd 5c 9s', {
      count,
      totals: Array(count).fill(4500),
      folded: Array.from({ length: count }, (_, id) => id).filter((id) => ![0, 1, 3].includes(id)),
      otherHoles: { 1: 'As 8s', 3: 'Qs Kh' },
    });
    window.qa.stop();
  }, count);
}

test('the entire table and one-line controls fit the initial mobile screen in every player mode', async ({
  page,
}) => {
  test.setTimeout(90000);
  for (const named of [false, true]) {
    if (named) {
      await page.locator('#opponents-button').click();
      await page.locator('#mix-opponents').click();
      await closeSettings(page);
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
          await assertFixedTable(page, { bottomInset: native ? 34 : 0 });
          await settle(page, count);
          await assertFixedTable(page, { bottomInset: native ? 34 : 0, settled: true });
        }
      }
    }
  }
});

test('short portrait and landscape fit all players without an independent table scroll', async ({
  page,
}) => {
  test.setTimeout(60000);
  for (const size of [
    { width: 320, height: 667 },
    { width: 375, height: 667 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(size);
    for (const native of [false, true]) {
      const insets = size.width > size.height ? { top: 0, bottom: 21 } : { top: 59, bottom: 34 };
      await nativeInsets(page, native, insets);
      for (const count of [5, 9]) {
        await page.evaluate((count) => window.qa.heroTurn(count), count);
        await assertFixedTable(page, { bottomInset: native ? insets.bottom : 0 });
        await page.locator('.table-viewport').evaluate((el) => el.scrollTo(0, 1000));
        await expect
          .poll(() => page.locator('.table-viewport').evaluate((el) => el.scrollTop))
          .toBe(0);
        await page.locator('#call-button').click();
        await page.evaluate(() => window.qa.stop());
        await expect(page.locator('#hero-last-action')).toContainText('跟注');
        await settle(page, count);
        await assertFixedTable(page, { bottomInset: native ? insets.bottom : 0, settled: true });
      }
    }
  }
});

test('resizing, safe-area changes and settled card reveals keep the whole table on screen', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await settle(page, 9);
  await assertFixedTable(page, { settled: true });
  await page.locator('.seat-8 .seat-peek').click();
  await assertFixedTable(page, { settled: true });
  await page.setViewportSize({ width: 844, height: 390 });
  await assertFixedTable(page, { settled: true });
  await nativeInsets(page, true);
  await page.setViewportSize({ width: 390, height: 844 });
  await assertFixedTable(page, { bottomInset: 34, settled: true });
  await page.locator('#next-button').click();
  await page.evaluate(() => {
    window.qa.heroTurn(9);
    window.qa.stop();
  });
  await assertFixedTable(page, { bottomInset: 34 });
  await nativeInsets(page, false);
  await assertFixedTable(page);
});

test('pinch zoom preserves the layout height so controls can be panned normally', async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({
    baseURL,
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    reducedMotion: 'reduce',
  });
  try {
    const page = await context.newPage();
    await page.goto('/');
    await page.waitForFunction(() => !!window.qa);
    await nativeInsets(page, true);
    await page.evaluate(() => {
      window.qa.heroTurn(9);
      return document.fonts.ready;
    });
    await assertFixedTable(page, { bottomInset: 34 });
    const height = await page
      .locator('.game-surface')
      .evaluate((el) => getComputedStyle(el).height);
    const cdp = await context.newCDPSession(page);
    for (const scale of [2, 1.5, 1]) {
      await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: scale });
      await expect.poll(() => page.evaluate(() => visualViewport.scale)).toBe(scale);
      await expect
        .poll(() => page.locator('.game-surface').evaluate((el) => getComputedStyle(el).height))
        .toBe(height);
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
    await assertFixedTable(page, { bottomInset: 34 });
  } finally {
    await context.close();
  }
});

test('detailed settlement stays below the fitted table and desktop keeps natural document flow', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await settle(page, 9);
  await assertFixedTable(page, { settled: true });
  const details = await page.locator('#showdown-stage').evaluate((el) => ({
    nested: !!el.closest('.game-surface'),
    top: el.getBoundingClientRect().top,
    surfaceBottom: document.querySelector('.game-surface').getBoundingClientRect().bottom,
  }));
  expect(details.nested).toBe(false);
  expect(details.top).toBeGreaterThanOrEqual(details.surfaceBottom);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.evaluate(() => window.qa.heroTurn(9));
  const desktop = await page.evaluate(() => {
    const table = document.querySelector('.table-viewport'),
      arena = document.querySelector('#arena');
    return {
      tableHeight: table.getBoundingClientRect().height,
      arenaHeight: arena.getBoundingClientRect().height,
      scroll: table.scrollTop,
      maxHeight: getComputedStyle(document.querySelector('.game-surface')).maxHeight,
      transform: arena.style.transform,
      overflow: document.documentElement.scrollWidth > innerWidth,
    };
  });
  expect(desktop.tableHeight).toBeCloseTo(desktop.arenaHeight, 0);
  expect(desktop.scroll).toBe(0);
  expect(desktop.maxHeight).toBe('none');
  expect(desktop.transform).toBe('');
  expect(desktop.overflow).toBe(false);
});
