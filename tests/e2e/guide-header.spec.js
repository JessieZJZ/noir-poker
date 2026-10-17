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
