import { test, expect } from '@playwright/test';

const gate = () => {
  let release;
  const pending = new Promise((resolve) => (release = resolve));
  return { pending, release };
};

test('cold navigation and reload show only the initialized table, even when modules are slow', async ({
  page,
}, testInfo) => {
  // Hold real startup requests at both boundaries: before JS-loaded CSS and
  // after CSS but before the controller creates and fits the first hand.
  let entry = gate();
  let controller = gate();
  await page.route('**/src/main.js*', async (route) => {
    await entry.pending;
    await route.continue();
  });
  await page.route('**/src/ui/table-controller.js*', async (route) => {
    await controller.pending;
    await route.continue();
  });
  await page.route('https://fonts.googleapis.com/**', (route) => route.abort());
  await page.addInitScript(() => {
    window.startupFrames = [];
    function sample() {
      const body = document.body;
      if (body) {
        const visible = getComputedStyle(body).visibility === 'visible';
        window.startupFrames.push({
          visible,
          ready: document.documentElement.dataset.appReady === 'true',
          background: getComputedStyle(document.documentElement).backgroundColor,
          seats: document.querySelectorAll('#seats .seat').length,
          cards: document.querySelectorAll('#hero-cards .playing-card').length,
          inert: body.inert,
          actionsDisabled: [
            ...document.querySelectorAll(
              '.bet-controls input, .bet-presets button, .action-buttons button',
            ),
          ].every((el) => el.disabled),
        });
        if (visible) return;
      }
      requestAnimationFrame(sample);
    }
    requestAnimationFrame(sample);
  });

  for (const navigation of ['cold', 'reload']) {
    entry = gate();
    controller = gate();
    try {
      if (navigation === 'cold') await page.goto('/', { waitUntil: 'commit' });
      else await page.reload({ waitUntil: 'commit' });
      await page.waitForFunction(() => window.startupFrames.length >= 3);
      await expect(page.locator('.header')).toBeHidden();
      await expect(page.locator('#rules-button [data-guide-label="guide"]')).toBeHidden();
      expect(await page.evaluate(() => document.body.inert)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`${navigation}-before-css.png`) });

      entry.release();
      await expect
        .poll(() => page.locator('.header').evaluate((el) => getComputedStyle(el).display))
        .toBe('flex');
      await expect(page.locator('.header')).toBeHidden();
      await expect(page.locator('#rules-button [data-guide-label="guide"]')).toBeHidden();
      await expect(page.locator('#seats .seat')).toHaveCount(0);
      for (const control of await page
        .locator('.bet-controls input, .bet-presets button, .action-buttons button')
        .all())
        await expect(control).toBeDisabled();
      await page.screenshot({ path: testInfo.outputPath(`${navigation}-before-hand.png`) });

      controller.release();
      await expect(page.locator('html')).toHaveAttribute('data-app-ready', 'true');
      await expect(page.locator('.header')).toBeVisible();
      await page.waitForFunction(() => window.startupFrames.some((frame) => frame.visible));
      const frames = await page.evaluate(() => window.startupFrames);
      expect(frames.every((frame) => frame.background === 'rgb(11, 16, 23)')).toBe(true);
      expect(frames.filter((frame) => frame.visible)).toEqual([
        {
          visible: true,
          ready: true,
          background: 'rgb(11, 16, 23)',
          seats: 4,
          cards: 0,
          inert: false,
          actionsDisabled: true,
        },
      ]);
      await page.evaluate(() => window.qa.stop());
      const table = await page.locator('.table-viewport').boundingBox();
      expect(table.width).toBeGreaterThan(0);
      expect(table.height).toBeGreaterThan(0);
      if (testInfo.project.name === 'mobile') {
        expect(await page.locator('#arena').evaluate((el) => el.style.transform)).toContain(
          'scale(',
        );
        const join = await page.locator('#join-table-button').boundingBox();
        expect(join.y + join.height).toBeLessThanOrEqual(page.viewportSize().height);
      }
      await page.screenshot({ path: testInfo.outputPath(`${navigation}-ready.png`) });
      await page.locator('#rules-button').click();
      await page.locator('#guide-menu-item').click();
      await expect(page.locator('#rules-dialog')).toBeVisible();
      await page.locator('#rules-dialog .close-dialog').first().click();
    } finally {
      entry.release();
      controller.release();
    }
  }
});
