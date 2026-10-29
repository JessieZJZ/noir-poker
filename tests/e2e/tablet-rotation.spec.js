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
  await expect
    .poll(() =>
      page.evaluate((portrait) => {
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
      }, portrait),
    )
    .toEqual({
      fillsScreen: true,
      tableNotCollapsed: true,
      noOverflow: true,
      arranged: true,
      labelAboveRail: true,
      railAbovePresets: true,
      fullWidthRail: true,
      alignedBottom: true,
    });
  assertTableLayout(await page.evaluate(readTableLayout));
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
