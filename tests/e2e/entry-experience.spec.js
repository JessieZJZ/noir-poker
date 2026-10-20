import { test, expect, chromium } from '@playwright/test';

test('all entry locales fit 320px and 390px touch viewports with labelled settings', async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(120000);
  const context = await browser.newContext({ baseURL, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  try {
    await page.goto('/');
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      for (const locale of [
        'zh-CN',
        'en',
        'zh-TW',
        'ja',
        'ko',
        'es',
        'it',
        'pt',
        'de',
        'fr',
        'ru',
      ]) {
        await page.evaluate((value) => localStorage.setItem('noir-locale', value), locale);
        await page.reload();
        await expect(page.locator('html')).toHaveAttribute('data-app-ready', 'true');
        await expect
          .poll(() =>
            page.evaluate(() => {
              const nav = document.querySelector('.header-actions').getBoundingClientRect();
              return {
                width: innerWidth,
                scroll: document.documentElement.scrollWidth,
                navFits: nav.left >= 0 && nav.right <= document.documentElement.clientWidth,
                settingsHeight: document.querySelector('#opponents-button').getBoundingClientRect()
                  .height,
                resetFits: (() => {
                  const card = document.querySelector('.session-card').getBoundingClientRect();
                  const title = document.querySelector('.session-card h2').getBoundingClientRect();
                  const reset = document.querySelector('#reset-button').getBoundingClientRect();
                  return (
                    reset.left >= title.right + 8 && reset.right <= card.right && reset.height >= 44
                  );
                })(),
                settingsOnRight:
                  document.querySelector('#rules-button').getBoundingClientRect().right <=
                  document.querySelector('#opponents-button').getBoundingClientRect().left,
              };
            }),
          )
          .toEqual({
            width,
            scroll: width,
            navFits: true,
            settingsHeight: 44,
            resetFits: true,
            settingsOnRight: true,
          });
      }
    }
  } finally {
    await context.close();
  }
});
import { openSettings, closeSettings } from './settings-helpers.js';

for (const count of [5, 6, 7, 8, 9]) {
  test(`${count} seats wait for entry, preserve chips and deal once before actions`, async ({
    page,
  }, testInfo) => {
    await page.addInitScript(
      (count) => localStorage.setItem('noir-table-v1', JSON.stringify({ playerCount: count })),
      count,
    );
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-app-ready', 'true');
    await expect(page.locator('#join-table-button')).toBeVisible();
    await expect(page.locator('#seats .seat')).toHaveCount(count - 1);
    await expect(page.locator('#hero-cards .playing-card, #seats .card-back')).toHaveCount(0);
    await expect(page.locator('.activity-card')).toBeHidden();
    const before = await page.evaluate(() => window.noir.getState());
    expect(before.phase).toBe('idle');
    await expect(page.locator('#street-label')).toHaveText('等待入座，即将开始第 1 局第 1 手');
    expect(before.pot).toBe(0);
    expect(before.hole).toEqual([]);
    expect(before.players.every((player) => player.bet === 0)).toBe(true);
    await page.waitForTimeout(1400);
    expect(await page.evaluate(() => window.noir.getState())).toEqual(before);
    const chrome = await page.evaluate(() => {
      const settings = document.querySelector('#opponents-button');
      const menu = document.querySelector('#rules-button');
      const a = getComputedStyle(settings),
        b = getComputedStyle(menu);
      const ar = settings.getBoundingClientRect(),
        br = menu.getBoundingClientRect();
      return {
        border: a.borderWidth,
        font: a.fontSize,
        menuFont: b.fontSize,
        weight: a.fontWeight,
        menuWeight: b.fontWeight,
        gap: ar.left - br.right,
        height: ar.height,
        icon: settings.querySelector('svg').getBoundingClientRect().width,
        dock: document.querySelector('.action-dock-slot').getBoundingClientRect().height,
      };
    });
    expect(chrome.border).toBe('0px');
    expect(chrome.font).toBe(chrome.menuFont);
    expect(chrome.weight).toBe(chrome.menuWeight);
    expect(chrome.height).toBeGreaterThanOrEqual(44);
    expect(chrome.icon).toBeLessThanOrEqual(20);
    expect(chrome.gap).toBeGreaterThanOrEqual(10);
    expect(chrome.dock).toBe(0);
    await page.screenshot({
      path: testInfo.outputPath(`entry-${count}-seats.png`),
      fullPage: true,
    });
    // Start from a known clock and pause well ahead of installation. Using the
    // host's current time can already be in the past when a busy runner applies it.
    await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
    await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'));
    await page.locator('#join-table-button').click();
    await expect(page.locator('.game-surface')).toHaveAttribute('data-entry-state', 'dealing');
    const dealt = await page.evaluate(() => window.noir.getState());
    expect(dealt.hand).toBe(before.hand + 1);
    expect(dealt.hole).toHaveLength(2);
    expect(dealt.players.reduce((sum, player) => sum + player.stack, 0) + dealt.pot).toBe(
      before.players.reduce((sum, player) => sum + player.stack, 0),
    );
    for (const control of await page.locator('.action-buttons button').all())
      await expect(control).toBeDisabled();
    await page.clock.runFor(1000);
    expect(await page.evaluate(() => window.noir.getState())).toEqual(dealt);
    await page.clock.runFor(400);
    await expect(page.locator('.game-surface')).toHaveAttribute('data-entry-state', 'playing');
    await expect(page.locator('.activity-card')).toBeVisible();
    expect((await page.evaluate(() => window.noir.getState())).hand).toBe(dealt.hand);
  });
}

test('waiting settings update the undealt table and a reload waits for the next hand in the same session', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('#join-table-button')).toBeVisible();
  await openSettings(page);
  await page.locator('#player-count').selectOption('9');
  await page.evaluate(() => window.noir.requestSmallBlind('250'));
  await closeSettings(page);
  const waiting = await page.evaluate(() => window.noir.getState());
  expect(waiting.playerCount).toBe(9);
  expect(waiting.smallBlind).toBe(250);
  expect(waiting.pot).toBe(0);
  expect(waiting.hand).toBe(0);
  await page.locator('#join-table-button').click();
  await expect(page.locator('.game-surface')).toHaveAttribute('data-entry-state', 'playing');
  await page.evaluate(() => {
    window.qa.stop();
    window.qa.recordsFinish();
  });
  const completed = await page.evaluate(() => window.noir.getState());
  await page.reload();
  await expect(page.locator('#join-table-button')).toBeVisible();
  const resumed = await page.evaluate(() => window.noir.getState());
  expect(resumed.sessionNumber).toBe(completed.sessionNumber);
  await expect(page.locator('#street-label')).toHaveText(
    `等待入座，即将开始第 ${completed.sessionNumber} 局第 ${completed.hand + 1} 手`,
  );
  expect(resumed.hand).toBe(completed.hand);
  expect(resumed.players.map((player) => player.stack)).toEqual(
    completed.players.map((player) => player.stack),
  );
  await expect(page.locator('#entry-welcome')).not.toContainText('第一手');
  await page.locator('#join-table-button').click();
  expect((await page.evaluate(() => window.noir.getState())).hand).toBe(completed.hand + 1);
  await page.evaluate(() => window.noir.requestSmallBlind('500'));
  await page.reload();
  await expect(page.locator('#join-table-button')).toBeVisible();
  const changed = await page.evaluate(() => window.noir.getState());
  expect(changed.phase).toBe('idle');
  expect(changed.smallBlind).toBe(500);
  expect(changed.hand).toBe(0);
  await expect(page.locator('#street-label')).toHaveText(
    `等待入座，即将开始第 ${completed.sessionNumber + 1} 局第 1 手`,
  );
});

test('a pending deal pauses in background and cannot advance a replacement hand', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('#join-table-button')).toBeVisible();
  await page.waitForTimeout(700);
  await page.clock.install();
  await page.locator('#join-table-button').click();
  await page.clock.runFor(300);
  await page.evaluate(() =>
    document.dispatchEvent(new CustomEvent('noir:app-state', { detail: { active: false } })),
  );
  const paused = await page.evaluate(() => window.noir.getState());
  await page.clock.runFor(10000);
  expect(await page.evaluate(() => window.noir.getState())).toEqual(paused);
  await page.evaluate(() =>
    document.dispatchEvent(new CustomEvent('noir:app-state', { detail: { active: true } })),
  );
  await page.clock.runFor(700);
  await expect(page.locator('.game-surface')).toHaveAttribute('data-entry-state', 'dealing');
  await page.clock.runFor(400);
  await expect(page.locator('.game-surface')).toHaveAttribute('data-entry-state', 'playing');
});

test('autoplay-capable entry fades real local music from its start before joining and resumes in place', async ({
  baseURL,
}) => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
    await page.addInitScript(() => {
      window.musicStarts = [];
      document.addEventListener(
        'playing',
        ({ target }) => {
          if (target.matches?.('audio[data-background-music]'))
            window.musicStarts.push({
              time: target.currentTime,
              gain: Number(target.dataset.musicGain),
            });
        },
        true,
      );
    });
    await page.goto(baseURL);
    const read = () =>
      page.evaluate(() => {
        const audio = document.querySelector('audio[data-background-music]');
        return (
          audio && {
            time: audio.currentTime,
            paused: audio.paused,
            gain: Number(audio.dataset.musicGain),
            count: document.querySelectorAll('audio[data-background-music]').length,
          }
        );
      });
    await expect.poll(read).toMatchObject({ paused: false, count: 1 });
    // Observe the actual playback event, even if a busy host delays the next driver round trip.
    const initial = await page.evaluate(() => window.musicStarts[0]);
    expect(initial.time).toBeLessThan(0.8);
    expect(initial.gain).toBeLessThan(0.3);
    expect((await page.evaluate(() => window.noir.getState())).phase).toBe('idle');
    await expect.poll(async () => (await read()).gain).toBe(1);
    await page.locator('#join-table-button').click();
    const joined = await read();
    expect(joined.time).toBeGreaterThan(initial.time);
    expect(joined.count).toBe(1);
    await page.evaluate(() =>
      document.dispatchEvent(new CustomEvent('noir:app-state', { detail: { active: false } })),
    );
    const paused = await read();
    expect(paused.paused).toBe(true);
    expect(paused.gain).toBe(0);
    await page.evaluate(() =>
      document.dispatchEvent(new CustomEvent('noir:app-state', { detail: { active: true } })),
    );
    await expect.poll(async () => (await read()).paused).toBe(false);
    const resumed = await read();
    expect(resumed.time).toBeGreaterThanOrEqual(paused.time);
    expect(resumed.time - paused.time).toBeLessThan(0.8);
    await expect.poll(async () => (await read()).gain).toBe(1);
  } finally {
    await browser.close();
  }
});
