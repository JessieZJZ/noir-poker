import { test, expect } from '@playwright/test';
import { openSettings } from './settings-helpers.js';

const musicState = (page) =>
  page.locator('audio[data-background-music]').evaluate((audio) => ({
    paused: audio.paused,
    loop: audio.loop,
    time: audio.currentTime,
    duration: audio.duration,
    ready: audio.readyState,
    source: audio.currentSrc,
  }));

test('a touch browser plays the phone master and its own music switch', async ({ browser }) => {
  const context = await browser.newContext({
    hasTouch: true,
    viewport: { width: 390, height: 844 },
    locale: 'zh-CN',
  });
  try {
    const page = await context.newPage();
    await page.goto('/');
    await page.waitForFunction(() => !!window.qa);
    await openSettings(page);
    await expect.poll(async () => (await musicState(page)).paused).toBe(false);
    expect(new URL((await musicState(page)).source).pathname).toBe(
      '/audio/background-music-mobile.m4a',
    );
    // Sound effects and background music are separate switches.
    await page.locator('#sound-button').click();
    expect((await musicState(page)).paused).toBe(false);
    await page.locator('#music-button').click();
    expect((await musicState(page)).paused).toBe(true);
    await expect(page.locator('#vibration-button')).toHaveAttribute('aria-checked', 'true');
  } finally {
    await context.close();
  }
});

test('music loops locally, sound, music and vibration are independent and survive reload', async ({
  page,
}) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.qa);
  await page.evaluate(() => window.qa.stop());
  await openSettings(page);
  await expect(page.locator('#sound-button')).toHaveAccessibleName('音效');
  await expect(page.locator('#music-button')).toHaveAccessibleName('背景音乐');
  await expect(page.locator('#vibration-button')).toHaveAccessibleName('振动');
  await expect(page.locator('#vibration-button')).toHaveAttribute('aria-checked', 'true');
  await expect.poll(async () => (await musicState(page)).ready).toBeGreaterThanOrEqual(2);
  await expect.poll(async () => (await musicState(page)).paused).toBe(false);
  const initial = await musicState(page);
  expect(initial.loop).toBe(true);
  expect(initial.duration).toBeGreaterThan(93);
  expect(new URL(initial.source).pathname).toBe('/audio/background-music.m4a');
  await page.locator('audio[data-background-music]').evaluate((audio) => {
    audio.currentTime = audio.duration - 0.15;
  });
  await expect.poll(async () => (await musicState(page)).time).toBeLessThan(3);
  await expect.poll(async () => (await musicState(page)).paused).toBe(false);
  // Muting sound effects leaves the music playing; the music switch pauses it.
  await page.locator('#sound-button').click();
  expect((await musicState(page)).paused).toBe(false);
  await page.locator('#music-button').click();
  expect((await musicState(page)).paused).toBe(true);
  await expect(page.locator('#vibration-button')).toHaveAttribute('aria-checked', 'true');
  await page.reload();
  await page.waitForFunction(() => !!window.qa);
  await openSettings(page);
  await expect(page.locator('#sound-button')).toHaveAttribute('aria-checked', 'false');
  await expect(page.locator('#music-button')).toHaveAttribute('aria-checked', 'false');
  await expect(page.locator('#vibration-button')).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('audio[data-background-music]')).toHaveCount(0);
  await page.locator('#vibration-button').click();
  await page.locator('#music-button').click();
  await expect.poll(async () => (await musicState(page)).paused).toBe(false);
  await expect(page.locator('#vibration-button')).toHaveAttribute('aria-checked', 'false');
  await page.reload();
  await page.waitForFunction(() => !!window.qa);
  await openSettings(page);
  await expect(page.locator('#sound-button')).toHaveAttribute('aria-checked', 'false');
  await expect(page.locator('#music-button')).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('#vibration-button')).toHaveAttribute('aria-checked', 'false');
  await page.locator('#music-button').click();
  await page.locator('#sound-button').click();
  await page.reload();
  await page.waitForFunction(() => !!window.qa);
  await openSettings(page);
  await expect(page.locator('#sound-button')).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('#music-button')).toHaveAttribute('aria-checked', 'false');
  await expect(page.locator('audio[data-background-music]')).toHaveCount(0);
});

test('background pauses music, foreground resumes it, and hands/retry/reset do not duplicate it', async ({
  page,
}) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.qa);
  await openSettings(page);
  await expect.poll(async () => (await musicState(page)).paused).toBe(false);
  await expect.poll(async () => (await musicState(page)).time).toBeGreaterThan(0.1);
  await page.evaluate(() =>
    document.dispatchEvent(new CustomEvent('noir:app-state', { detail: { active: false } })),
  );
  const paused = await musicState(page);
  expect(paused.paused).toBe(true);
  await page.waitForTimeout(250);
  expect(Math.abs((await musicState(page)).time - paused.time)).toBeLessThan(0.05);
  await page.evaluate(() =>
    document.dispatchEvent(new CustomEvent('noir:app-state', { detail: { active: true } })),
  );
  await expect.poll(async () => (await musicState(page)).paused).toBe(false);
  await page.evaluate(() => {
    window.qa.foldWin(5);
    document.querySelector('#next-button').click();
    document.querySelector('#restart-hand-button').click();
    document.querySelector('#confirm-reset').click();
    window.qa.stop();
  });
  await expect(page.locator('audio[data-background-music]')).toHaveCount(1);
  await expect.poll(async () => (await musicState(page)).paused).toBe(false);
});
