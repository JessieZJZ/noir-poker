import { test, expect } from '@playwright/test';

const readMoods = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('.seat .avatar.has-mood')].map((avatar) => {
      const badge = avatar.querySelector('.mood-badge.mood-live');
      const box = badge.getBoundingClientRect(),
        face = avatar.getBoundingClientRect();
      return {
        mood: [...avatar.classList].find((name) => name.startsWith('mood-')),
        halo: getComputedStyle(avatar).animationName,
        icon: getComputedStyle(badge).animationName,
        width: box.width,
        topLeft: box.left < face.left && box.top < face.top,
      };
    }),
  );

test('each emotion animates its own halo and a legible badge on the avatar', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.waitForFunction(() => !!window.qa);
  await page.evaluate(() => window.qa.moods(5));
  const moods = await readMoods(page);
  expect(moods.map(({ mood, halo, icon }) => [mood, halo, icon])).toEqual([
    ['mood-frustrated', 'mood-halo-flame', 'mood-icon-flame'],
    ['mood-cautious', 'mood-halo-breathe', 'mood-icon-breathe'],
    ['mood-confident', 'mood-halo-shimmer', 'mood-icon-star'],
    ['mood-reactive', 'mood-halo-flash', 'mood-icon-jolt'],
  ]);
  for (const mood of moods) {
    // Sized from the avatar so the scaled arena keeps it legible on phones.
    expect(mood.width).toBeGreaterThanOrEqual(16);
    expect(mood.topLeft).toBe(true);
  }
  // The Settings legend shows the same icons without motion.
  await page.locator('#opponents-button').click();
  expect(
    await page
      .locator('.mood-legend .mood-badge')
      .evaluateAll((badges) => badges.map((badge) => getComputedStyle(badge).animationName)),
  ).toEqual(['none', 'none', 'none', 'none']);
});

test('reduced motion keeps a still halo and badge for every emotion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.waitForFunction(() => !!window.qa);
  await page.evaluate(() => window.qa.moods(5));
  for (const mood of await readMoods(page)) {
    expect([mood.halo, mood.icon]).toEqual(['none', 'none']);
    expect(mood.width).toBeGreaterThan(0);
  }
});
