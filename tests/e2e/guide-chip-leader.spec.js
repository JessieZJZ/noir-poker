import { test, expect } from '@playwright/test';

// The guide defines CL, the chip leader a refill is measured against, in every locale.
for (const [locale, term] of [
  ['zh-CN', 'CL（筹码领先者）'],
  ['en', 'CL (chip leader)'],
]) {
  test(`the guide defines CL in ${locale}`, async ({ page }) => {
    await page.addInitScript((value) => localStorage.setItem('noir-locale', value), locale);
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-app-ready', 'true');
    await page.evaluate(() => window.qa.stop());
    await page.locator('#rules-button').click();
    await page.locator('#guide-menu-item').click();
    const dialog = page.locator('#rules-dialog');
    await expect(dialog).not.toContainText(
      locale === 'en' ? 'Each refill brings you' : '每次补到当前筹码领先者',
    );
    const entry = dialog.locator('#review-glossary .position-glossary > div', { hasText: term });
    await expect(entry).toHaveCount(1);
    await expect(entry.locator('span')).toContainText(
      locale === 'en' ? 'chip leader' : '筹码最多的玩家',
    );
  });
}
