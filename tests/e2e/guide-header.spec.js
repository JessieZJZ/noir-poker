import { test, expect } from '@playwright/test';

for (const native of [false, true]) {
  test(`guide keeps its title and close button visible while content scrolls${native ? ' with native safe areas' : ''}`, async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-app-ready', 'true');
    await page.evaluate((native) => {
      window.qa.stop();
      if (native) {
        document.documentElement.classList.add('native-app');
        document.documentElement.style.setProperty('--safe-area-inset-top', '44px');
        document.documentElement.style.setProperty('--safe-area-inset-bottom', '34px');
      }
    }, native);
    await page.locator('#rules-button').click();
    await page.locator('#guide-menu-item').click();
    const dialog = page.locator('#rules-dialog');
    const header = dialog.locator('.dialog-header');
    const body = dialog.locator('.guide-body');
    const before = await header.boundingBox();
    await body.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await expect.poll(() => body.evaluate((element) => element.scrollTop)).toBeGreaterThan(100);
    const after = await header.boundingBox();
    expect(Math.abs(after.y - before.y)).toBeLessThan(1);
    expect(after.y).toBeGreaterThanOrEqual(native ? 44 : 0);
    expect((await body.boundingBox()).y).toBeGreaterThanOrEqual(after.y + after.height - 1);
    await header.locator('.close-dialog').click();
    await expect(dialog).not.toBeVisible();
  });
}

for (const native of [false, true]) {
  test(`hand rankings shortcut opens the correct guide section and normal guide returns to the start${native ? ' in the app layout' : ''}`, async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-app-ready', 'true');
    await page.evaluate((native) => {
      window.qa.heroTurn(7);
      window.qa.stop();
      if (native) document.documentElement.classList.add('native-app');
    }, native);
    const shortcut = page.locator('#hand-rankings-button');
    const dialog = page.locator('#rules-dialog');
    const body = dialog.locator('.guide-body');
    const target = dialog.locator('#hand-rankings');
    const table = await page.locator('#arena').boundingBox();
    for (let attempt = 0; attempt < 2; attempt++) {
      await expect(shortcut).toBeEnabled();
      const button = await shortcut.boundingBox();
      expect(button.x + button.width).toBeLessThanOrEqual(page.viewportSize().width);
      await shortcut.click();
      await expect(dialog).toBeVisible();
      await expect(target).toBeFocused();
      const top = (await target.boundingBox()).y;
      const bodyTop = (await body.boundingBox()).y;
      expect(top - bodyTop).toBeGreaterThanOrEqual(0);
      expect(top - bodyTop).toBeLessThanOrEqual(14);
      await expect.poll(() => body.evaluate((el) => el.scrollTop)).toBeGreaterThan(50);
      await expect(dialog.locator('.hand-example')).toHaveCount(9);
      await dialog.locator('.dialog-header .close-dialog').click();
      expect(await page.locator('#arena').boundingBox()).toEqual(table);
    }
    await page.locator('#rules-button').click();
    await page.locator('#guide-menu-item').click();
    expect(await body.evaluate((el) => el.scrollTop)).toBe(0);
    await expect(dialog.locator('#rules-dialog-title')).toBeInViewport();
  });
}

test('hand rankings label follows every language without overflowing the action row', async ({
  page,
}) => {
  const labels = {
    'zh-CN': '牌力表',
    en: 'Hand rankings',
    'zh-TW': '牌力表',
    ja: '役一覧',
    ko: '족보',
    es: 'Manos',
    it: 'Valore mani',
    pt: 'Ranking de mãos',
    de: 'Handrangfolge',
    fr: 'Force des mains',
    ru: 'Комбинации',
  };
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-app-ready', 'true');
  await page.evaluate(() => {
    window.qa.heroTurn(7);
    window.qa.stop();
  });
  for (const [locale, label] of Object.entries(labels)) {
    await page.locator('#opponents-button').click();
    await page.locator('#language-select').selectOption(locale);
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await page.locator('#opponents-dialog .close-dialog').click();
    const shortcut = page.locator('#hand-rankings-button');
    await expect(shortcut).toHaveText(label);
    expect(await shortcut.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    const rect = await shortcut.boundingBox();
    expect(rect.x + rect.width).toBeLessThanOrEqual(page.viewportSize().width);
    await shortcut.click();
    const target = page.locator('#hand-rankings'),
      body = page.locator('#rules-dialog .guide-body');
    expect((await target.boundingBox()).y - (await body.boundingBox()).y).toBeLessThanOrEqual(14);
    await page.locator('#rules-dialog .dialog-header .close-dialog').click();
  }
});
