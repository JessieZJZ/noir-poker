import { test, expect } from '@playwright/test';

for (const count of [5, 9]) {
  test(`entry keeps the table stationary through the first ${count}-player deal`, async ({
    page,
  }, info) => {
    const width = info.project.name === 'mobile' ? 390 : 768;
    await page.setViewportSize({ width, height: width === 768 ? 1000 : 844 });
    await page.addInitScript(
      (playerCount) => localStorage.setItem('noir-table-v1', JSON.stringify({ playerCount })),
      count,
    );
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-app-ready', 'true');
    await page.evaluate(() => {
      window.entryFrames = [];
      const start = performance.now();
      function sample() {
        const surface = document.querySelector('.game-surface');
        const rect = (selector) => {
          const box = document.querySelector(selector).getBoundingClientRect();
          return [box.x, box.y, box.width, box.height];
        };
        window.entryFrames.push({
          state: surface.dataset.entryState,
          opacity: getComputedStyle(surface).opacity,
          table: rect('.poker-table'),
          seat: rect('.seat-profile'),
        });
        if (!window.entryCaptureDone) requestAnimationFrame(sample);
      }
      sample();
    });
    await page.locator('#join-table-button').click();
    await page.waitForFunction(
      () => window.entryFrames.length > 5 && window.entryFrames.at(-1).state === 'playing',
    );
    const frames = await page.evaluate(() => {
      window.entryCaptureDone = true;
      return window.entryFrames;
    });
    expect(frames[0].state).toBe('waiting');
    for (const frame of frames) {
      expect(frame.opacity).toBe('1');
      for (const key of ['table', 'seat'])
        for (let i = 0; i < 4; i++)
          expect(Math.abs(frame[key][i] - frames[0][key][i])).toBeLessThanOrEqual(1.1);
    }
  });
}

test('late native safe-area insets preserve the table across entry without a resize event', async ({
  page,
}) => {
  await page.setViewportSize({ width: 402, height: 874 });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-app-ready', 'true');
  await page.evaluate(() => {
    const root = document.documentElement;
    root.classList.add('native-app', 'native-ios');
    root.style.setProperty('--safe-area-inset-top', '62px');
    root.style.setProperty('--safe-area-inset-bottom', '34px');
  });
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  const read = () =>
    page.evaluate(() => {
      const box = document.querySelector('.table-viewport').getBoundingClientRect();
      return [box.x, box.y, box.width, box.height];
    });
  const waiting = await read();
  await page.locator('#join-table-button').click();
  await expect(page.locator('.game-surface')).toHaveAttribute('data-entry-state', 'playing');
  const playing = await read();
  for (let i = 0; i < 4; i++) expect(Math.abs(waiting[i] - playing[i])).toBeLessThanOrEqual(1.1);
});

test('a wrapped waiting label retains its header footprint after joining', async ({ page }) => {
  await page.setViewportSize({ width: 402, height: 874 });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-app-ready', 'true');
  await page.evaluate(() => {
    document.querySelector('#street-label').textContent =
      '等待入座，即将开始第 100000 局第 100000 手';
    window.dispatchEvent(new Event('resize'));
  });
  await expect
    .poll(() => page.locator('.hand-label').evaluate((el) => el.getBoundingClientRect().height))
    .toBeGreaterThan(28);
  const read = () =>
    page.locator('.table-viewport').evaluate((el) => {
      const box = el.getBoundingClientRect();
      return [box.x, box.y, box.width, box.height];
    });
  const waiting = await read();
  await page.locator('#join-table-button').click();
  await expect(page.locator('.game-surface')).toHaveAttribute('data-entry-state', 'playing');
  const playing = await read();
  for (let i = 0; i < 4; i++) expect(Math.abs(waiting[i] - playing[i])).toBeLessThanOrEqual(1.1);
});
