import { test, expect } from '@playwright/test';
import { openSettings, closeSettings } from './settings-helpers.js';

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.waitForFunction(() => !!window.qa);
  await page.evaluate(() => {
    window.qa.stop();
    return document.fonts.ready;
  });
});

async function expectReadableTable(page, { publicWidth, heroWidth }) {
  await expect
    .poll(() =>
      page.evaluate(
        ({ publicWidth, heroWidth }) => {
          const box = (el) => el.getBoundingClientRect(),
            compact = innerWidth <= 900,
            bounds = box(document.querySelector(compact ? '.table-viewport' : '#arena')),
            publicCards = [...document.querySelectorAll('#board > .playing-card')],
            heroCards = [...document.querySelectorAll('#hero-cards > .playing-card')],
            profiles = [...document.querySelectorAll('.seat-profile')],
            overlap = (a, b) =>
              a.left < b.right - 0.5 &&
              a.right > b.left + 0.5 &&
              a.top < b.bottom - 0.5 &&
              a.bottom > b.top + 0.5,
            issues = [];
          for (const [cards, minimum, label] of [
            [publicCards, publicWidth, 'public'],
            [heroCards, heroWidth, 'hero'],
          ]) {
            if (!cards.length) issues.push(`${label} cards missing`);
            for (const card of cards) {
              const r = box(card);
              if (r.width < minimum - 0.5)
                issues.push(`${label} width ${r.width.toFixed(1)} below ${minimum}`);
              if (r.left < bounds.left - 1 || r.right > bounds.right + 1)
                issues.push(`${label} outside table width`);
              if (r.top < bounds.top - 1 || r.bottom > bounds.bottom + 1)
                issues.push(`${label} outside table height`);
              if (profiles.some((profile) => overlap(r, box(profile))))
                issues.push(`${label} overlaps a seat profile`);
            }
          }
          for (const seat of document.querySelectorAll('.seat')) {
            const profile = box(seat.querySelector('.seat-profile'));
            for (const back of seat.querySelectorAll('.card-back')) {
              const r = box(back);
              if (getComputedStyle(back.parentElement).display === 'none' || r.width < 15)
                issues.push(`seat ${seat.dataset.player} card back hidden`);
              // Card backs intentionally tuck behind their own profile. The
              // visible strip above it must remain large enough to identify.
              if (profile.top - r.top < 8)
                issues.push(`seat ${seat.dataset.player} card back entirely covered`);
              if (r.top < bounds.top - 1 || r.left < bounds.left - 1 || r.right > bounds.right + 1)
                issues.push(`seat ${seat.dataset.player} card back clipped`);
              if (publicCards.some((card) => overlap(r, box(card))))
                issues.push(`seat ${seat.dataset.player} card back overlaps public cards`);
              if (
                profiles.some(
                  (other) =>
                    other !== seat.querySelector('.seat-profile') && overlap(r, box(other)),
                )
              )
                issues.push(`seat ${seat.dataset.player} card back overlaps another profile`);
            }
          }
          if (document.documentElement.scrollWidth > innerWidth)
            issues.push('page overflows horizontally');
          if (issues.length) {
            const arena = document.querySelector('#arena');
            issues.push(
              `layout ${innerWidth}x${innerHeight}, ${arena.dataset.playerCount} players, arena ${arena.offsetWidth}x${arena.offsetHeight}, fit ${getComputedStyle(arena).transform}`,
            );
          }
          return issues;
        },
        { publicWidth, heroWidth },
      ),
    )
    .toEqual([]);
}

test('5–9 player live hands keep visible card backs and readable cards at narrow layout boundaries', async ({
  page,
}) => {
  test.setTimeout(90000);
  await openSettings(page);
  await page.locator('#mix-opponents').click();
  await closeSettings(page);
  for (const size of [
    { width: 360, height: 900, publicWidth: 31, heroWidth: 44 },
    { width: 390, height: 844, publicWidth: 31, heroWidth: 44 },
    { width: 700, height: 1000, publicWidth: 49, heroWidth: 61 },
    { width: 900, height: 1000, publicWidth: 49, heroWidth: 61 },
    { width: 901, height: 1000, publicWidth: 50, heroWidth: 60 },
    { width: 1124, height: 1446, publicWidth: 50, heroWidth: 60 },
  ]) {
    await page.setViewportSize({ width: size.width, height: size.height });
    for (const count of [5, 6, 7, 8, 9]) {
      await page.evaluate((count) => window.qa.publicBoard(count), count);
      await expect(page.locator('.seat .card-back')).toHaveCount((count - 1) * 2);
      await expect(page.locator('#board > .playing-card')).toHaveCount(3);
      await expectReadableTable(page, size);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.qa.publicBoard(9));
  await page.locator('.game-surface').screenshot({
    path: test.info().outputPath('nine-seat-readable-mobile.png'),
  });
});

test('shrinking and expanding a settled table preserves folded card backs and peeked hands', async ({
  page,
}) => {
  test.setTimeout(90000);
  for (const count of [5, 6, 7, 8, 9]) {
    await page.setViewportSize({ width: 1124, height: 1446 });
    await page.evaluate(
      (count) =>
        window.qa.scene('3s 8h', 'Ks 7s Jd 5c 9s', {
          count,
          folded: Array.from({ length: count - 2 }, (_, index) => index + 1),
          otherHoles: { [count - 1]: 'As 8s' },
        }),
      count,
    );
    for (const width of [900, 700, 390, 360, 901, 1124]) {
      await page.setViewportSize({ width, height: width <= 390 ? 900 : 1446 });
      await expect(page.locator('.seat .card-back')).toHaveCount((count - 2) * 2);
      await expectReadableTable(page, {
        publicWidth: width <= 390 ? 31 : width <= 900 ? 49 : 50,
        heroWidth: width <= 390 ? 44 : width <= 900 ? 61 : 60,
      });
      await page.locator('.seat-1 .seat-peek').click();
      await expect(page.locator('.seat-1 .card-back')).toHaveCount(0);
      await expect(page.locator('.seat-1 .playing-card.small')).toHaveCount(2);
      await expectReadableTable(page, {
        publicWidth: width <= 390 ? 31 : width <= 900 ? 49 : 50,
        heroWidth: width <= 390 ? 44 : width <= 900 ? 61 : 60,
      });
      await page.locator('.seat-1 .seat-peek').click();
      await expect(page.locator('.seat-1 .card-back')).toHaveCount(2);
    }
  }
});

test('overflowing compact hints loop automatically and stay long enough to read before expiring', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
  await page.reload();
  await page.waitForFunction(() => !!window.qa);
  await page.evaluate(() => {
    window.qa.stop();
    return document.fonts.ready;
  });
  await page.clock.pauseAt(new Date('2026-01-01T00:00:01Z'));
  await page.evaluate(() => window.qa.heroTurn(9));
  const banner = page.locator('#coach-content');
  await expect(banner).toBeVisible();
  await expect(banner).toHaveAttribute('data-scrolling', 'true');
  await expect(banner.locator('.hint-marquee-copy')).toHaveAttribute('aria-hidden', 'true');
  const duration = Number(await banner.getAttribute('data-hint-duration')),
    text = await page.locator('#coach-tip').textContent();
  expect(duration).toBeGreaterThanOrEqual(18000);
  await page.clock.runFor(1200);
  const initial = await page.locator('.table-viewport').boundingBox();
  const samples = [];
  // Observe real native scroll positions throughout the banner's lifetime:
  // advancing text and a wrap to the next copy prove a repeating animation.
  for (let step = 0; step < 20; step++) {
    await page.clock.runFor(Math.floor((duration - 1202) / 20));
    samples.push(await banner.evaluate((el) => el.scrollLeft));
    await expect(banner).toBeVisible();
  }
  expect(Math.max(...samples) - Math.min(...samples)).toBeGreaterThan(50);
  expect(samples.some((value, index) => index > 0 && value < samples[index - 1] - 20)).toBe(true);
  expect(await page.locator('#coach-tip').textContent()).toBe(text);
  expect(await page.locator('.table-viewport').boundingBox()).toEqual(initial);
  await page.clock.runFor(22);
  await expect(banner).toBeHidden();
  await page.locator('[data-preset="half"]').click();
  await expect(banner).toBeHidden();
});

test('reduced-motion hints retain manual keyboard scrolling without moving the table', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.qa.heroTurn(9));
  const banner = page.locator('#coach-content');
  await expect(banner).toBeVisible();
  await expect(banner).toHaveAttribute('data-scrolling', 'false');
  await expect(banner.locator('.hint-marquee-copy')).toBeHidden();
  const initial = await page.locator('.table-viewport').boundingBox();
  await banner.focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => banner.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
  await page.waitForTimeout(300);
  const manualPosition = await banner.evaluate((el) => el.scrollLeft);
  await page.waitForTimeout(300);
  expect(await banner.evaluate((el) => el.scrollLeft)).toBe(manualPosition);
  expect(await page.locator('.table-viewport').boundingBox()).toEqual(initial);
  await page.setViewportSize({ width: 901, height: 1000 });
  await expect(page.locator('#coach-desktop-card #coach-content')).toBeVisible();
  await expect(banner).toHaveAttribute('data-scrolling', 'false');
  await expect(banner.locator('.hint-marquee-copy')).toBeHidden();
});
