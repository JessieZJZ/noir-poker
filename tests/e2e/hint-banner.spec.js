import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.qa);
  await page.evaluate(() => {
    window.qa.stop();
    return document.fonts.ready;
  });
});

test('the top hint banner updates with the hand and remembers its switch across visits', async ({
  page,
}) => {
  const banner = page.locator('#coach-content'),
    toggle = page.locator('#hint-toggle');
  await expect(page.locator('.sidebar .coach-card, .sidebar #coach-content')).toHaveCount(0);
  await expect(banner).toBeVisible();
  await expect(toggle).toHaveAccessibleName('关闭牌桌提示');
  await expect(toggle).toHaveAttribute('aria-controls', 'coach-content');
  await page.evaluate(() => window.qa.heroTurn(9));
  await expect(page.locator('#coach-stage')).toHaveText('翻牌前策略');
  await expect(page.locator('#coach-tip')).toContainText('跟注占可争夺底池约');
  await page.evaluate(() => window.qa.publicBoard(9));
  await expect(page.locator('#coach-stage')).toHaveText('翻牌策略');
  await page.evaluate(() => window.qa.foldWin(9));
  await expect(page.locator('#coach-stage')).toHaveText('本手复盘');

  await toggle.click();
  await expect(banner).toBeHidden();
  await expect(toggle).toHaveAccessibleName('开启牌桌提示');
  await page.reload();
  await page.waitForFunction(() => !!window.qa);
  await expect(banner).toBeHidden();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await toggle.click();
  await page.reload();
  await page.waitForFunction(() => !!window.qa);
  await expect(banner).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
});

test('banner and switch fit above the table without displacing mobile actions or table inspection', async ({
  page,
}) => {
  for (const size of [
    { width: 320, height: 667 },
    { width: 390, height: 844 },
    { width: 844, height: 390 },
    { width: 1280, height: 900 },
  ]) {
    await page.setViewportSize(size);
    await page.evaluate(() => window.qa.heroTurn(9));
    for (const enabled of [true, false, true]) {
      if ((await page.locator('#hint-toggle').getAttribute('aria-pressed')) !== String(enabled))
        await page.locator('#hint-toggle').click();
      await expect
        .poll(() =>
          page.evaluate((enabled) => {
            const box = (selector) => document.querySelector(selector).getBoundingClientRect(),
              header = box('.header'),
              banner = box('#coach-content'),
              surface = box('.game-surface'),
              viewport = box('.table-viewport'),
              session = box('.session-card'),
              sidebar = box('.sidebar'),
              controls = [...document.querySelectorAll('.header-actions button')].map((el) =>
                el.getBoundingClientRect(),
              );
            const actions = ['#raise-button', '#fold-button', '#call-button'].map(box);
            return (
              document.documentElement.scrollWidth <= innerWidth &&
              controls.every((r) => r.left >= 0 && r.right <= innerWidth) &&
              (!enabled ||
                (banner.top >= header.bottom &&
                  banner.bottom <= surface.top &&
                  document.querySelector('#coach-tip').clientHeight >=
                    document.querySelector('#coach-tip').scrollHeight)) &&
              (innerWidth > 900 ||
                (scrollY === 0 &&
                  viewport.height > 70 &&
                  Math.abs(session.width - sidebar.width) < 1 &&
                  actions.every((r) => r.height >= 44 && r.bottom <= innerHeight)))
            );
          }, enabled),
        )
        .toBe(true);
    }
    if (size.width <= 900) {
      await expect
        .poll(() =>
          page
            .locator('.table-viewport')
            .evaluate((el) => Math.abs(el.scrollHeight - el.clientHeight - el.scrollTop)),
        )
        .toBeLessThan(2);
      const viewport = await page.locator('.table-viewport').boundingBox();
      await page.mouse.move(viewport.x + viewport.width / 2, viewport.y + 25);
      await page.mouse.wheel(0, -2000);
      await expect
        .poll(() => page.locator('.table-viewport').evaluate((el) => el.scrollTop))
        .toBeLessThan(5);
      await page.locator('#hint-toggle').click();
      await page.locator('#hint-toggle').click();
      await expect
        .poll(() => page.locator('.table-viewport').evaluate((el) => el.scrollTop))
        .toBeLessThan(5);
    }
  }
});
