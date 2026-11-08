import { test, expect } from '@playwright/test';
import { openSettings } from './settings-helpers.js';

const musicState = (page) =>
  page.locator('[data-background-music]').evaluate(({ backgroundMusic: music }) => ({
    paused: music.paused,
    loop: music.loop,
    time: music.currentTime,
    duration: music.duration,
    ready: music.ready,
    source: music.source,
    loopStart: music.loopStart,
    loopEnd: music.loopEnd,
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
  await expect.poll(async () => (await musicState(page)).ready).toBe(true);
  await expect.poll(async () => (await musicState(page)).paused).toBe(false);
  const initial = await musicState(page);
  expect(initial.loop).toBe(true);
  expect(initial.time).toBeLessThan(initial.loopStart);
  expect(initial.loopStart).toBeGreaterThan(11);
  expect(initial.loopEnd - initial.loopStart).toBeCloseTo(4495610 / 48000, 6);
  expect(initial.duration).toBeGreaterThan(initial.loopEnd);
  expect(new URL(initial.source).pathname).toBe('/audio/background-music.m4a');
  // Near the loop end, playback returns to the period start, not to the intro.
  await page
    .locator('[data-background-music]')
    .evaluate(({ backgroundMusic: music }) => music.seek(music.loopEnd - 0.15));
  await expect.poll(async () => (await musicState(page)).time).toBeLessThan(initial.loopStart + 3);
  expect((await musicState(page)).time).toBeGreaterThanOrEqual(initial.loopStart);
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
  await expect(page.locator('[data-background-music]')).toHaveCount(0);
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
  await expect(page.locator('[data-background-music]')).toHaveCount(0);
});

test('background pauses music, foreground resumes it, and hands/retry/reset do not duplicate it', async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.musicRelease = { ramps: [], stops: [] };
    const ramp = AudioParam.prototype.linearRampToValueAtTime;
    AudioParam.prototype.linearRampToValueAtTime = function (value, end) {
      if (value === 0) window.musicRelease.ramps.push(end);
      return ramp.call(this, value, end);
    };
    const stop = AudioBufferSourceNode.prototype.stop;
    AudioBufferSourceNode.prototype.stop = function (when = 0) {
      if (this.buffer?.duration > 60) window.musicRelease.stops.push(when);
      return stop.call(this, when);
    };
  });
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
  // Leaving fades to silence on the audio clock and stops only after the fade.
  const release = await page.evaluate(() => window.musicRelease);
  expect(release.ramps.length).toBeGreaterThan(0);
  expect(release.stops.length).toBe(1);
  expect(release.stops[0]).toBeGreaterThan(release.ramps.at(-1));
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
  await expect(page.locator('[data-background-music]')).toHaveCount(1);
  await expect.poll(async () => (await musicState(page)).paused).toBe(false);
});

test('enabling vibration gives one immediate supported-device feedback pulse', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('noir-vibration', 'false');
    window.__vibrationPreviews = [];
    Object.defineProperty(navigator, 'vibrate', {
      configurable: true,
      value: (duration) => {
        window.__vibrationPreviews.push(duration);
        return true;
      },
    });
  });
  await page.goto('/');
  await page.waitForFunction(() => !!window.qa);
  await openSettings(page);
  await page.locator('#vibration-button').click();
  await expect.poll(() => page.evaluate(() => window.__vibrationPreviews)).toEqual([50]);
  await page.locator('#vibration-button').click();
  expect(await page.evaluate(() => window.__vibrationPreviews)).toEqual([50]);
});
