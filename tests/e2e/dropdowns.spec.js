import { test, expect, webkit } from '@playwright/test';

test('all choices open the anchored dark list and preserve the hand', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.qa);
  await page.evaluate(() => window.qa.heroTurn(6));
  const before = await page.evaluate(() => window.qa.state());
  await page.locator('#opponents-button').click();
  for (const id of ['language-select', 'player-count', 'emotion-mode']) {
    const trigger = page.locator(`[data-select="${id}"]`);
    await trigger.scrollIntoViewIfNeeded();
    await trigger.click();
    const menu = page.locator('.dropdown-menu');
    await expect(menu).toBeVisible();
    const a = await trigger.boundingBox(),
      b = await menu.boundingBox();
    expect(Math.abs(a.x - b.x)).toBeLessThanOrEqual(1);
    if (b.y > a.y) expect(Math.abs(b.y - a.y - a.height - 4)).toBeLessThanOrEqual(1);
    await expect(menu.locator('[aria-selected="true"]')).toHaveCSS(
      'background-color',
      'rgb(38, 86, 71)',
    );
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(trigger).toBeFocused();
  }
  const trigger = page.locator('[data-select="player-count"]');
  await page.locator('label[for="player-count-trigger"]').click();
  await expect(page.locator('.dropdown-menu')).toBeVisible();
  await page.keyboard.press('Escape');
  await trigger.click();
  await page.getByRole('option', { name: '9 人', exact: true }).click();
  await expect(trigger).toHaveText('9 人');
  await expect(page.locator('#player-count')).toHaveValue('9');
  const after = await page.evaluate(() => window.qa.state());
  expect(after.hand).toBe(before.hand);
  expect(after.players.length).toBe(before.players.length);
  await page.locator('#opponents-dialog .close-dialog').click();
  await page.evaluate(() => window.scrollTo(0, 500));
  await expect.poll(async () => (await page.locator('.header').boundingBox()).y).toBe(0);
});

test('WebKit choices remain anchored after settings scrolling and option focus', async ({
  baseURL,
}) => {
  // Four table sizes in a separate WebKit launch exceed 30 s on hosted runners.
  test.setTimeout(90000);
  const browser = await webkit.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 393, height: 759 }, locale: 'zh-CN' });
    await page.goto(baseURL);
    await page.waitForFunction(() => !!window.qa);
    await page.evaluate(() => {
      window.qa.heroTurn(6);
      document.documentElement.classList.add('native-app');
      document.documentElement.style.setProperty('--safe-area-inset-top', '59px');
      document.documentElement.style.setProperty('--safe-area-inset-bottom', '34px');
    });
    for (const count of ['6', '8', '9', '5']) {
      await page.locator('#opponents-button').click();
      await page
        .locator('#opponents-dialog .opponents-body')
        .evaluate((el) => (el.scrollTop = 2000));
      const trigger = page.locator('[data-select="player-count"]');
      await trigger.scrollIntoViewIfNeeded();
      await trigger.click();
      await page.locator('#opponents-dialog .opponents-body').evaluate((el) => (el.scrollTop += 1));
      await expect(page.locator('.dropdown-menu')).toBeVisible();
      const a = await trigger.boundingBox(),
        b = await page.locator('.dropdown-menu').boundingBox();
      expect(Math.abs(b.y - a.y - a.height - 4)).toBeLessThanOrEqual(2);
      await page.locator(`.dropdown-option[data-value="${count}"]`).click();
      await expect(page.locator('#player-count')).toHaveValue(count);
      await expect(page.locator('.dropdown-menu')).toHaveCount(0);
      await page.locator('#opponents-dialog .close-dialog').click();
    }
  } finally {
    await browser.close();
  }
});

test('fractional public-card widths stay in five or three-plus-two fixed tracks', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.waitForFunction(() => !!window.qa);
  for (const width of [320, 393, 412, 415, 427, 440]) {
    await page.setViewportSize({ width, height: 952 });
    for (const count of [5, 6, 7, 8, 9]) {
      await page.evaluate((count) => window.qa.publicBoard(count), count);
      const rows = await page.locator('#board').evaluate((board) => {
        const groups = [];
        for (const el of board.children) {
          const y = el.getBoundingClientRect().top;
          let row = groups.find((r) => Math.abs(r.y - y) < 1);
          if (!row) groups.push((row = { y, count: 0 }));
          row.count++;
        }
        return groups.sort((a, b) => a.y - b.y).map((r) => r.count);
      });
      expect([[5], [3, 2]]).toContainEqual(rows);
    }
  }
});
