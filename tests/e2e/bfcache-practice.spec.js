import { test, expect } from '@playwright/test';

test('cached page restore keeps coaching and tool listeners on the same decision', async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.practiceToolSignals = [];
    Object.defineProperty(document, 'modelContext', {
      configurable: true,
      value: {
        registerTool(tool, { signal }) {
          window.practiceToolSignals.push({ name: tool.name, signal });
        },
      },
    });
  });
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-01-01T00:00:01Z'));
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await page.waitForFunction(() => !!window.qa);
  await page.evaluate(() => {
    window.qa.heroTurn(9);
    window.qa.stop();
    return document.fonts.ready;
  });
  await expect(page.locator('.surface-top #coach-content')).toBeVisible();
  const before = await page.evaluate(() => window.qa.snapshot());
  await page.evaluate(() => {
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
  });
  expect(
    await page.evaluate(() => window.practiceToolSignals.map(({ signal }) => signal.aborted)),
  ).toEqual([false, false, false, false]);
  await page.setViewportSize({ width: 390, height: 844 });
  const banner = page.locator('.surface-top #coach-content');
  await expect(banner).toBeVisible();
  await expect(page.locator('#hint-setting-row #hint-toggle')).toHaveCount(1);
  await expect(page.locator('#hint-setting-row')).not.toHaveAttribute('hidden');
  await expect(banner).toHaveAttribute('data-scrolling', 'true');
  await page.clock.runFor(2000);
  await banner.hover();
  const scroll = await banner.evaluate((element) => element.scrollLeft);
  await page.clock.runFor(2000);
  expect(await banner.evaluate((element) => element.scrollLeft)).toBeCloseTo(scroll, 1);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(banner.locator('.hint-marquee-copy')).toBeHidden();
  expect(await page.evaluate(() => window.qa.snapshot())).toEqual(before);
  await page.evaluate(() =>
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false })),
  );
  expect(
    await page.evaluate(() => window.practiceToolSignals.map(({ signal }) => signal.aborted)),
  ).toEqual([true, true, true, true]);
});
