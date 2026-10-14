import { assignNamedLineup } from './settings-helpers.js';
import { test, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { openSettings, closeSettings } from './settings-helpers.js';
import { readTableLayout, assertTableLayout, assertStableSettlement } from '../native/layout.mjs';

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
      window.dispatchEvent(new Event('resize'));
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
          const publicParts = [
            ...document.querySelectorAll('.pot > div, .pot-details-trigger, #board'),
          ].map((el) => el.getBoundingClientRect());
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
              r.height < 38 ||
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
      await assignNamedLineup(page);
      await closeSettings(page);
    }
    for (const size of [
      { width: 390, height: 844 },
      { width: 402, height: 874 },
      { width: 440, height: 956 },
      { width: 768, height: 1024 },
      { width: 820, height: 1180 },
      { width: 1024, height: 1366 },
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
      if (native && size.width > size.height) {
        await expect(page.locator('#orientation-dialog')).toBeVisible();
        continue;
      }
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

test('detailed settlement stays below the fitted table on phones and wide screens', async ({
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
  expect(desktop.transform).toContain('scale(');
  expect(desktop.overflow).toBe(false);
});

test('SE initial rendering and repeated resizes retain a readable proportional table', async ({
  page,
}) => {
  for (const size of [
    { width: 375, height: 667 },
    { width: 440, height: 956 },
    { width: 375, height: 667 },
  ]) {
    await page.setViewportSize(size);
    await page.reload();
    await page.waitForFunction(() => !!window.qa);
    await page.evaluate(() => {
      window.qa.stop();
      return document.fonts.ready;
    });
    await page.evaluate(() => {
      window.qa.stop();
      return document.fonts.ready;
    });
    await assertFixedTable(page);
    await expect
      .poll(() =>
        page.locator('#arena').evaluate((el) => {
          const r = el.getBoundingClientRect();
          return r.width / document.querySelector('.table-viewport').clientWidth;
        }),
      )
      .toBeGreaterThan(0.7);
  }
  await page.screenshot({ path: test.info().outputPath('iphone-se-initial.png') });
});

test('enabled controls have distinct colors and hover never moves the buttons', async ({
  page,
}) => {
  await page.setViewportSize({ width: 440, height: 956 });
  await page.evaluate(() => window.qa.heroTurn(9));
  const button = page.locator('#raise-button');
  const before = await button.boundingBox();
  const active = await button.evaluate((el) => ({
    color: getComputedStyle(el).color,
    background: getComputedStyle(el).backgroundColor,
  }));
  await button.hover();
  await expect.poll(async () => (await button.boundingBox()).y).toBe(before.y);
  await page.locator('#call-button').click();
  await page.evaluate(() => window.qa.stop());
  await expect(button).toBeDisabled();
  const disabled = await button.evaluate((el) => ({
    color: getComputedStyle(el).color,
    background: getComputedStyle(el).backgroundColor,
  }));
  expect(disabled.color).not.toBe(active.color);
  expect(disabled.background).not.toBe(active.background);
  await expect(button).toHaveCSS('transform', 'none');
  await page.screenshot({ path: test.info().outputPath('inactive-action-buttons.png') });
});

test('portrait tablets use the open table width for larger readable contents', async ({ page }) => {
  const measurements = [];
  for (const size of [
    { width: 768, height: 1024 },
    { width: 820, height: 1180 },
    { width: 1024, height: 1366 },
    { width: 960, height: 1440 },
    { width: 1032, height: 1376 },
  ]) {
    await page.setViewportSize(size);
    await page.evaluate(() => window.qa.publicBoard(9));
    let measured;
    await expect
      .poll(async () => {
        measured = await page.evaluate(() => {
          const arena = document.querySelector('#arena');
          const style = getComputedStyle(arena);
          const scale = new DOMMatrix(style.transform).a;
          const board = document.querySelector('#board > .playing-card');
          const hero = document.querySelector('#hero-cards > .playing-card');
          const profile = document.querySelector('.seat-profile');
          return {
            scale,
            board: board.offsetWidth * scale,
            hero: hero.offsetWidth * scale,
            heroWidth: hero.offsetWidth,
            heroHeight: hero.offsetHeight,
            sharedHeroWidth: parseFloat(style.getPropertyValue('--hero-card-width')),
            sharedHeroHeight: parseFloat(style.getPropertyValue('--hero-card-height')),
            profile: profile.offsetWidth * scale,
            name: parseFloat(getComputedStyle(profile.querySelector('strong')).fontSize) * scale,
            arena: arena.getBoundingClientRect().width,
            viewport: document.querySelector('.table-viewport').clientWidth,
          };
        });
        // The PC/tablet artwork cap is intentional; fitting a 94px face may
        // render below the former 84px minimum while remaining readable.
        return (
          measured.board >= 72 &&
          measured.hero >= 70 &&
          measured.heroWidth <= 94 &&
          measured.heroHeight === 136 &&
          measured.heroWidth === measured.sharedHeroWidth &&
          measured.heroHeight === measured.sharedHeroHeight &&
          measured.profile >= 118 &&
          measured.name >= 14 &&
          measured.arena >= measured.viewport * 0.99
        );
      })
      .toBe(true);
    measurements.push({ ...size, ...measured });
    await assertFixedTable(page);
    await page.screenshot({ path: test.info().outputPath(`tablet-${size.width}.png`) });
  }
  await writeFile(
    test.info().outputPath('portrait-tablet-metrics.json'),
    JSON.stringify(measurements, null, 2),
  );
});

for (const locale of ['zh-CN', 'en']) {
  test(`padded named seats and larger tablet text stay stable through settlement in ${locale}`, async ({
    page,
  }) => {
    await page.evaluate((locale) => localStorage.setItem('noir-locale', locale), locale);
    await page.reload();
    await page.waitForFunction(() => !!window.qa);
    await openSettings(page);
    await assignNamedLineup(page);
    await closeSettings(page);
    for (const size of [
      { width: 440, height: 956 },
      { width: 960, height: 1440 },
      { width: 1032, height: 1376 },
    ]) {
      await page.setViewportSize(size);
      for (const count of [5, 9]) {
        await page.evaluate((count) => window.qa.heroTurn(count), count);
        await assertFixedTable(page);
        const before = await page.evaluate(readTableLayout);
        assertTableLayout(before);
        if (size.width > 900) {
          await expect(page.locator('.hint-banner p').first()).toHaveCSS('font-size', '18px');
          await expect(page.locator('#raise-button span').first()).toHaveCSS('font-size', '18px');
        }
        await page.evaluate(
          (count) => window.qa.scene('Qs Qd', '5h 7c Ts As 8h', { count, folded: [0, 1] }),
          count,
        );
        await assertFixedTable(page, { settled: true });
        const after = await page.evaluate(readTableLayout);
        assertTableLayout(after);
        const rankBottom = await page
          .locator('#hero-hand-rank')
          .evaluate((el) => el.getBoundingClientRect().bottom);
        // A phone's existing 1 CSS-pixel gap becomes subpixel after fitting.
        // Large tablets retain a small gap after lowering the rank tag.
        expect(rankBottom).toBeLessThanOrEqual(after.identity.top - (size.width > 900 ? 2 : 0));
        assertStableSettlement(before, after);
        if (size.width > 900) {
          await expect(page.locator('#review-hand-button')).toHaveCSS('font-size', '18px');
          const nextSize = await page
            .locator('#next-button')
            .evaluate((el) => getComputedStyle(el, '::after').fontSize);
          expect(nextSize).toBe('18px');
        }
        await page.screenshot({
          path: test.info().outputPath(`padded-${locale}-${size.width}-${count}.png`),
        });
      }
    }
  });
}

test('native-sized phone reserves the revealed hand width before an all-in settlement', async ({
  page,
}) => {
  await page.setViewportSize({ width: 402, height: 874 });
  await nativeInsets(page, true, { top: 62, bottom: 34 });
  await page.evaluate(() => window.qa.heroTurn(5));
  await assertFixedTable(page, { bottomInset: 34 });
  const before = await page.evaluate(readTableLayout);
  const slots = () =>
    [...document.querySelectorAll('.seat .mini-cards')].map((el) => ({
      width: el.offsetWidth,
      height: el.offsetHeight,
    }));
  const beforeSlots = await page.evaluate(slots);
  await page.evaluate(() =>
    window.qa.scene('Kh 7d', 'Ts 9d 9h 3c 5c', {
      count: 5,
      totals: [525, 25, 3500, 50, 3600],
      folded: [0, 1, 3],
      otherHoles: { 2: 'Th 8h', 4: 'Qc Td' },
    }),
  );
  await assertFixedTable(page, { bottomInset: 34, settled: true });
  const after = await page.evaluate(readTableLayout);
  const afterSlots = await page.evaluate(slots);
  assertStableSettlement(before, after);
  for (let i = 0; i < beforeSlots.length; i++)
    for (const edge of ['width', 'height'])
      expect(Math.abs(afterSlots[i][edge] - beforeSlots[i][edge])).toBeLessThanOrEqual(1);
});

test('a temporarily hidden viewport can render and recover without invalid fitting geometry', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.evaluate(() => {
    const surface = document.querySelector('.game-surface');
    surface.hidden = true;
    window.qa.heroTurn(9);
    surface.hidden = false;
    dispatchEvent(new Event('resize'));
  });
  await assertFixedTable(page);
  await expect
    .poll(() =>
      page
        .locator('#arena')
        .evaluate(
          (el) => !/NaN|Infinity/.test(el.style.cssText) && el.getBoundingClientRect().width > 340,
        ),
    )
    .toBe(true);
});
