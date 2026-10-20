import { test, expect } from '@playwright/test';
import { causalReraiseGame } from '../fixtures/review-spots.js';

test('review heading styles, hand identities, position tags and selected activity agree across perspectives', async ({
  page,
}, info) => {
  const game = causalReraiseGame();
  game.players[1].botProfile = 'rook';
  for (const step of game.decisions) step.players.find((p) => p.id === 1).botProfile = 'rook';
  for (const record of game.botDecisions) if (record.id === 1) record.trace.profile = 'rook';
  await page.goto('/');
  await page.waitForFunction(() => window.qa);
  await page.evaluate((g) => window.qa.loadRecordedGame(g), game);
  await expect(page.locator('#activity-list .activity-position').first()).toBeVisible();
  await expect(page.locator('#activity-list')).toContainText('Mia（多街施压）');
  await page.locator('#review-hand-button').click();
  await expect(page.locator('#review-dialog')).toHaveAttribute('data-analysis-status', 'done', {
    timeout: 30000,
  });
  await page.locator('[data-review-index="0"]').click();
  const gold = 'rgb(228, 206, 160)';
  await expect(page.locator('#review-coach-explanation strong').first()).toHaveCSS('color', gold);
  await expect(page.locator('#review-coach-explanation h4')).toHaveCSS('color', gold);
  await expect(page.locator('.review-evidence h3')).toHaveCSS('color', gold);
  await page.locator('#review-activity summary').click();
  await expect(page.locator('#review-activity .activity-position').first()).toBeVisible();
  const plainActor = page
    .locator('.review-activity-emphasis:not(.review-activity-current)')
    .first();
  await expect(plainActor).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(page.locator('.review-activity-current')).toHaveCSS(
    'background-color',
    'rgba(102, 203, 177, 0.14)',
  );
  await expect(page.locator('.review-activity-current')).toHaveCSS('box-shadow', /inset/);
  await page.locator('#review-opponents-tab').click();
  await expect(page.locator('#review-opponent-detail .review-matchups strong').first()).toHaveCSS(
    'color',
    gold,
  );
  await expect(page.locator('#review-opponent-detail h4')).toHaveCSS('color', gold);
  await expect(page.locator('#review-opponent-detail')).toContainText('Mia（多街施压）');
  await expect(page.locator('#review-opponent-detail .review-explanation')).toContainText(
    /在 .* 位/,
  );
  await info.attach('named-review-parity', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
});
