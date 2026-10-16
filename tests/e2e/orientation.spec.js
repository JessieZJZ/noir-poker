import { test, expect } from '@playwright/test';

async function device(browser, baseURL, { width = 390, height = 844, userAgent } = {}) {
  const context = await browser.newContext({
    baseURL,
    locale: 'zh-CN',
    hasTouch: true,
    isMobile: true,
    viewport: { width, height },
    screen: { width, height },
    ...(userAgent ? { userAgent } : {}),
  });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  const rotate = async (landscape) => {
    const size = landscape ? { width: height, height: width } : { width, height };
    await page.setViewportSize(size);
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      ...size,
      screenWidth: size.width,
      screenHeight: size.height,
      deviceScaleFactor: 1,
      mobile: true,
      screenOrientation: {
        type: landscape ? 'landscapePrimary' : 'portraitPrimary',
        angle: landscape ? 90 : 0,
      },
    });
    if (page.url() !== 'about:blank')
      expect(await page.evaluate(() => ({ width: innerWidth, height: innerHeight }))).toEqual(size);
  };
  await rotate(false);
  await page.goto('/');
  await page.waitForFunction(() => document.documentElement.dataset.appReady === 'true');
  return { context, page, rotate };
}

test('phone rotation blocks open dialogs and pauses the same bot, including background overlap', async ({
  browser,
  baseURL,
}, testInfo) => {
  const { context, page, rotate } = await device(browser, baseURL);
  try {
    await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
    await page.clock.pauseAt(new Date('2026-01-01T00:00:01Z'));
    await page.evaluate(() => {
      window.qa.heroTurn(9);
      document.querySelector('#call-button').click();
    });
    await page.clock.runFor(200);
    await page.locator('#opponents-button').click();
    const before = await page.evaluate(() => window.noir.getState());
    const waiting = await page.evaluate(() => window.qa.thinking());
    await rotate(true);
    const guard = page.locator('#orientation-dialog');
    await expect(guard).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(guard).toBeVisible();
    const closeBlocked = await page
      .locator('#opponents-dialog .close-dialog')
      .click({ trial: true, timeout: 300 })
      .then(
        () => false,
        () => true,
      );
    expect(closeBlocked).toBe(true);
    await page.clock.runFor(60000);
    expect(await page.evaluate(() => window.noir.getState())).toEqual(before);
    expect(await page.evaluate(() => window.qa.thinking())).toEqual(waiting);
    await page.screenshot({ path: testInfo.outputPath('phone-landscape.png') });
    await page.evaluate(() =>
      document.dispatchEvent(new CustomEvent('noir:app-state', { detail: { active: false } })),
    );
    await rotate(false);
    await expect(guard).not.toBeVisible();
    await page.clock.runFor(60000);
    expect(await page.evaluate(() => window.noir.getState())).toEqual(before);
    await page.evaluate(() =>
      document.dispatchEvent(new CustomEvent('noir:app-state', { detail: { active: true } })),
    );
    await page.clock.runFor(waiting.delayMs - 201);
    expect(await page.evaluate(() => window.qa.timingRecords())).toEqual([]);
    await page.clock.runFor(2);
    expect(await page.evaluate(() => window.qa.timingRecords())).toHaveLength(1);
    await page.evaluate(() => window.qa.stop());
    await expect(page.locator('#opponents-dialog')).toBeVisible();
    await page.locator('#opponents-dialog .close-dialog').click();
  } finally {
    await context.close();
  }
});

test('a phone opened in landscape is blocked from its first usable frame in every locale', async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(120000);
  const { context, page, rotate } = await device(browser, baseURL);
  try {
    await rotate(true);
    await page.clock.install();
    for (const locale of ['zh-CN', 'en', 'zh-TW', 'ja', 'ko', 'es', 'it', 'pt', 'de', 'fr', 'ru']) {
      await page.evaluate((value) => localStorage.setItem('noir-locale', value), locale);
      await page.reload();
      await expect(page.locator('html')).toHaveAttribute('data-app-ready', 'true');
      await expect(page.locator('#orientation-dialog')).toBeVisible();
      expect(await page.locator('#orientation-title').textContent()).not.toBe('');
      if (!['zh-CN', 'zh-TW', 'ja'].includes(locale))
        expect(await page.locator('#orientation-dialog').textContent()).not.toMatch(
          /\p{Script=Han}/u,
        );
      const before = await page.evaluate(() => window.noir.getState());
      // Jump long idle time without replaying every animation frame in each locale.
      await page.clock.fastForward(60000);
      expect(await page.evaluate(() => window.noir.getState())).toEqual(before);
    }
    await rotate(false);
    await expect(page.locator('#orientation-dialog')).not.toBeVisible();
    await page.locator('#rules-button').click();
    await page.locator('#guide-menu-item').click();
    await expect(page.locator('#rules-dialog')).toBeVisible();
  } finally {
    await context.close();
  }
});

for (const tablet of [
  {
    name: 'iPad',
    width: 820,
    height: 1180,
    userAgent:
      'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',
  },
  { name: 'Android tablet', width: 800, height: 1280 },
]) {
  test(`${tablet.name} switches orientation without a blocker or a new hand`, async ({
    browser,
    baseURL,
  }, testInfo) => {
    const { context, page, rotate } = await device(browser, baseURL, tablet);
    try {
      await page.evaluate(() => {
        window.qa.heroTurn(6);
        window.qa.stop();
      });
      const before = await page.evaluate(() => window.noir.getState());
      for (const landscape of [true, false]) {
        await rotate(landscape);
        await expect(page.locator('#orientation-dialog')).not.toBeVisible();
        expect(await page.evaluate(() => window.noir.getState())).toEqual(before);
        await page.locator('#rules-button').click();
        await page.locator('#guide-menu-item').click();
        await expect(page.locator('#rules-dialog')).toBeVisible();
        await page.locator('#rules-dialog .close-dialog').first().click();
        await page.screenshot({
          path: testInfo.outputPath(`${tablet.name}-${landscape ? 'landscape' : 'portrait'}.png`),
        });
      }
    } finally {
      await context.close();
    }
  });
}

test('desktop landscape windows remain usable', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await expect(page.locator('#orientation-dialog')).not.toBeVisible();
  await page.locator('#opponents-button').click();
  await expect(page.locator('#opponents-dialog')).toBeVisible();
});
