import { expect } from '@playwright/test';

export async function openSettings(page) {
  const dialog = page.locator('#opponents-dialog');
  if (!(await dialog.isVisible())) await page.locator('#opponents-button').click();
  await expect(dialog).toBeVisible();
}

export async function closeSettings(page) {
  const dialog = page.locator('#opponents-dialog');
  if (await dialog.isVisible()) await dialog.locator('.close-dialog').click();
  await expect(dialog).toBeHidden();
}

export async function toggleSound(page) {
  await openSettings(page);
  await page.locator('#sound-button').click();
  await closeSettings(page);
}

export async function setPlayerCount(page, count) {
  await openSettings(page);
  await page.locator('#player-count').selectOption(String(count));
  await closeSettings(page);
}
