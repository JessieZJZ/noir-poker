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

// There is one shared preference control: on wide screens it lives on the
// persistent coach card, and on compact screens it lives inside settings.
export async function toggleHints(page) {
  const dialog = page.locator('#opponents-dialog');
  const wasOpen = await dialog.isVisible();
  const inSettings = await page.locator('#hint-toggle').evaluate((el) => !!el.closest('dialog'));
  if (inSettings) await openSettings(page);
  else await closeSettings(page);
  await page.locator('#hint-toggle').click();
  if (wasOpen) await openSettings(page);
  else await closeSettings(page);
}
