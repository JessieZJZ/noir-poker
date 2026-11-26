import { expect } from '@playwright/test';

export async function openSettings(page) {
  // Until the app is ready the launch screen covers the page. Clicking through
  // it makes Playwright retry with another scroll alignment, which leaves the
  // document scrolled and breaks later first-screen layout checks.
  await expect(page.locator('html')).toHaveAttribute('data-app-ready', 'true');
  const dialog = page.locator('#opponents-dialog');
  if (!(await dialog.isVisible())) await page.locator('#opponents-button').click();
  await expect(dialog).toBeVisible();
}

export async function closeSettings(page) {
  const dialog = page.locator('#opponents-dialog');
  if (await dialog.isVisible()) await dialog.locator('.close-dialog').click();
  await expect(dialog).toBeHidden();
  // Closing pops the history entry settings held for Back. A reload or
  // navigation started before that pop lands can be swallowed by it.
  await expect
    .poll(() => page.evaluate(() => history.state?.noirLayer ?? null))
    .not.toBe('dialog:opponents-dialog');
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

// Explicit names keep layout fixtures deterministic; mixed lineups are random.
export async function assignNamedLineup(page) {
  const assignments = ['rook', 'owen', 'vale', 'jett', 'mira', 'nico', 'iris', 'balanced'];
  for (const [index, style] of assignments.entries())
    await page.locator(`[data-bot-seat="${index + 1}"]`).selectOption(style);
}
