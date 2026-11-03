import { test, expect } from '@playwright/test';

// The guide states the chip-leader refill rule and defines CL, in every locale.
for (const [locale, rule, term] of [
  ['zh-CN', /每次补到当前筹码领先者（CL）筹码的一半，按整枚筹码向下取整/, 'CL（筹码领先者）'],
  [
    'en',
    /Each refill brings you to half of the current chip leader’s \(CL\) stack/,
    'CL (chip leader)',
  ],
]) {
  test(`the guide explains refills to half the chip leader and defines CL in ${locale}`, async ({
    page,
  }) => {
    await page.addInitScript((value) => localStorage.setItem('noir-locale', value), locale);
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-app-ready', 'true');
    await page.evaluate(() => window.qa.stop());
    await page.locator('#rules-button').click();
    await page.locator('#guide-menu-item').click();
    const dialog = page.locator('#rules-dialog');
    await expect(dialog.locator('p', { hasText: rule })).toHaveCount(1);
    const entry = dialog.locator('#review-glossary .position-glossary > div', { hasText: term });
    await expect(entry).toHaveCount(1);
    await expect(entry.locator('span')).toContainText(
      locale === 'en' ? 'chip leader' : '筹码最多的玩家',
    );
  });
}
