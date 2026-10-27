import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { newGame, startHand, planBotTurn, executeBotTurn } from '../../src/engine/poker.js';
import { cards } from '../fixtures/deceptive-decisions.js';

test('Kai opens UTG aces to 6.5 BB and the actual five-seat table prices the hero call consistently', async ({
  page,
}, info) => {
  const game = newGame(5);
  game.dealer = 0;
  game.difficulty = 'normal';
  startHand(game);
  for (const [id, hole] of [
    [4, 'As Ad'],
    [0, 'Ah 3d'],
  ]) {
    for (const [index, wanted] of cards(hole).entries()) {
      let found;
      for (const group of [...game.players.map((p) => p.hole), game.deck])
        for (let j = 0; j < group.length; j++)
          if (group[j].rank === wanted.rank && group[j].suit === wanted.suit) found = [group, j];
      [game.players[id].hole[index], found[0][found[1]]] = [
        found[0][found[1]],
        game.players[id].hole[index],
      ];
    }
  }
  expect(game.actor).toBe(4);
  const plan = planBotTurn(game, () => 0.4, { timingRandom: () => 0.4 });
  executeBotTurn(game, plan, { expedited: true });
  expect(game.botDecisions.at(-1).amount).toBe(1300);
  expect(game.actor).toBe(0);
  await page.goto('/');
  await page.waitForFunction(() => window.qa);
  await page.evaluate((g) => window.qa.loadRecordedGame(g), game);
  await expect(page.locator('#activity-list')).toContainText(/Kai.*UTG.*开池至 1\.3K/);
  await expect(page.getByRole('button', { name: /^跟注\s*1\.3K$/ })).toBeVisible();
  const heroCards = page.locator('#hero-cards .playing-card');
  await expect(heroCards).toHaveCount(2);
  await expect(heroCards.first()).toHaveAttribute('aria-label', 'A♥');
  await heroCards.evaluateAll(async (cards) => {
    await Promise.all(cards.flatMap((card) => card.getAnimations().map((a) => a.finished)));
  });
  await mkdir('.artifacts/open-sizing-2026-10-25/live-v2/web', { recursive: true });
  const image = path.resolve(
    '.artifacts/open-sizing-2026-10-25/live-v2/web',
    `${info.project.name}-kai-aa-open.png`,
  );
  await page.screenshot({ path: image });
  await info.attach('actual-kai-open-and-call-price', { path: image, contentType: 'image/png' });
});
