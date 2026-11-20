import { test, expect } from '@playwright/test';

const SIZES = [
  [320, 568],
  [360, 640],
  [375, 667],
  [360, 800],
  [375, 812],
  [390, 844],
  [393, 852],
  [412, 915],
  [430, 932],
  [600, 960],
  [768, 1024],
  [820, 1180],
  [1024, 1366],
  [1024, 768],
  [1180, 820],
  [1280, 800],
  [1366, 1024],
];

async function device(browser, baseURL, width, height) {
  const context = await browser.newContext({
    baseURL,
    locale: 'zh-CN',
    hasTouch: true,
    isMobile: true,
    viewport: { width, height },
    screen: { width, height },
  });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  const rotate = async (landscape) => {
    const size =
      landscape === width > height ? { width, height } : { width: height, height: width };
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
  };
  await page.goto('/');
  // Several fresh contexts can share the dev server's first compile.
  await expect(page.locator('html')).toHaveAttribute('data-app-ready', 'true', { timeout: 30000 });
  await page.evaluate(() => {
    window.qa.stop();
    window.qa.skipTutorialReading();
  });
  await page.locator('#rules-button').click();
  await page.locator('#tutorial-menu-item').click();
  await page.locator('#tutorial-dialog-primary').click();
  await expect(page.locator('#tutorial-coach')).toBeVisible();
  return { context, page, rotate };
}
const coach = (page) => page.evaluate(() => window.noir.getState().tutorial);
// Reads the steps up to the first decision the lesson hands to the player.
async function reachHeroTurn(page) {
  await expect
    .poll(
      async () => {
        const view = await coach(page);
        if (view.canContinue) await page.locator('#tutorial-next').click();
        return view.allowed?.action ?? null;
      },
      { timeout: 30000 },
    )
    .toBe('call');
}
async function expectLessonOnScreen(page) {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const box = (selector) => document.querySelector(selector).getBoundingClientRect();
        const overlap = (a, b) =>
          a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
        const panel = box('#tutorial-coach'),
          dock = box('.action-dock');
        return {
          overflow: document.documentElement.scrollWidth > innerWidth,
          panelVisible: panel.top >= 0 && panel.bottom <= innerHeight,
          dockVisible: dock.bottom <= innerHeight,
          coversDock: overlap(panel, dock),
          coversHero: overlap(panel, box('.hero-name')),
          tableHeight: box('#arena').height >= 170,
        };
      }),
    )
    .toEqual({
      overflow: false,
      panelVisible: true,
      dockVisible: true,
      coversDock: false,
      coversHero: false,
      tableHeight: true,
    });
}

for (const [width, height] of SIZES)
  test(`the lesson stays on the first screen at ${width}x${height}`, async ({
    browser,
    baseURL,
  }, info) => {
    test.skip(info.project.name !== 'desktop');
    const { context, page } = await device(browser, baseURL, width, height);
    await expectLessonOnScreen(page);
    await reachHeroTurn(page);
    await expectLessonOnScreen(page);
    const action = await page.locator('#call-button').boundingBox();
    expect(action.y + action.height).toBeLessThanOrEqual(height);
    await context.close();
  });

test('rotating a phone blocks and freezes the lesson, then resumes the same step', async ({
  browser,
  baseURL,
}, info) => {
  test.skip(info.project.name !== 'desktop');
  const { context, page, rotate } = await device(browser, baseURL, 390, 844);
  await reachHeroTurn(page);
  await page.locator('#call-button').click();
  await rotate(true);
  await expect(page.locator('#orientation-dialog')).toBeVisible();
  const frozen = await page.evaluate(() => window.noir.getState());
  await page.waitForTimeout(1600);
  expect(await page.evaluate(() => window.noir.getState())).toEqual(frozen);
  await rotate(false);
  await expect(page.locator('#orientation-dialog')).toBeHidden();
  await expect(page.locator('#tutorial-coach')).toBeVisible();
  // The call explanation still waits for Continue; the bots resume after it.
  expect(await page.evaluate(() => window.noir.getState())).toEqual(frozen);
  await page.locator('#tutorial-coach #tutorial-next').click();
  await expect
    .poll(() => page.evaluate(() => JSON.stringify(window.noir.getState())), { timeout: 8000 })
    .not.toBe(JSON.stringify(frozen));
  expect((await coach(page)).lessonLabel).toBe(frozen.tutorial.lessonLabel);
  await expectLessonOnScreen(page);
  await context.close();
});

test('rotating a tablet moves the panel without losing the lesson or the table', async ({
  browser,
  baseURL,
}, info) => {
  test.skip(info.project.name !== 'desktop');
  const { context, page, rotate } = await device(browser, baseURL, 820, 1180);
  await reachHeroTurn(page);
  const portrait = await coach(page);
  const portraitPanel = await page.locator('#tutorial-coach').boundingBox();
  // A rotation keeps the old offset unless the tutorial clears it; a player who
  // scrolled to the hand log would otherwise lose the panel's text.
  await page.evaluate(() => window.scrollTo(0, 240));
  await rotate(true);
  await expect(page.locator('#orientation-dialog')).toBeHidden();
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
  await expect
    .poll(async () => (await page.locator('#tutorial-coach').boundingBox()).x)
    .toBeGreaterThan(600);
  await expectLessonOnScreen(page);
  expect(await coach(page)).toEqual(portrait);
  await page.evaluate(() => window.scrollTo(0, 240));
  await rotate(false);
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
  await expect
    .poll(async () => (await page.locator('#tutorial-coach').boundingBox()).width)
    .toBe(portraitPanel.width);
  await expectLessonOnScreen(page);
  await page.locator('#call-button').click();
  await expect.poll(async () => (await coach(page)).allowed?.action).toBe('none');
  await context.close();
});
