import { test, expect } from '@playwright/test';

const key = 'noir-player-observations-v1';
const profile = (page) => page.evaluate((name) => JSON.parse(localStorage.getItem(name)), key);

test('completed player observations survive retry, reload and a new Web table without changing styles', async ({
  page,
}) => {
  await page.goto('/');
  await page.waitForFunction(() => window.qa);
  await page.locator('#join-table-button').click();
  await page.evaluate(() => window.qa.stop());
  const finish = async (raise) =>
    page.evaluate((raise) => {
      window.qa.stop();
      let steps = 0;
      while (window.qa.snapshot().phase !== 'done') {
        if (++steps > 30) throw Error('The public-action hand did not terminate');
        const game = window.qa.snapshot();
        if (game.actor === 0 && raise) {
          const legal = window.noir.getState().legal;
          window.qa.seatAction('raise', legal.maxRaiseTo);
        } else window.qa.seatAction('fold');
      }
      return window.qa
        .snapshot()
        .players.slice(1)
        .map((player) => player.botProfile);
    }, raise);
  const styles = await finish(true);
  const first = await profile(page);
  expect(first.totalHands).toBe(1);
  expect(first.samples[0].largeRaiseHands).toBe(1);
  expect(JSON.stringify(first)).not.toMatch(/hole|deck|winner|payout|botProfile/);
  await page.locator('#restart-hand-button').click();
  await page.evaluate(() => window.qa.stop());
  const retracted = await profile(page);
  expect(retracted.totalHands).toBe(0);
  expect(retracted.revision).toBeGreaterThan(first.revision);
  await finish(false);
  const replacement = await profile(page);
  expect(replacement.totalHands).toBe(1);
  expect(replacement.samples[0].largeRaiseHands).toBe(0);
  await page.reload();
  await page.waitForFunction(() => window.qa);
  expect(await profile(page)).toEqual(replacement);
  expect(await page.evaluate(() => window.qa.snapshot().players[0].publicReads)).toEqual(
    replacement.samples,
  );
  await page.locator('#join-table-button').click();
  await page.evaluate(() => window.qa.stop());
  await page.locator('#reset-button').click();
  await page.locator('#confirm-reset').click();
  await page.evaluate(() => window.qa.stop());
  expect(await profile(page)).toEqual(replacement);
  expect(await page.evaluate(() => window.qa.snapshot().players[0].publicReads)).toEqual(
    replacement.samples,
  );
  expect(
    await page.evaluate(() =>
      window.qa
        .snapshot()
        .players.slice(1)
        .map((player) => player.botProfile),
    ),
  ).toEqual(styles);
});
