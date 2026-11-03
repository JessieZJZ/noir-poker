import { test, expect } from '@playwright/test';
import { readTableLayout, assertTableLayout } from '../native/layout.mjs';

async function prepare(page, size) {
  await page.setViewportSize(size);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.waitForFunction(() => !!window.qa);
  await page.evaluate(() => document.fonts.ready);
}

async function assertTabletFrame(page, portrait) {
  // CSS viewport sizing can settle before the ResizeObserver has refitted
  // the inner rail. Wait for the complete geometry in the same readiness
  // check, rather than accepting the outer frame then sampling an interim rail.
  await expect
    .poll(async () => {
      const frame = await page.evaluate((portrait) => {
        const box = (s) => document.querySelector(s).getBoundingClientRect();
        const surface = box('.game-surface'),
          table = box('.table-viewport'),
          controls = box('.bet-controls'),
          label = box('.bet-controls > label'),
          range = box('.bet-controls input'),
          presets = box('.bet-presets'),
          actions = box('.action-buttons');
        return {
          fillsScreen: surface.bottom >= innerHeight - 16 && surface.bottom <= innerHeight + 1,
          tableNotCollapsed: table.height > innerHeight * (portrait ? 0.6 : 0.45),
          noOverflow: document.documentElement.scrollWidth <= innerWidth,
          arranged: portrait
            ? controls.bottom <= actions.top + 1
            : controls.right <= actions.left + 1,
          labelAboveRail:
            portrait || (label.width >= controls.width * 0.9 && label.bottom <= range.top + 1),
          railAbovePresets: range.bottom <= presets.top + 1,
          fullWidthRail: Math.abs(range.width - presets.width) <= 1,
          alignedBottom: portrait || Math.abs(presets.bottom - actions.bottom) <= 1,
        };
      }, portrait);
      const layout = await page.evaluate(readTableLayout);
      try {
        assertTableLayout(layout);
        return { ...frame, completeRail: true };
      } catch (error) {
        return { ...frame, completeRail: false, geometryError: error.message, rail: layout.rail };
      }
    })
    .toEqual({
      fillsScreen: true,
      tableNotCollapsed: true,
      noOverflow: true,
      arranged: true,
      labelAboveRail: true,
      railAbovePresets: true,
      fullWidthRail: true,
      alignedBottom: true,
      completeRail: true,
    });
}

for (const hasTouch of [false, true]) {
  test.describe(`Surface Pro ${hasTouch ? 'touch' : 'mouse'}`, () => {
    test.use({ hasTouch });
    test('portrait recovers after a staged rotation without starting another hand', async ({
      page,
    }, info) => {
      test.skip(info.project.name === 'mobile', 'Explicit tablet matrix runs once');
      await prepare(page, { width: 1440, height: 960 });
      for (const count of [5, 9]) {
        await page.evaluate((count) => {
          window.qa.heroTurn(count);
          window.qa.stop();
        }, count);
        const before = await page.evaluate(() => window.noir.getState());
        for (let cycle = 0; cycle < 2; cycle++) {
          await page.setViewportSize({ width: 1440, height: 960 });
          for (const height of [600, 1000]) {
            await page.setViewportSize({ width: 960, height });
            await page.evaluate(
              () =>
                new Promise((resolve) =>
                  requestAnimationFrame(() => requestAnimationFrame(resolve)),
                ),
            );
          }
          await page.setViewportSize({ width: 960, height: 1440 });
          await assertTabletFrame(page, true);
          expect(await page.evaluate(() => window.noir.getState())).toEqual(before);
        }
      }
      await page.screenshot({ path: info.outputPath('surface-portrait-after-rotation.png') });
    });
  });
}

for (const browserName of ['chromium', 'webkit']) {
  test(`iPad mini ${browserName} landscape controls stay ordered through repeated rotations`, async ({
    playwright,
    baseURL,
  }, info) => {
    test.skip(info.project.name === 'mobile', 'Explicit tablet matrix runs once');
    const browser = await playwright[browserName].launch();
    const context = await browser.newContext({
      baseURL,
      hasTouch: true,
      locale: 'zh-CN',
      timezoneId: 'Asia/Shanghai',
    });
    const page = await context.newPage();
    try {
      await prepare(page, { width: 768, height: 1024 });
      for (const count of [5, 6, 7, 8, 9]) {
        await page.evaluate((count) => {
          window.qa.heroTurn(count);
          window.qa.stop();
        }, count);
        const before = await page.evaluate(() => window.noir.getState());
        for (const [width, height] of [
          [1024, 768],
          [768, 1024],
          [1024, 768],
        ]) {
          await page.setViewportSize({ width, height });
          await assertTabletFrame(page, width < height);
          expect(await page.evaluate(() => window.noir.getState())).toEqual(before);
        }
      }
      await page.screenshot({ path: info.outputPath('mini-landscape-after-rotation.png') });
    } finally {
      await context.close();
      await browser.close();
    }
  });
}

test('tablet rotation updates geometry even when paint-frame callbacks are postponed', async ({
  page,
}, info) => {
  test.skip(info.project.name === 'mobile', 'Explicit tablet matrix runs once');
  await prepare(page, { width: 1440, height: 960 });
  await page.evaluate(() => {
    window.qa.heroTurn(5);
    window.qa.stop();
  });
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  const before = await page.evaluate(() => window.noir.getState());
  try {
    await page.evaluate(() => {
      window.originalViewportRaf = window.requestAnimationFrame;
      window.requestAnimationFrame = () => 0;
    });
    await page.setViewportSize({ width: 960, height: 1440 });
    await assertTabletFrame(page, true);
    expect(await page.evaluate(() => window.noir.getState())).toEqual(before);
  } finally {
    await page.evaluate(() => {
      window.requestAnimationFrame = window.originalViewportRaf;
      delete window.originalViewportRaf;
    });
  }
});

test('tablet CSS viewport recovery does not depend on a resize callback or paint-frame callback', async ({
  page,
}, info) => {
  test.skip(info.project.name === 'mobile', 'Explicit tablet matrix runs once');
  await page.addInitScript(() => {
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback) =>
      raf((time) => {
        if (!window.deferViewportSignals) callback(time);
      });
    const block = (event) => {
      if (window.deferViewportSignals) event.stopImmediatePropagation();
    };
    window.addEventListener('resize', block, { capture: true });
    window.visualViewport?.addEventListener('resize', block, { capture: true });
  });
  await prepare(page, { width: 768, height: 600 });
  await page.evaluate(() => {
    window.qa.heroTurn(5);
    window.qa.stop();
  });
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  const before = await page.evaluate(() => window.noir.getState());
  await page.evaluate(() => {
    window.deferViewportSignals = true;
  });
  await page.setViewportSize({ width: 768, height: 1024 });
  await assertTabletFrame(page, true);
  expect(await page.evaluate(() => window.noir.getState())).toEqual(before);
});

test('iPad mini webkit refits late public and hero card sizes without another viewport resize', async ({
  playwright,
  baseURL,
}, info) => {
  test.skip(info.project.name === 'mobile', 'Explicit tablet matrix runs once');
  const browser = await playwright.webkit.launch();
  const context = await browser.newContext({
    baseURL,
    hasTouch: true,
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
  });
  const page = await context.newPage();
  try {
    await page.addInitScript(() => {
      const Observer = window.ResizeObserver;
      window.layoutResizeDeliveries = 0;
      window.ResizeObserver = class extends Observer {
        constructor(callback) {
          super((entries, observer) => {
            window.layoutResizeDeliveries++;
            callback(entries, observer);
          });
        }
      };
    });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await prepare(page, { width: 1024, height: 768 });
    await page.evaluate(() => {
      window.qa.heroTurn(5);
      window.qa.stop();
    });
    await assertTabletFrame(page, false);
    const before = await page.evaluate(() => window.noir.getState());
    const initialLayout = await page.evaluate(readTableLayout);
    // Reproduce the CI rotation's final intrinsic sizes arriving after the
    // desktop rail was measured: board 426 -> 506px, hero 186 -> 151px.
    // These absolute children can resize while every observed outer box stays put.
    await page.addStyleTag({
      content: `@media (min-width: 901px) and (max-width: 1100px) and (orientation: landscape) {
        .game-surface .arena[data-player-count] .board { --public-card-width: 98px; }
        .game-surface .hero-cards { min-height: 104px; gap: 7px; }
        .game-surface .hero-cards .playing-card { width: 72px; height: 104px; }
      }`,
    });
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    await info.attach('late-responsive-sizes', {
      body: JSON.stringify({ before: initialLayout, after: await page.evaluate(readTableLayout) }),
      contentType: 'application/json',
    });
    await assertTabletFrame(page, false);
    expect(await page.evaluate(() => window.noir.getState())).toEqual(before);
    const deliveries = await page.evaluate(async () => {
      const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
      await nextFrame();
      await nextFrame();
      const samples = [];
      for (let frame = 0; frame < 6; frame++) {
        await nextFrame();
        samples.push(window.layoutResizeDeliveries);
      }
      return samples;
    });
    expect(
      new Set(deliveries).size,
      'Inner size observation must settle without a refit loop',
    ).toBe(1);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
    await browser.close();
  }
});
