import { test, expect } from '@playwright/test';

for (const size of [
  { width: 375, height: 667, locale: 'zh-CN' },
  { width: 1032, height: 1376, locale: 'en' },
  { width: 1280, height: 900, locale: 'de' },
]) {
  test(`cold ${size.width}px startup publishes a complete table without an empty controls frame`, async ({
    page,
  }) => {
    await page.setViewportSize(size);
    await page.addInitScript((locale) => {
      localStorage.setItem('noir-locale', locale);
      window.startupFrames = [];
      function sample() {
        const main = document.querySelector('.main');
        if (main) {
          const arena = document.querySelector('#arena');
          window.startupFrames.push({
            visible: getComputedStyle(main).visibility === 'visible',
            ready: document.documentElement.dataset.appReady === 'true',
            inert: document.body.inert,
            count: Number(arena.dataset.playerCount),
            seats: document.querySelectorAll('#seats .seat').length,
            hole: document.querySelectorAll('#hero-cards .playing-card').length,
            height: arena.getBoundingClientRect().height,
          });
        }
        if (window.startupFrames.length < 180) requestAnimationFrame(sample);
      }
      requestAnimationFrame(sample);
    }, size.locale);
    let release;
    const controllerGate = new Promise((resolve) => (release = resolve));
    await page.route('**/src/ui/table-controller.js*', async (route) => {
      await controllerGate;
      await route.continue();
    });
    await page.goto('/', { waitUntil: 'commit' });
    await expect(page.locator('.header')).toBeVisible();
    await expect(page.locator('#app-loading')).toBeVisible();
    await expect(page.locator('.main')).toHaveAttribute('aria-busy', 'true');
    await expect(page.locator('.main')).toBeHidden();
    await page.waitForTimeout(200);
    await page.screenshot({ path: test.info().outputPath(`startup-${size.width}-loading.png`) });
    release();
    await expect(page.locator('html')).toHaveAttribute('data-app-ready', 'true');
    await expect(page.locator('.main')).toHaveAttribute('aria-busy', 'false');
    await expect(page.locator('#app-loading')).toBeHidden();
    await expect(page.locator('#arena')).toBeVisible();
    await expect(page.locator('#hero-cards .playing-card')).toHaveCount(2);
    await page.waitForFunction(() => window.startupFrames.some((frame) => frame.visible));
    const frames = await page.evaluate(() => window.startupFrames);
    expect(frames.some((frame) => !frame.visible && frame.inert)).toBe(true);
    const painted = frames.filter((frame) => frame.visible);
    expect(painted.length).toBeGreaterThan(0);
    for (const frame of painted) {
      expect(frame.ready).toBe(true);
      expect(frame.inert).toBe(false);
      expect(frame.seats).toBe(frame.count - 1);
      expect(frame.hole).toBe(2);
      expect(frame.height).toBeGreaterThan(200);
    }
    await page.evaluate(() => window.qa.stop());
    await page.screenshot({ path: test.info().outputPath(`startup-${size.width}-ready.png`) });
  });
}

test('footer status dot stays centered with a readable gap after live language changes', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-app-ready', 'true');
  await page.evaluate(() => window.qa.stop());
  for (const width of [320, 390, 1032, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const locale of ['zh-CN', 'en', 'de']) {
      await page.locator('#opponents-button').click();
      await page.locator('#language-select').selectOption(locale);
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      await page.locator('#opponents-dialog .close-dialog').click();
      const alignment = await page.locator('.practice-status').evaluate((element) => {
        const dot = element.querySelector('.live-dot').getBoundingClientRect();
        const text = element.lastElementChild.getBoundingClientRect();
        return {
          centerDelta: Math.abs(dot.top + dot.height / 2 - text.top - text.height / 2),
          gap: text.left - dot.right,
          inside: text.right <= innerWidth,
        };
      });
      expect(alignment.centerDelta).toBeLessThanOrEqual(1);
      expect(alignment.gap).toBeGreaterThanOrEqual(9);
      expect(alignment.gap).toBeLessThanOrEqual(11);
      expect(alignment.inside).toBe(true);
    }
  }
});
