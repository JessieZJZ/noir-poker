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
            compact = matchMedia(
              '(max-width: 900px), (max-width: 1100px) and (orientation: portrait)',
            ).matches,
            bounds = box(document.querySelector(compact ? '.table-viewport' : '#arena')),
            arena = document.querySelector('#arena'),
            scale = box(arena).width / arena.offsetWidth,
            publicPositions = [...document.querySelector('#board').children],
            publicCards = [...document.querySelectorAll('#board > .playing-card')],
            heroCards = [...document.querySelectorAll('#hero-cards > .playing-card')],
            profiles = [...document.querySelectorAll('.seat-profile')],
            overlap = (a, b) =>
              a.left < b.right - 0.5 &&
              a.right > b.left + 0.5 &&
              a.top < b.bottom - 0.5 &&
              a.bottom > b.top + 0.5,
            issues = [];
          if (publicPositions.length !== 5) issues.push('public positions changed during the hand');
          for (const [index, position] of publicPositions.entries()) {
            if (publicPositions.slice(index + 1).some((next) => overlap(box(position), box(next))))
              issues.push('public card faces or empty positions overlap');
          }
          const publicRows = publicPositions.reduce((rows, position) => {
            const top = box(position).top;
            const row = rows.find((row) => Math.abs(row.top - top) < 1);
            if (row) row.count++;
            else rows.push({ top, count: 1 });
            return rows;
          }, []);
          const expectedRows = arena.classList.contains('public-two-rows') ? [3, 2] : [5];
          if (JSON.stringify(publicRows.map((row) => row.count)) !== JSON.stringify(expectedRows))
            issues.push(
              `public rows ${publicRows.map((row) => row.count)} instead of ${expectedRows}`,
            );
          for (const [cards, minimum, label] of [
            [publicCards, publicWidth, 'public'],
            [heroCards, heroWidth, 'hero'],
          ]) {
            if (!cards.length) issues.push(`${label} cards missing`);
            for (const card of cards) {
              const r = box(card),
                faceWidth = card.offsetWidth * scale;
              // A tilted card's bounding box grows horizontally. Measure its
              // actual face instead, so tilting cannot hide a readability loss.
              if (faceWidth < minimum - 0.5)
                issues.push(`${label} face width ${faceWidth.toFixed(1)} below ${minimum}`);
              if (r.left < bounds.left - 1 || r.right > bounds.right + 1)
                issues.push(`${label} outside table width`);
              if (r.top < bounds.top - 1 || r.bottom > bounds.bottom + 1)
                issues.push(`${label} outside table height`);
              if (profiles.some((profile) => overlap(r, box(profile))))
                issues.push(`${label} overlaps a seat profile`);
              if (label === 'public') {
                const laterCards = [...card.parentElement.children].slice(
                  [...card.parentElement.children].indexOf(card) + 1,
                );
                for (const feature of card.querySelectorAll(
                  '.card-art > text, .card-art > g > text, .card-art > .card-suit-icon',
                )) {
                  const mark = box(feature);
                  if (mark.width === 0 || mark.height === 0)
                    issues.push('public rank or suit hidden');
                  if (
                    mark.left < r.left - 1 ||
                    mark.right > r.right + 1 ||
                    mark.top < r.top - 1 ||
                    mark.bottom > r.bottom + 1
                  )
                    issues.push('public rank or suit clipped by its card');
                  if (laterCards.some((next) => overlap(mark, box(next))))
                    issues.push('public rank or suit covered by the next card');
                }
              }
            }
          }
          for (const seat of document.querySelectorAll('.seat')) {
            const profile = box(seat.querySelector('.seat-profile'));
            for (const back of seat.querySelectorAll('.card-back')) {
              const r = box(back),
                style = getComputedStyle(back),
                parentStyle = getComputedStyle(back.parentElement);
              if (
                parentStyle.display === 'none' ||
                style.visibility !== 'visible' ||
                parentStyle.visibility !== 'visible' ||
                Number(style.opacity) === 0 ||
                Number(parentStyle.opacity) === 0 ||
                r.width < 15
              )
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
    { width: 320, height: 900, publicWidth: 31, heroWidth: 44 },
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

test('five-player side seats surround the waist with half card backs and a readable balanced tag', async ({
  page,
}) => {
  for (const size of [
    { width: 375, height: 667 },
    { width: 440, height: 956 },
    { width: 768, height: 1024 },
    { width: 1280, height: 900 },
  ]) {
    await page.setViewportSize(size);
    await page.evaluate(() => window.qa.heroTurn(5));
    await expect
      .poll(() =>
        page.evaluate(() => {
          const arena = document.querySelector('#arena'),
            scale = new DOMMatrix(getComputedStyle(arena).transform).a,
            felt = document.querySelector('.table-inner').getBoundingClientRect(),
            problems = [];
          for (const id of [1, 4]) {
            const seat = document.querySelector(`.seat-${id}`),
              profile = seat.querySelector('.seat-profile').getBoundingClientRect(),
              y = ((profile.top + profile.bottom) / 2 - felt.top) / felt.height;
            if (y < 0.4 || y > 0.62) problems.push(`side seat ${id} is outside the waist`);
          }
          for (const seat of document.querySelectorAll('.seat')) {
            const profile = seat.querySelector('.seat-profile').getBoundingClientRect();
            for (const back of seat.querySelectorAll('.card-back')) {
              const r = back.getBoundingClientRect(),
                visible = (profile.top - r.top) / r.height;
              if (visible < 0.4 || visible > 0.65)
                problems.push(`seat ${seat.dataset.player} shows ${visible} of the card back`);
              const point = document.elementFromPoint((r.left + r.right) / 2, profile.top + 2);
              if (!point || !seat.querySelector('.seat-profile').contains(point))
                problems.push(`seat ${seat.dataset.player} card back is in front of the profile`);
            }
            const tag = seat.querySelector('[data-style-profile="balanced"]');
            if (!tag) continue;
            const r = tag.getBoundingClientRect();
            if (
              r.width < 26 * scale - 0.5 ||
              r.height < 14 * scale - 0.5 ||
              tag.scrollWidth > tag.clientWidth
            )
              problems.push(`seat ${seat.dataset.player} balanced tag is too small or clipped`);
          }
          const hero = document.querySelector('#hero-cards > .playing-card');
          if (innerWidth === 440 && (hero.offsetWidth > 68 || hero.offsetHeight > 98))
            problems.push('hero cards are larger than the requested compact size');
          return problems;
        }),
      )
      .toEqual([]);
    // Full revealed faces use the same slot and stay wholly above the profile.
    await page.evaluate(() => window.qa.scene('3s 8h', 'Ks 7s Jd 5c 9s', { count: 5 }));
    for (const seat of await page.locator('.seat:has(.revealed-cards)').all()) {
      const profile = await seat.locator('.seat-profile').boundingBox();
      for (const card of await seat.locator('.playing-card').all()) {
        const r = await card.boundingBox();
        expect(r.y + r.height).toBeLessThanOrEqual(profile.y + 0.5);
      }
    }
  }
});

test('inspection follows the position badge and crown JJ keep clear of the hint edge without a refit', async ({
  page,
}) => {
  test.setTimeout(60000);
  for (const size of [
    { width: 320, height: 667 },
    { width: 375, height: 667 },
    { width: 440, height: 956 },
    { width: 820, height: 1180 },
    { width: 1280, height: 900 },
  ]) {
    await page.setViewportSize(size);
    for (const count of [5, 9]) {
      await page.evaluate((count) => window.qa.heroTurn(count), count);
      const before = await page
        .locator('.seat-inspect-slot')
        .evaluateAll((rows) =>
          rows.map((row) => ({ width: row.offsetWidth, height: row.offsetHeight })),
        );
      await page.evaluate(
        (count) =>
          window.qa.scene('2h 3h', 'Ks Kh 9s 7c 6d', {
            count,
            otherHoles: { [count === 5 ? 2 : 4]: 'Jh Jd' },
          }),
        count,
      );
      await expect
        .poll(() =>
          page.evaluate(() => {
            const bounds = document.querySelector('.table-viewport').getBoundingClientRect(),
              scale = new DOMMatrix(getComputedStyle(document.querySelector('#arena')).transform).a,
              issues = [];
            for (const seat of document.querySelectorAll('.seat')) {
              const eye = seat.querySelector('.seat-peek'),
                e = eye.getBoundingClientRect(),
                badge = seat.querySelector('.position-badge').getBoundingClientRect(),
                profile = seat.querySelector('.seat-profile').getBoundingClientRect();
              if (eye.parentElement.previousElementSibling?.className !== 'position-badge')
                issues.push('eye does not immediately follow the position badge');
              if (
                e.left < badge.right - 0.5 ||
                Math.abs(e.top + e.bottom - badge.top - badge.bottom) > 1
              )
                issues.push('eye is outside the identity row');
              if (
                e.left < profile.left ||
                e.right > profile.right ||
                e.top < profile.top ||
                e.bottom > profile.bottom
              )
                issues.push('eye escapes the profile');
              if (
                document
                  .elementFromPoint((e.left + e.right) / 2, (e.top + e.bottom) / 2)
                  ?.closest('.seat-peek') !== eye
              )
                issues.push('eye is covered by another player part');
              if (seat.classList.contains('seat-crown'))
                for (const card of seat.querySelectorAll('.playing-card'))
                  if (card.getBoundingClientRect().top < bounds.top + 10 * scale - 0.5)
                    issues.push('crown hand touches the hint edge');
            }
            return issues;
          }),
        )
        .toEqual([]);
      const after = await page
        .locator('.seat-inspect-slot')
        .evaluateAll((rows) =>
          rows.map((row) => ({ width: row.offsetWidth, height: row.offsetHeight })),
        );
      expect(after).toEqual(before);
      const frame = await page.locator('#arena').boundingBox();
      await page.locator('.seat-crown .seat-peek').first().click();
      await page.locator('.seat-crown .seat-peek').first().click();
      expect(await page.locator('#arena').boundingBox()).toEqual(frame);
    }
  }
  await page
    .locator('.game-surface')
    .screenshot({ path: test.info().outputPath('inspection-in-position-row.png') });
});

test('all five public positions retain the same rows and face sizes while dealing each street', async ({
  page,
}) => {
  test.setTimeout(90000);
  const positions = () =>
    page.locator('#board').evaluate((board) =>
      [...board.children].map((card) => ({
        x: card.offsetLeft - board.offsetLeft,
        y: card.offsetTop - board.offsetTop,
        width: card.offsetWidth,
        height: card.offsetHeight,
      })),
    );
  for (const width of [320, 375, 390, 420, 421, 440, 600, 601]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const count of [5, 9]) {
      await page.evaluate((count) => window.qa.heroTurn(count), count);
      await expect(page.locator('#board > .board-slot')).toHaveCount(5);
      const initial = await positions();
      const expectedWidth = Math.round(
        width <= 600 ? Math.max(44, Math.min(54, width * 0.12)) : 82,
      );
      expect(initial.map((card) => card.width)).toEqual(Array(5).fill(expectedWidth));
      const rows = initial.reduce((rows, card) => {
        const row = rows.find((row) => row.y === card.y);
        if (row) row.count++;
        else rows.push({ y: card.y, count: 1 });
        return rows;
      }, []);
      const twoRows = await page
        .locator('#arena')
        .evaluate((arena) => arena.classList.contains('public-two-rows'));
      expect(rows.map((row) => row.count)).toEqual(twoRows ? [3, 2] : [5]);
      await page.evaluate((count) => window.qa.publicBoard(count), count);
      for (const dealt of [3, 4, 5]) {
        await expect(page.locator('#board > .playing-card')).toHaveCount(dealt);
        await expect.poll(positions).toEqual(initial);
        if (dealt < 5)
          await page.evaluate(() => {
            window.qa.checkRest();
            window.qa.finish();
          });
      }
    }
  }
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
    for (const width of [900, 700, 390, 360, 320, 901, 1124]) {
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
  // Font loading can outlast the fixed clock origin. Freeze in the future
  // before creating the hint whose lifetime is measured below.
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 60_000));
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
  await expect(page.locator('.surface-top #coach-content')).toBeVisible();
  await page.setViewportSize({ width: 1101, height: 1000 });
  await expect(page.locator('#coach-desktop-card #coach-content')).toBeVisible();
  await expect(banner).toHaveAttribute('data-scrolling', 'false');
  await expect(banner.locator('.hint-marquee-copy')).toBeHidden();
});
