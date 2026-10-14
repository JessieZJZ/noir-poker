import { test, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { openSettings, closeSettings } from './settings-helpers.js';
import {
  readRecordTableGeometry,
  recordGeometryDifferences,
} from '../fixtures/records-geometry.js';

async function prepare(page, size) {
  await page.setViewportSize(size);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.waitForFunction(() => !!window.qa);
  await page.evaluate(() => {
    window.qa.stop();
    return document.fonts.ready;
  });
}

async function geometry(page, selector) {
  return page.evaluate(readRecordTableGeometry, selector);
}

async function browserBars(page, height, scroll) {
  await page.evaluate(
    ({ height, scroll }) => {
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
      Object.defineProperty(window.visualViewport, 'height', { configurable: true, value: height });
      window.scrollTo(0, scroll);
      window.dispatchEvent(new Event('resize'));
      window.visualViewport.dispatchEvent(new Event('resize'));
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    },
    { height, scroll },
  );
}

for (const count of [5, 9]) {
  test(`${count}-seat live and historical geometry stays fixed while scrolling and browser bars change`, async ({
    page,
  }) => {
    await prepare(page, { width: 390, height: 844 });
    await page.evaluate((count) => {
      window.qa.recordsStart({ count });
      while (window.noir.getState().phase !== 'done') {
        window.qa.allinRest();
        window.qa.finish();
      }
    }, count);
    const before = await geometry(page, '#arena');
    for (const [height, scroll] of [
      [744, 300],
      [844, 0],
      [700, 180],
      [844, 0],
    ]) {
      await browserBars(page, height, scroll);
      await expect
        .poll(async () => recordGeometryDifferences(await geometry(page, '#arena'), before))
        .toEqual([]);
    }
    const attempt = await page.evaluate(() => window.noir.getRecords()[0].attempts[0]);
    await page.locator('#rules-button').click();
    await page.locator('#records-menu-item').click();
    await page.locator(`[data-record-hand="${attempt.id}"]`).click();
    const historical = await geometry(page, '#history-arena');
    expect(recordGeometryDifferences(historical, before)).toEqual([]);
    for (const [height, scroll] of [
      [744, 480],
      [844, 0],
      [700, 600],
      [844, 0],
    ]) {
      await browserBars(page, height, scroll);
      await expect
        .poll(async () =>
          recordGeometryDifferences(await geometry(page, '#history-arena'), historical),
        )
        .toEqual([]);
    }
    await page.screenshot({ path: test.info().outputPath(`stable-history-${count}.png`) });
  });
}

test('same-width mobile browser height changes do not refit the table but a real width change does', async ({
  page,
}) => {
  await prepare(page, { width: 390, height: 844 });
  await page.evaluate(() => window.qa.publicBoard(9));
  const before = await geometry(page, '#arena');
  for (const height of [744, 700, 844]) {
    await page.setViewportSize({ width: 390, height });
    await expect
      .poll(async () => recordGeometryDifferences(await geometry(page, '#arena'), before))
      .toEqual([]);
  }
  await page.setViewportSize({ width: 440, height: 956 });
  await expect
    .poll(async () => (await geometry(page, '#arena')).arena.width)
    .toBeGreaterThan(before.arena.width + 30);
});

test('larger fitted text keeps phone actions in the first screen and saved tables match live tables', async ({
  page,
}) => {
  const metrics = [];
  for (const size of [
    { width: 320, height: 568 },
    { width: 375, height: 667 },
    { width: 390, height: 844 },
    { width: 440, height: 956 },
    { width: 768, height: 1024 },
    { width: 1280, height: 900 },
  ]) {
    await prepare(page, size);
    for (const count of [5, 9]) {
      await page.evaluate((count) => window.qa.heroTurn(count), count);
      await expect
        .poll(() =>
          page.locator('#call-button').evaluate((el) => el.getBoundingClientRect().bottom),
        )
        .toBeLessThanOrEqual(size.height);
      const metric = await page.locator('#arena').evaluate((arena) => {
        const scale = new DOMMatrix(getComputedStyle(arena).transform).a;
        const font = (selector) =>
          parseFloat(getComputedStyle(arena.querySelector(selector)).fontSize) * scale;
        return {
          name: font('.seat-name-label'),
          action: font('.seat-action'),
          persona: font('.seat-style-label'),
          position: font('.seat .position-badge'),
          hero: font('.hero-identity'),
        };
      });
      metrics.push({ ...size, count, ...metric });
      // The shortest nine-seat phone trades maximum type size for one-screen
      // play. These are actual painted sizes, including the arena transform.
      const primary =
        size.width === 320
          ? count === 9
            ? 7.5
            : 9.5
          : size.width === 375
            ? count === 9
              ? 9
              : 11.5
            : size.width === 390
              ? count === 9
                ? 11.5
                : 13
              : 12;
      expect(metric.name).toBeGreaterThanOrEqual(primary);
      expect(metric.action).toBeGreaterThanOrEqual(primary - 0.5);
      expect(metric.persona).toBeGreaterThanOrEqual(primary - 1.5);
      expect(metric.position).toBeGreaterThanOrEqual(primary - 1.5);
      if (size.width === 390 || size.width === 320)
        await page.screenshot({
          path: test.info().outputPath(`readable-live-${size.width}-${count}.png`),
        });
    }
  }
  await test.info().attach('effective-fonts', {
    body: JSON.stringify(metrics, null, 2),
    contentType: 'application/json',
  });
  await writeFile(test.info().outputPath('effective-fonts.json'), JSON.stringify(metrics, null, 2));
});

test('Chinese, Korean and long locale persona tags keep the same height without resetting practice', async ({
  page,
}) => {
  for (const size of [
    { width: 390, height: 844 },
    { width: 1280, height: 900 },
  ]) {
    await prepare(page, size);
    await page.locator('#opponents-button').click();
    await page.locator('[data-bot-seat="3"]').selectOption('viktor');
    await page.locator('[data-bot-seat="4"]').selectOption('haxton');
    await closeSettings(page);
    await page.evaluate(() => window.qa.heroTurn(9));
    const read = () =>
      page.evaluate(() => {
        const arena = document.querySelector('#arena'),
          scale = new DOMMatrix(getComputedStyle(arena).transform).a;
        const rows = [...arena.querySelectorAll('.seat-profile')].map((profile) => {
          const label = profile.querySelector('.seat-style-label');
          return {
            profile: profile.getBoundingClientRect().height,
            tag: label.getBoundingClientRect().height,
            font: parseFloat(getComputedStyle(label).fontSize) * scale,
            whiteSpace: getComputedStyle(label).whiteSpace,
            overflow: getComputedStyle(label).textOverflow,
          };
        });
        const { hand, phase, stakes, players, stats } = window.noir.getState();
        return {
          rows,
          height: arena.getBoundingClientRect().height,
          game: { hand, phase, stakes, players, stats },
        };
      });
    const before = await read();
    for (const locale of ['ko', 'de', 'en', 'fr', 'ru', 'ja', 'es', 'it', 'pt', 'zh-TW', 'zh-CN']) {
      await openSettings(page);
      await page.locator('#language-select').selectOption(locale);
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      await closeSettings(page);
      await expect
        .poll(async () => {
          const current = await read();
          return recordGeometryDifferences(current, before, 0.5);
        })
        .toEqual([]);
    }
    await page.screenshot({ path: test.info().outputPath(`locale-tag-height-${size.width}.png`) });
  }
});
