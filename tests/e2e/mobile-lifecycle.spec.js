import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.qa);
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-01-01T00:00:01Z'));
});

const active = (page, value) =>
  page.evaluate(
    (active) => document.dispatchEvent(new CustomEvent('noir:app-state', { detail: { active } })),
    value,
  );

test('background pauses the same bot plan and restores only its remaining thinking time', async ({
  page,
}) => {
  const waiting = await page.evaluate(() => {
    window.qa.heroTurn(9);
    document.querySelector('#call-button').click();
    return window.qa.thinking();
  });
  await page.clock.runFor(400);
  await active(page, false);
  const before = await page.evaluate(() => window.noir.getState());
  await page.clock.runFor(60000);
  expect(await page.evaluate(() => window.noir.getState())).toEqual(before);
  expect(await page.evaluate(() => window.qa.thinking())).toEqual(waiting);
  await active(page, true);
  await page.clock.runFor(waiting.delayMs - 401);
  expect(await page.evaluate(() => window.qa.timingRecords())).toEqual([]);
  await page.clock.runFor(2);
  const records = await page.evaluate(() => window.qa.timingRecords());
  expect(records).toHaveLength(1);
  expect(records[0].thinking.model).toBe('policy-pacing-v2');
  expect(records[0].thinking.waitedMs).toBeGreaterThanOrEqual(waiting.delayMs);
  expect(records[0].thinking.waitedMs).toBeLessThan(waiting.delayMs + 20);
  await page.evaluate(() => window.qa.stop());
});

test('fast-finish waits in the background and an intervening reset cancels its old hand', async ({
  page,
}) => {
  await page.evaluate(() => {
    window.qa.heroTurn(9);
    document.querySelector('#fold-button').click();
    document.querySelector('#continue-deal-button').click();
  });
  await active(page, false);
  const before = await page.evaluate(() => window.noir.getState());
  await page.clock.runFor(60000);
  expect(await page.evaluate(() => window.noir.getState())).toEqual(before);
  await page.evaluate(() => {
    document.querySelector('#reset-button').click();
    document.querySelector('#confirm-reset').click();
    window.qa.stop();
  });
  const reset = await page.evaluate(() => window.noir.getState());
  await active(page, true);
  await page.evaluate(() => window.qa.stop());
  await page.clock.runFor(1000);
  expect(await page.evaluate(() => window.noir.getState())).toEqual(reset);
});

test('already-settled practice runout also waits until the app resumes', async ({ page }) => {
  await page.evaluate(() => window.qa.foldWin(9));
  await active(page, false);
  await page.evaluate(() => document.querySelector('#continue-deal-button').click());
  await page.clock.runFor(1000);
  expect((await page.evaluate(() => window.noir.getState())).board).toHaveLength(0);
  await active(page, true);
  await page.clock.runFor(1);
  expect((await page.evaluate(() => window.noir.getState())).board).toHaveLength(5);
});
