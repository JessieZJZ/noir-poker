import { test, expect } from '@playwright/test';

function gate() {
  let release;
  const promise = new Promise((resolve) => (release = resolve));
  return { promise, release };
}

test.beforeEach(async ({ page }, testInfo) => {
  if (testInfo.project.name === 'mobile') await page.setViewportSize({ width: 375, height: 667 });
  // Exercise cache misses, including refresh. Optional fonts are tested separately.
  await page.route('**/*', (route) =>
    new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort(),
  );
  await page.addInitScript(() => {
    window.startupFrames = [];
    const sample = () => {
      if (document.body) {
        const style = getComputedStyle(document.body);
        window.startupFrames.push({
          ready: document.documentElement.dataset.appReady === 'true',
          visible: style.visibility === 'visible',
          styled: style.backgroundColor === 'rgb(11, 16, 23)',
        });
      }
      if (!document.documentElement.dataset.appReady) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
});

async function expectReadyTable(page) {
  await expect(page.locator('html')).toHaveAttribute('data-app-ready', 'true');
  await expect(page.locator('body')).toBeVisible();
  await expect(page.locator('.header')).toHaveCSS('display', 'flex');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(11, 16, 23)');
  await expect(page.locator('#hero-cards .playing-card')).toHaveCount(2);
  expect(await page.evaluate(() => document.body.inert)).toBe(false);
  const frames = await page.evaluate(() => window.startupFrames);
  expect(frames.length).toBeGreaterThan(0);
  expect(frames.filter((frame) => frame.visible && (!frame.ready || !frame.styled))).toEqual([]);
}

test('cold load and refresh never paint the HTML shell while the entry script is delayed', async ({
  page,
}) => {
  let pending, requested;
  await page.route(
    (url) => url.pathname === '/src/main.js',
    async (route) => {
      requested = true;
      await pending.promise;
      await route.continue();
    },
  );
  for (const refresh of [false, true]) {
    pending = gate();
    requested = false;
    try {
      await (refresh
        ? page.reload({ waitUntil: 'commit' })
        : page.goto('/', { waitUntil: 'commit' }));
      await expect.poll(() => requested).toBe(true);
      await page.waitForFunction(() => window.startupFrames.length >= 3);
      await expect(page.locator('body')).toBeHidden();
      await expect(page.locator('html')).toHaveCSS('background-color', 'rgb(11, 16, 23)');
      expect(await page.evaluate(() => document.body.inert)).toBe(true);
    } finally {
      pending.release();
    }
    await expectReadyTable(page);
  }
});

test('a delayed local stylesheet cannot expose a partially styled table', async ({ page }) => {
  const pending = gate();
  let requested = false;
  await page.route(
    (url) => url.pathname === '/src/styles/table.css',
    async (route) => {
      requested = true;
      await pending.promise;
      await route.continue();
    },
  );
  try {
    await page.goto('/', { waitUntil: 'commit' });
    await expect.poll(() => requested).toBe(true);
    await expect(page.locator('body')).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.dataset.appReady)).toBeUndefined();
  } finally {
    pending.release();
  }
  await expectReadyTable(page);
});

test('a stalled optional font request does not hold the playable first screen', async ({
  page,
}) => {
  const pending = gate();
  let requested = false;
  await page.route('https://fonts.googleapis.com/**', async (route) => {
    requested = true;
    await pending.promise;
    await route.abort();
  });
  try {
    await page.goto('/', { waitUntil: 'commit' });
    await expect.poll(() => requested).toBe(true);
    await expectReadyTable(page);
    await page.locator('#opponents-button').click();
    await expect(page.locator('#opponents-dialog')).toBeVisible();
  } finally {
    pending.release();
  }
});
