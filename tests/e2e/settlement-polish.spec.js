import { test, expect } from '@playwright/test';
import { readTableLayout, assertTableLayout } from '../native/layout.mjs';

for (const locale of ['zh-CN', 'en']) {
  test(`long all-in captions, larger tucked reveals and continuous settlement in ${locale}`, async ({
    page,
  }) => {
    test.setTimeout(90000);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript((value) => localStorage.setItem('noir-locale', value), locale);
    await page.goto('/');
    await page.waitForFunction(() => !!window.qa);
    await page.evaluate(() => document.fonts.ready);
    for (const [width, height] of [
      [360, 800],
      [375, 667],
      [440, 956],
      [768, 1024],
      [960, 1440],
      [1032, 1376],
      [1280, 900],
    ]) {
      await page.setViewportSize({ width, height });
      for (const count of [5, 9]) {
        await page.evaluate((count) => window.qa.shortAllinSettlement(count), count);
        await expect(page.locator('.seat-4 .seat-action')).toContainText('4,850');
        await expect(page.locator('.seat-4 .seat-action-label')).toContainText(
          locale === 'en' ? 'Short all-in' : '短全下',
        );
        const before = await page.evaluate(readTableLayout);
        assertTableLayout(before);
        await page.locator('.seat-2 .seat-peek').click();
        const after = await page.evaluate(readTableLayout);
        assertTableLayout(after);
        if (width <= 1100)
          for (const edge of ['top', 'left', 'right', 'height'])
            expect(Math.abs(before.arena[edge] - after.arena[edge])).toBeLessThanOrEqual(1);
        await expect(page.locator('#showdown-stage')).toBeVisible();
        const details = await page.evaluate(() => {
          const surface = getComputedStyle(document.querySelector('.game-surface')),
            stage = getComputedStyle(document.querySelector('#showdown-stage')),
            dock = getComputedStyle(document.querySelector('.action-dock')),
            status = document.querySelector('.practice-info > span').getBoundingClientRect(),
            dot = document.querySelector('.practice-info .live-dot').getBoundingClientRect();
          return {
            bottom: surface.borderBottomColor,
            radius: surface.borderBottomLeftRadius,
            top: stage.borderTopWidth,
            background: stage.backgroundColor,
            dockBackground: dock.backgroundColor,
            dotOffset: (dot.top + dot.bottom - status.top - status.bottom) / 2,
          };
        });
        expect(details.bottom).toBe(details.dockBackground);
        expect(details.radius).toBe('0px');
        expect(details.top).toBe('0px');
        expect(details.background).toBe(details.dockBackground);
        expect(Math.abs(details.dotOffset)).toBeLessThanOrEqual(0.5);
      }
      await page.evaluate(() => window.qa.scene('Kh 6s', 'Kc 7d Tc 3s 2h', { count: 5 }));
      const rank = await page.evaluate(() => {
        const badge = document.querySelector('#hero-hand-rank'),
          box = badge.getBoundingClientRect(),
          identity = document.querySelector('.hero-identity').getBoundingClientRect();
        return { shift: getComputedStyle(badge).translate, clearance: identity.top - box.bottom };
      });
      expect(rank.shift).not.toBe('none');
      expect(rank.clearance).toBeGreaterThanOrEqual(0);
      if (width === 360 || width === 1032)
        await page.screenshot({
          path: test.info().outputPath(`${locale}-${width}-settlement.png`),
          fullPage: true,
        });
    }
  });
}
